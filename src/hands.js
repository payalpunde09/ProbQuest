import * as THREE from 'three';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';

/**
 * ============================================================================
 * WEBXR HAND TRACKING & PINCH INTERACTION
 * ============================================================================
 * Manages:
 * - Real WebXR tracked joint hands (Wrist, Palm, Thumb, Index, Middle, Ring, Little)
 * - 3D procedural joint spheres for all 25 hand joints on left and right hands
 * - Left wrist tracking for the Hand-attached holographic UI
 * - Right hand pointing ray and index-to-thumb pinch detection
 */
export class HandTracker {
  constructor(renderer, scene, playerRig, handUI, interactionManager) {
    this.renderer = renderer;
    this.scene = scene;
    this.playerRig = playerRig || scene;
    this.handUI = handUI;
    this.interactionManager = interactionManager;

    this.handModelFactory = new XRHandModelFactory();

    // Hand references
    this.handLeft = null;
    this.handRight = null;
    this.controllerLeft = null;
    this.controllerRight = null;

    // Custom 3D joint node visualizers
    this.leftJointVisuals = new Map();
    this.rightJointVisuals = new Map();

    // Raycaster for right-hand pointing at the left wrist UI
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 2.0;

    // Pinch state machine
    this.isPinching = false;
    this.pinchThreshold = 0.025; // 2.5 cm
    this.pinchReleaseThreshold = 0.035; // 3.5 cm

    // Left wrist transform cache
    this.leftWristTransform = {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      isTracked: false,
    };

    // Right pointing ray visuals
    this.createPointingRayVisuals();

    this.setupHands();
  }

  setupHands() {
    // Setup Controllers (for grip and pointer fallback)
    this.controllerLeft = this.renderer.xr.getController(0);
    this.controllerRight = this.renderer.xr.getController(1);
    this.playerRig.add(this.controllerLeft);
    this.playerRig.add(this.controllerRight);

    // Setup Tracked Hands
    this.handLeft = this.renderer.xr.getHand(0);
    this.handRight = this.renderer.xr.getHand(1);

    // 1. Add WebXR Hand Primitive Models ('spheres' profile - reliable & offline)
    try {
      const leftModel = this.handModelFactory.createHandModel(this.handLeft, 'spheres');
      this.handLeft.add(leftModel);

      const rightModel = this.handModelFactory.createHandModel(this.handRight, 'spheres');
      this.handRight.add(rightModel);
    } catch (err) {
      console.warn('[HandTracker] XRHandModelFactory spheres load notice:', err);
    }

    // 2. Add Custom Energy Joint Spheres for all 25 joints
    this.createJointVisualizers(this.handLeft, this.leftJointVisuals, 0x00f0ff);
    this.createJointVisualizers(this.handRight, this.rightJointVisuals, 0xa855f7);

    this.playerRig.add(this.handLeft);
    this.playerRig.add(this.handRight);

    // Controller select listeners as fallback
    this.controllerRight.addEventListener('selectstart', () => this.onPinchDown());
    this.controllerRight.addEventListener('selectend', () => this.onPinchUp());

    this.handLeft.addEventListener('connected', (e) => console.log('[HandTracker] Left hand connected:', e.data));
    this.handRight.addEventListener('connected', (e) => console.log('[HandTracker] Right hand connected:', e.data));
  }

  createJointVisualizers(handGroup, visualMap, colorHex) {
    const jointGeo = new THREE.SphereGeometry(0.007, 12, 12);
    const tipGeo = new THREE.SphereGeometry(0.009, 12, 12);

    const jointMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.85,
    });
    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
    });

    const jointNames = [
      'wrist',
      'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
      'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
      'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
      'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
      'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'
    ];

    jointNames.forEach((name) => {
      const isTip = name.endsWith('-tip');
      const mesh = new THREE.Mesh(isTip ? tipGeo : jointGeo, isTip ? tipMat : jointMat);
      mesh.visible = false;
      handGroup.add(mesh);
      visualMap.set(name, mesh);
    });
  }

  createPointingRayVisuals() {
    // Holographic laser beam for right hand pointing
    const rayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const rayMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.75,
      linewidth: 2,
    });
    this.rayLine = new THREE.Line(rayGeo, rayMat);
    this.rayLine.name = 'RightPointingRay';
    this.rayLine.visible = false;
    this.scene.add(this.rayLine);

    // Laser cursor dot at intersection
    const dotGeo = new THREE.SphereGeometry(0.007, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95,
    });
    this.hitCursor = new THREE.Mesh(dotGeo, dotMat);
    this.hitCursor.visible = false;
    this.scene.add(this.hitCursor);
  }

  /**
   * Called every VR animation frame
   */
  update(delta) {
    this.updateJointPositions(this.handLeft, this.leftJointVisuals);
    this.updateJointPositions(this.handRight, this.rightJointVisuals);

    this.updateLeftWrist();
    this.updateRightPointingAndPinch();
  }

  updateJointPositions(handGroup, visualMap) {
    if (!handGroup || !handGroup.joints) return;

    visualMap.forEach((mesh, name) => {
      const joint = handGroup.joints[name];
      if (joint && joint.visible) {
        mesh.position.copy(joint.position);
        mesh.quaternion.copy(joint.quaternion);
        mesh.visible = true;
      } else {
        mesh.visible = false;
      }
    });
  }

  /**
   * Tracks Left Wrist joint accurately for HandUI attachment
   */
  updateLeftWrist() {
    let tracked = false;

    // 1. Try actual tracked WebXR hand wrist joint
    if (this.handLeft && this.handLeft.joints) {
      const wristJoint = this.handLeft.joints['wrist'];
      if (wristJoint && wristJoint.visible) {
        wristJoint.getWorldPosition(this.leftWristTransform.position);
        wristJoint.getWorldQuaternion(this.leftWristTransform.quaternion);
        tracked = true;
      }
    }

    // 2. Fallback to left controller grip
    if (!tracked && this.controllerLeft) {
      this.controllerLeft.getWorldPosition(this.leftWristTransform.position);
      this.controllerLeft.getWorldQuaternion(this.leftWristTransform.quaternion);
      tracked = true;
    }

    this.leftWristTransform.isTracked = tracked;
  }

  getLeftWristTransform() {
    return this.leftWristTransform.isTracked ? this.leftWristTransform : null;
  }

  /**
   * Tracks Right Hand index ray and index-to-thumb pinch
   */
  updateRightPointingAndPinch() {
    const interactiveMesh = this.handUI.getInteractiveMesh();
    if (!interactiveMesh || !this.handUI.getMesh().visible) {
      this.rayLine.visible = false;
      this.hitCursor.visible = false;
      return;
    }

    const rayOrigin = new THREE.Vector3();
    const rayDir = new THREE.Vector3();
    let hasRay = false;

    // Check if right index finger tip is available
    if (this.handRight && this.handRight.joints) {
      const indexTip = this.handRight.joints['index-finger-tip'];
      const indexPhalanx = this.handRight.joints['index-finger-phalanx-proximal'];
      const thumbTip = this.handRight.joints['thumb-tip'];

      if (indexTip && indexTip.visible) {
        indexTip.getWorldPosition(rayOrigin);

        if (indexPhalanx && indexPhalanx.visible) {
          const phalanxPos = new THREE.Vector3();
          indexPhalanx.getWorldPosition(phalanxPos);
          rayDir.subVectors(rayOrigin, phalanxPos).normalize();
        } else {
          this.handRight.getWorldDirection(rayDir).negate();
        }
        hasRay = true;

        // Calculate index-to-thumb distance for pinch detection
        if (thumbTip && thumbTip.visible) {
          const thumbPos = new THREE.Vector3();
          thumbTip.getWorldPosition(thumbPos);
          const pinchDistance = rayOrigin.distanceTo(thumbPos);

          if (!this.isPinching && pinchDistance < this.pinchThreshold) {
            this.onPinchDown();
          } else if (this.isPinching && pinchDistance > this.pinchReleaseThreshold) {
            this.onPinchUp();
          }
        }
      }
    }

    // Fallback to right controller ray
    if (!hasRay && this.controllerRight) {
      this.controllerRight.getWorldPosition(rayOrigin);
      this.controllerRight.getWorldDirection(rayDir).negate();
      hasRay = true;
    }

    if (!hasRay) {
      this.rayLine.visible = false;
      this.hitCursor.visible = false;
      return;
    }

    // Cast ray to UI panel
    this.raycaster.set(rayOrigin, rayDir);
    const intersects = this.raycaster.intersectObject(interactiveMesh, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const uv = hit.uv;

      const { changed } = this.interactionManager.testHit(uv);
      if (changed) {
        this.handUI.requestRedraw();
      }

      this.rayLine.geometry.setFromPoints([rayOrigin, hit.point]);
      this.rayLine.visible = true;

      this.hitCursor.position.copy(hit.point);
      this.hitCursor.visible = true;

      if (this.isPinching) {
        this.rayLine.material.color.setHex(0xec4899);
        this.hitCursor.material.color.setHex(0xec4899);
      } else {
        this.rayLine.material.color.setHex(0x00f0ff);
        this.hitCursor.material.color.setHex(0x00f0ff);
      }
    } else {
      this.interactionManager.testHit(null);
      const endPoint = rayOrigin.clone().addScaledVector(rayDir, 0.4);
      this.rayLine.geometry.setFromPoints([rayOrigin, endPoint]);
      this.rayLine.visible = true;
      this.rayLine.material.color.setHex(0x38bdf8);
      this.hitCursor.visible = false;
    }
  }

  onPinchDown() {
    this.isPinching = true;
    const clicked = this.interactionManager.triggerClick();
    if (clicked) {
      this.handUI.requestRedraw();
    }
  }

  onPinchUp() {
    this.isPinching = false;
  }
}
