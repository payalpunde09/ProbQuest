import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { RoomManager } from './roomManager.js';
import { InventoryManager } from './inventory.js';
import { SettingsManager } from './settings.js';
import { InteractionManager } from './interaction.js';
import { HandUI } from './handUI.js';
import { HandTracker } from './hands.js';
import { DesktopControls } from './desktopControls.js';
import { XRManager } from './xr.js';

/**
 * ============================================================================
 * MATH QUEST XR – PROBABILITY ADVENTURE
 * MAIN APPLICATION ENTRY POINT
 * ============================================================================
 */
class MathQuestApp {
  constructor() {
    this.container = document.getElementById('scene-container');
    this.startScreen = document.getElementById('start-screen');
    this.btnEnterVR = document.getElementById('btn-enter-vr');
    this.btnDesktopMode = document.getElementById('btn-desktop-mode');

    this.clock = new THREE.Clock();

    this.init();
  }

  init() {
    // 1. Core State Managers
    this.roomManager = new RoomManager();
    this.inventoryManager = new InventoryManager();
    this.settingsManager = new SettingsManager();
    this.interactionManager = new InteractionManager(this.settingsManager);

    // 2. 3D Scene & Untouched GLB Environment Loader
    this.sceneManager = new SceneManager(this.container, this.roomManager);

    // 3. Hand-Attached Holographic XR UI
    this.handUI = new HandUI(
      this.roomManager,
      this.inventoryManager,
      this.settingsManager,
      this.interactionManager
    );
    this.sceneManager.scene.add(this.handUI.getMesh());

    // 4. WebXR Hand Tracking & Pinch Detection
    this.handTracker = new HandTracker(
      this.sceneManager.renderer,
      this.sceneManager.scene,
      this.sceneManager.playerRig,
      this.handUI,
      this.interactionManager
    );

    // 5. Desktop Controls (WASD + Mouse Look & Click)
    this.desktopControls = new DesktopControls(
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement,
      this.handUI,
      this.interactionManager
    );

    // 6. Connect RoomManager with player transforms for smooth teleportation
    this.roomManager.setPlayerReferences({
      playerRig: this.sceneManager.playerRig,
      camera: this.sceneManager.camera,
      desktopControls: this.desktopControls,
      interactionManager: this.interactionManager,
    });

    // 7. WebXR Session Manager
    this.xrManager = new XRManager(
      this.sceneManager.renderer,
      () => this.onVRSessionStarted(),
      () => this.onVRSessionEnded()
    );

    // 8. Global Exit Handler (invoked by HandUI Exit button)
    window.onExitSession = () => this.handleExit();

    // 9. Bind Start Screen & Desktop HUD Buttons
    this.setupStartScreen();
    this.setupDesktopNavBar();

    // 10. Start Main Render Loop
    this.sceneManager.renderer.setAnimationLoop((timestamp, frame) => {
      this.animate(timestamp, frame);
    });

    console.log('[MathQuestApp] Initialized successfully.');
  }

  setupDesktopNavBar() {
    const btnHome = document.getElementById('nav-btn-home');
    const btnRooms = document.getElementById('nav-btn-rooms');
    const btnInv = document.getElementById('nav-btn-inventory');
    const btnSettings = document.getElementById('nav-btn-settings');
    const btnProb = document.getElementById('nav-btn-prob');
    const btnExit = document.getElementById('nav-btn-exit');
    const roomsDrawer = document.getElementById('desktop-rooms-drawer');
    const roomBadge = document.getElementById('current-room-badge');
    const roomChips = document.querySelectorAll('.room-chip');

    // Subscribe to room changes to update badge and active chip
    this.roomManager.subscribe((room) => {
      if (roomBadge) roomBadge.textContent = room.roomName.toUpperCase();
      roomChips.forEach((chip) => {
        chip.classList.toggle('active', chip.getAttribute('data-room') === room.roomName);
      });
    });

    if (btnHome) {
      btnHome.addEventListener('click', () => {
        this.interactionManager.playClickSound();
        this.roomManager.teleportHome();
        this.handUI.setView('MAIN');
        if (roomsDrawer) roomsDrawer.classList.add('hidden');
      });
    }

    if (btnRooms) {
      btnRooms.addEventListener('click', () => {
        this.interactionManager.playClickSound();
        if (roomsDrawer) {
          roomsDrawer.classList.toggle('hidden');
        }
        this.handUI.setView('ROOMS');
      });
    }

    if (btnInv) {
      btnInv.addEventListener('click', () => {
        this.interactionManager.playClickSound();
        this.handUI.setView('INVENTORY');
        if (roomsDrawer) roomsDrawer.classList.add('hidden');
      });
    }

    if (btnSettings) {
      btnSettings.addEventListener('click', () => {
        this.interactionManager.playClickSound();
        this.handUI.setView('SETTINGS');
        if (roomsDrawer) roomsDrawer.classList.add('hidden');
      });
    }

    if (btnProb) {
      btnProb.addEventListener('click', () => {
        this.interactionManager.playClickSound();
        this.handUI.setView('PROBABILITY');
        if (roomsDrawer) roomsDrawer.classList.add('hidden');
      });
    }

    if (btnExit) {
      btnExit.addEventListener('click', () => {
        this.interactionManager.playClickSound();
        this.handUI.setView('EXIT');
        if (roomsDrawer) roomsDrawer.classList.add('hidden');
      });
    }

    // Bind room chips for 1-click room teleportation
    roomChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const targetRoom = chip.getAttribute('data-room');
        this.interactionManager.playClickSound();
        this.roomManager.teleportToRoom(targetRoom);
        this.handUI.setView('MAIN');
        if (roomsDrawer) roomsDrawer.classList.add('hidden');
      });
    });
  }

  setupStartScreen() {
    if (this.btnEnterVR) {
      this.btnEnterVR.addEventListener('click', async () => {
        this.interactionManager.initAudio();
        this.interactionManager.playClickSound();
        const entered = await this.xrManager.enterVR();
        if (entered) {
          this.hideStartScreen();
        }
      });
    }

    if (this.btnDesktopMode) {
      this.btnDesktopMode.addEventListener('click', () => {
        this.interactionManager.initAudio();
        this.interactionManager.playClickSound();
        this.hideStartScreen();
        this.desktopControls.enable();
      });
    }
  }

  hideStartScreen() {
    if (this.startScreen) {
      this.startScreen.classList.add('hidden');
    }
  }

  showStartScreen() {
    if (this.startScreen) {
      this.startScreen.classList.remove('hidden');
    }
  }

  onVRSessionStarted() {
    console.log('[MathQuestApp] VR mode active. Hand tracking enabled.');
    this.desktopControls.disable();
    const curRoom = this.roomManager.getCurrentRoom();
    if (curRoom) {
      this.sceneManager.playerRig.position.set(curRoom.position[0], 0, curRoom.position[2]);
      this.sceneManager.playerRig.rotation.y = curRoom.rotation[1];
    }
  }

  onVRSessionEnded() {
    console.log('[MathQuestApp] VR session ended. Returning to desktop mode.');
    this.sceneManager.playerRig.position.set(0, 0, 0);
    this.showStartScreen();
  }

  handleExit() {
    if (this.xrManager.isInVR()) {
      this.xrManager.exitVR();
    } else {
      this.desktopControls.disable();
      this.showStartScreen();
    }
  }

  animate(timestamp, frame) {
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const isVR = this.sceneManager.renderer.xr.isPresenting;

    if (isVR) {
      // VR Update
      this.handTracker.update(delta);
      const leftWrist = this.handTracker.getLeftWristTransform();
      this.handUI.update(delta, true, leftWrist, this.sceneManager.camera);
    } else {
      // Desktop Update
      this.desktopControls.update(delta);
      this.handUI.update(delta, false, null, this.sceneManager.camera);
    }

    // Render Scene
    this.sceneManager.render();
  }
}

// Start app once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.mathQuestApp = new MathQuestApp();
});
