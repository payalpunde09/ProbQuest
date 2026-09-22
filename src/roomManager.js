import * as THREE from 'three';

/**
 * ============================================================================
 * ROOM CONFIGURATION
 * ============================================================================
 * You can manually tweak the coordinates and rotations below anytime.
 * These positions were calibrated directly from the environment GLB nodes.
 */
export const DEFAULT_ROOM_CONFIG = [
  {
    id: 'learning-hub',
    roomName: 'Learning Hub',
    subtitle: 'Central Atrium & Portal Core',
    position: [0, 1.6, 3.3],
    rotation: [0, 0, 0], // Facing North (Z: -1)
    glbNode: 'XR_PLAYER_SPAWN',
    color: '#00f0ff',
  },
  {
    id: 'coin-castle',
    roomName: 'Coin Castle',
    subtitle: 'Coin Flip & Binomial Trials',
    position: [-5.0, 1.6, 9.8],
    rotation: [0, Math.PI, 0], // Facing South towards Coin board
    glbNode: 'Coin_InteractionBase',
    color: '#fbbf24',
  },
  {
    id: 'dice-dungeon',
    roomName: 'Dice Dungeon',
    subtitle: 'Fair & Loaded Polyhedral Rolling',
    position: [5.0, 1.6, 9.8],
    rotation: [0, Math.PI, 0], // Facing South towards Dice board
    glbNode: 'Dice_InteractionBase',
    color: '#f87171',
  },
  {
    id: 'mystery-box',
    roomName: 'Mystery Box',
    subtitle: 'Monty Hall & Hidden Odds',
    position: [-7.6, 1.6, 0.0],
    rotation: [0, Math.PI * 0.5, 0], // Facing West towards Mystery board
    glbNode: 'Mystery_InteractionBase',
    color: '#a855f7',
  },
  {
    id: 'card-room',
    roomName: 'Card Room',
    subtitle: 'Combinatorics & Deck Permutations',
    position: [7.6, 1.6, 0.0],
    rotation: [0, -Math.PI * 0.5, 0], // Facing East towards Card board
    glbNode: 'Card_InteractionBase',
    color: '#38bdf8',
  },
  {
    id: 'challenge-zone',
    roomName: 'Challenge Zone',
    subtitle: 'Theoretical vs Empirical Trials',
    position: [0.0, 1.6, -10.5],
    rotation: [0, 0, 0], // Facing North towards Challenge board
    glbNode: 'Challenge_InteractionBase',
    color: '#34d399',
  },
  {
    id: 'final-probability-gate',
    roomName: 'Final Probability Gate',
    subtitle: 'Corridor to the Grand Chamber',
    position: [0.0, 1.6, -5.5],
    rotation: [0, 0, 0], // Facing North towards the Gate
    glbNode: 'ENTRY_CHALLENGE',
    color: '#c084fc',
  },
  {
    id: 'victory-room',
    roomName: 'Victory Room',
    subtitle: 'Master of Chance & Triumph Altar',
    position: [0.0, 1.6, -13.8],
    rotation: [0, 0, 0], // Facing the Victory Altar
    glbNode: 'Challenge_FeatureBoard',
    color: '#facc15',
  },
];

export class RoomManager {
  constructor() {
    this.rooms = JSON.parse(JSON.stringify(DEFAULT_ROOM_CONFIG));
    this.currentRoomName = 'Learning Hub';
    this.isTransitioning = false;
    this.fadeOverlay = document.getElementById('fade-overlay');
    this.listeners = new Set();

    // Stored player & engine references
    this.playerRig = null;
    this.camera = null;
    this.desktopControls = null;
    this.interactionManager = null;
  }

  setPlayerReferences(refs) {
    if (refs.playerRig) this.playerRig = refs.playerRig;
    if (refs.camera) this.camera = refs.camera;
    if (refs.desktopControls) this.desktopControls = refs.desktopControls;
    if (refs.interactionManager) this.interactionManager = refs.interactionManager;
  }

  /**
   * Inspects the loaded GLB hierarchy and calibrates room positions
   * from actual node transforms if found.
   */
  autoDetectFromGLB(environmentScene) {
    if (!environmentScene) return;

    const detectedNodes = new Map();
    environmentScene.traverse((child) => {
      if (child.name) {
        detectedNodes.set(child.name, child);
      }
    });

    console.log(`[RoomManager] Environment GLB loaded. Found ${detectedNodes.size} named nodes.`);

    this.rooms.forEach((room) => {
      if (room.glbNode && detectedNodes.has(room.glbNode)) {
        const node = detectedNodes.get(room.glbNode);
        const worldPos = new THREE.Vector3();
        node.getWorldPosition(worldPos);

        // Keep a comfortable standing eye-level height (1.6m) above floor
        if (room.id === 'learning-hub') {
          room.position = [worldPos.x, 1.6, worldPos.z];
          room.rotation = [0, 0, 0];
        } else if (room.id === 'coin-castle' || room.id === 'dice-dungeon') {
          // Standing looking towards the feature board
          room.position = [worldPos.x, 1.6, worldPos.z - 1.2];
          room.rotation = [0, Math.PI, 0];
        } else if (room.id === 'mystery-box') {
          room.position = [worldPos.x + 1.4, 1.6, worldPos.z];
          room.rotation = [0, Math.PI * 0.5, 0];
        } else if (room.id === 'card-room') {
          room.position = [worldPos.x - 1.4, 1.6, worldPos.z];
          room.rotation = [0, -Math.PI * 0.5, 0];
        } else if (room.id === 'challenge-zone') {
          room.position = [worldPos.x, 1.6, worldPos.z + 1.5];
          room.rotation = [0, 0, 0];
        } else if (room.id === 'final-probability-gate') {
          room.position = [worldPos.x, 1.6, worldPos.z - 0.5];
          room.rotation = [0, 0, 0];
        } else if (room.id === 'victory-room') {
          room.position = [worldPos.x, 1.6, worldPos.z + 2.0];
          room.rotation = [0, 0, 0];
        }

        console.log(`[RoomManager] Calibrated "${room.roomName}" from node "${room.glbNode}":`, room.position);
      }
    });
  }

  getRooms() {
    return this.rooms;
  }

  getCurrentRoom() {
    return this.rooms.find((r) => r.roomName === this.currentRoomName) || this.rooms[0];
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const cur = this.getCurrentRoom();
    this.listeners.forEach((fn) => fn(cur));
  }

  /**
   * Smooth fade teleportation
   */
  teleportToRoom(roomName, playerRig = null, camera = null, desktopControls = null, onComplete = null) {
    if (this.isTransitioning) return;

    const targetRoom = this.rooms.find(
      (r) => r.roomName.toLowerCase() === roomName.toLowerCase() || r.id === roomName
    );
    if (!targetRoom) {
      console.warn(`[RoomManager] Room "${roomName}" not found.`);
      return;
    }

    this.isTransitioning = true;
    console.log(`[RoomManager] Teleporting to "${targetRoom.roomName}" at`, targetRoom.position);

    const rig = playerRig || this.playerRig;
    const cam = camera || this.camera;
    const ctrl = desktopControls || this.desktopControls;

    // Play sci-fi teleport sound
    if (this.interactionManager) {
      this.interactionManager.playTeleportSound();
    }

    // 1. Fade out to black
    if (this.fadeOverlay) {
      this.fadeOverlay.classList.add('faded');
    }

    setTimeout(() => {
      // 2. Move player position and rotation
      const [tx, ty, tz] = targetRoom.position;
      const [rx, ry, rz] = targetRoom.rotation;

      // Check if presenting in WebXR
      const isVR = rig && rig.parent && rig.parent.children && cam && cam.parent === rig;

      if (ctrl && ctrl.enabled) {
        // Desktop Mode: move camera and update desktop controls
        ctrl.teleport(tx, ty, tz, ry);
        if (rig) rig.position.set(0, 0, 0);
      } else {
        // VR Mode: position rig at room floor coordinates
        if (rig) {
          rig.position.set(tx, 0, tz);
          rig.rotation.y = ry;
        }
        if (cam && (!rig || rig.position.lengthSq() === 0)) {
          cam.position.set(tx, ty, tz);
          cam.rotation.set(rx, ry, rz);
        }
      }

      this.currentRoomName = targetRoom.roomName;
      this.notify();

      // 3. Fade back in
      setTimeout(() => {
        if (this.fadeOverlay) {
          this.fadeOverlay.classList.remove('faded');
        }
        this.isTransitioning = false;
        if (onComplete) onComplete(targetRoom);
      }, 100);
    }, 380);
  }

  teleportHome(playerRig = null, camera = null, desktopControls = null, onComplete = null) {
    this.teleportToRoom('Learning Hub', playerRig, camera, desktopControls, onComplete);
  }
}
