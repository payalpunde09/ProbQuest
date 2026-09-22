import * as THREE from 'three';

/**
 * ============================================================================
 * DESKTOP CONTROLS & POINTER LOCK
 * ============================================================================
 * Provides WASD keyboard movement, mouse look (FPS Pointer Lock), and
 * mouse-based raycasting for the floating holographic UI.
 */
export class DesktopControls {
  constructor(camera, domElement, handUI, interactionManager) {
    this.camera = camera;
    this.domElement = domElement;
    this.handUI = handUI;
    this.interactionManager = interactionManager;

    this.enabled = false;
    this.isLocked = false;

    // Movement state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
    };

    this.velocity = new THREE.Vector3();
    this.moveSpeed = 3.6; // Meters per sec
    this.sprintMultiplier = 1.6;

    // Look angles (Pitch & Yaw)
    this.yaw = 0;
    this.pitch = 0;
    this.lookSensitivity = 0.0022;

    // Raycaster for mouse interaction
    this.raycaster = new THREE.Raycaster();
    this.mouseCoords = new THREE.Vector2(0, 0); // Center of screen when locked

    // HUD elements
    this.hudElement = document.getElementById('desktop-hud');
    this.crosshair = document.getElementById('crosshair');

    this.setupListeners();
  }

  setupListeners() {
    // Keyboard handlers
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Pointer Lock events
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      if (this.hudElement) {
        this.hudElement.style.display = this.isLocked ? 'block' : 'none';
      }
    });

    // Mouse movement & dragging
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });
  }

  enable() {
    this.enabled = true;
    if (this.hudElement) {
      this.hudElement.style.display = 'block';
    }
    // Keep cursor free and visible so user can directly click UI buttons
    document.body.style.cursor = 'default';
  }

  disable() {
    this.enabled = false;
    this.isDragging = false;
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
    if (this.hudElement) {
      this.hudElement.style.display = 'none';
    }
    document.body.style.cursor = 'default';
  }

  teleport(x, y, z, rotY = 0) {
    this.camera.position.set(x, y, z);
    this.yaw = rotY;
    this.pitch = 0;
    this.updateCameraRotation();
  }

  onKeyDown(e) {
    if (!this.enabled) return;

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = true;
        break;
      case 'KeyM':
        this.handUI.getMesh().visible = !this.handUI.getMesh().visible;
        break;
      case 'Escape':
        // If inside a sub-menu, go back to main menu
        if (this.handUI.currentView !== 'MAIN') {
          this.handUI.setView('MAIN');
        } else if (this.isLocked) {
          document.exitPointerLock();
        }
        break;
    }
  }

  onKeyUp(e) {
    if (!this.enabled) return;

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = false;
        break;
    }
  }

  onMouseMove(e) {
    if (!this.enabled) return;

    if (this.isLocked) {
      // Rotate camera in pointer lock mode
      this.yaw -= e.movementX * this.lookSensitivity;
      this.pitch -= e.movementY * this.lookSensitivity;
      this.pitch = Math.max(-Math.PI * 0.44, Math.min(Math.PI * 0.44, this.pitch));
      this.updateCameraRotation();
      this.mouseCoords.set(0, 0);
    } else {
      // Free cursor mode
      this.mouseCoords.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseCoords.y = -(e.clientY / window.innerHeight) * 2 + 1;

      // Drag to rotate camera when holding right-click or drag on background
      if (this.isDragging) {
        this.yaw -= e.movementX * this.lookSensitivity;
        this.pitch -= e.movementY * this.lookSensitivity;
        this.pitch = Math.max(-Math.PI * 0.44, Math.min(Math.PI * 0.44, this.pitch));
        this.updateCameraRotation();
      }
    }

    this.checkUIRaycast();
  }

  updateCameraRotation() {
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.x = this.pitch;
    euler.y = this.yaw;
    this.camera.quaternion.setFromEuler(euler);
  }

  onMouseDown(e) {
    if (!this.enabled) return;

    if (e.button === 0) { // Left click
      // Sync click coordinates
      if (!this.isLocked) {
        this.mouseCoords.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouseCoords.y = -(e.clientY / window.innerHeight) * 2 + 1;
      }

      // Check if clicking an active UI button
      this.checkUIRaycast();
      const clicked = this.interactionManager.triggerClick();
      if (clicked) {
        this.handUI.requestRedraw();
        return; // Button clicked and executed!
      }

      // If clicked on 3D background, start drag look
      this.isDragging = true;
    } else if (e.button === 2) { // Right click
      this.isDragging = true;
    }
  }

  onMouseUp() {
    this.isDragging = false;
  }

  checkUIRaycast() {
    const interactiveMesh = this.handUI.getInteractiveMesh();
    if (!interactiveMesh || !this.handUI.getMesh().visible) return;

    this.raycaster.setFromCamera(this.mouseCoords, this.camera);
    const intersects = this.raycaster.intersectObject(interactiveMesh, false);

    if (intersects.length > 0) {
      const uv = intersects[0].uv;
      const { changed, hoveredBtn } = this.interactionManager.testHit(uv);
      if (changed) {
        this.handUI.requestRedraw();
      }
      if (this.crosshair) {
        this.crosshair.classList.toggle('hovering', !!hoveredBtn);
      }
      document.body.style.cursor = hoveredBtn ? 'pointer' : 'default';
    } else {
      const { changed } = this.interactionManager.testHit(null);
      if (changed) {
        this.handUI.requestRedraw();
      }
      if (this.crosshair) {
        this.crosshair.classList.remove('hovering');
      }
      document.body.style.cursor = 'default';
    }
  }

  update(delta) {
    if (!this.enabled) return;

    // Movement calculation
    const moveDir = new THREE.Vector3();
    if (this.keys.forward) moveDir.z -= 1;
    if (this.keys.backward) moveDir.z += 1;
    if (this.keys.left) moveDir.x -= 1;
    if (this.keys.right) moveDir.x += 1;

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();

      // Apply yaw rotation (horizontal plane movement)
      const moveQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.yaw
      );
      moveDir.applyQuaternion(moveQuat);

      const speed = this.moveSpeed * (this.keys.sprint ? this.sprintMultiplier : 1.0);
      this.camera.position.addScaledVector(moveDir, speed * delta);
    }

    // Continuously check UI raycast during look updates
    this.checkUIRaycast();
  }
}
