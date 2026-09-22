import * as THREE from 'three';

/**
 * ============================================================================
 * HAND-ATTACHED HOLOGRAPHIC XR UI
 * ============================================================================
 * Creates a futuristic fantasy holographic wrist-mounted interface for
 * MATH QUEST XR - PROBABILITY ADVENTURE.
 *
 * Runs completely inside Three.js / WebGL.
 * Smoothly follows the player's left wrist in VR, or floats in desktop mode.
 */
export class HandUI {
  constructor(roomManager, inventoryManager, settingsManager, interactionManager) {
    this.roomManager = roomManager;
    this.inventoryManager = inventoryManager;
    this.settingsManager = settingsManager;
    this.interactionManager = interactionManager;

    this.currentView = 'MAIN'; // 'MAIN' | 'ROOMS' | 'INVENTORY' | 'SETTINGS' | 'EXIT' | 'PROBABILITY'

    // UI Canvas dimensions (High-DPI for crispness in VR)
    this.canvasWidth = 1024;
    this.canvasHeight = 768;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // 3D Physical Mesh: 0.24m wide by 0.18m high (ergonomic VR wrist dimension)
    this.widthMeters = 0.24;
    this.heightMeters = 0.18;

    this.group = new THREE.Group();
    this.group.name = 'HandAttachedUI';

    this.create3DComponents();

    // Damping state for smooth wrist-following without jitter
    this.targetPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.currentPosition = new THREE.Vector3();
    this.currentQuaternion = new THREE.Quaternion();
    this.hasInitialTransform = false;

    // Animation ticks for futuristic pulse & scanlines
    this.animTime = 0;
    this.needsRedraw = true;

    // Listen to changes
    this.roomManager.subscribe(() => this.requestRedraw());
    this.inventoryManager.subscribe(() => this.requestRedraw());
    this.settingsManager.subscribe(() => {
      this.updateScaleFromSettings();
      this.requestRedraw();
    });

    this.renderCanvas();
  }

  create3DComponents() {
    // 1. Holographic Display Plane
    const planeGeo = new THREE.PlaneGeometry(this.widthMeters, this.heightMeters, 1, 1);
    this.panelMaterial = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.panelMesh = new THREE.Mesh(planeGeo, this.panelMaterial);
    this.panelMesh.name = 'HandUIPanel';
    this.group.add(this.panelMesh);

    // 2. Futuristic Cyber Bezel Frame (Glass backplate with glowing edge)
    const frameGeo = new THREE.PlaneGeometry(this.widthMeters + 0.012, this.heightMeters + 0.012);
    const frameMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
      side: THREE.DoubleSide,
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.z = -0.002;
    this.group.add(frameMesh);

    // 3. Ambient Holo Aura Behind Panel
    const auraGeo = new THREE.PlaneGeometry(this.widthMeters + 0.04, this.heightMeters + 0.04);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x9333ea,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.position.z = -0.005;
    this.group.add(auraMesh);
  }

  updateScaleFromSettings() {
    const scale = this.settingsManager.get('uiScale') || 1.0;
    this.group.scale.set(scale, scale, scale);
  }

  getMesh() {
    return this.group;
  }

  getInteractiveMesh() {
    return this.panelMesh;
  }

  requestRedraw() {
    this.needsRedraw = true;
  }

  setView(viewName) {
    this.currentView = viewName;
    this.requestRedraw();
  }

  /**
   * Called every frame in the main animation loop
   */
  update(delta, isVR, leftWristTransform, camera) {
    this.animTime += delta;

    // Periodic slight pulse / scanline update
    if (this.needsRedraw || Math.floor(this.animTime * 10) % 3 === 0) {
      this.renderCanvas();
      this.texture.needsUpdate = true;
      this.needsRedraw = false;
    }

    if (isVR && leftWristTransform) {
      // VR MODE: Follow Left Wrist
      const distance = this.settingsManager.get('uiDistance') || 0.12;
      const positionMode = this.settingsManager.get('handUIPosition') || 'wrist';

      let yOffset = 0.08;
      let zOffset = -0.04;
      if (positionMode === 'forearm') {
        yOffset = 0.06;
        zOffset = 0.10;
      } else if (positionMode === 'palm') {
        yOffset = 0.04;
        zOffset = -0.08;
      }

      // Calculate desired wrist-relative position and orientation
      const wristPos = leftWristTransform.position;
      const wristQuat = leftWristTransform.quaternion;

      const localOffset = new THREE.Vector3(0, yOffset, zOffset + distance * 0.2);
      localOffset.applyQuaternion(wristQuat);
      this.targetPosition.copy(wristPos).add(localOffset);

      // Ergonomic tilt: rotate ~35 degrees toward player view
      const tiltEuler = new THREE.Euler(-Math.PI * 0.25, 0, Math.PI * 0.08, 'YXZ');
      const tiltQuat = new THREE.Quaternion().setFromEuler(tiltEuler);
      this.targetQuaternion.copy(wristQuat).multiply(tiltQuat);

      this.group.visible = true;
    } else {
      // DESKTOP MODE: Floating HUD near camera
      if (camera) {
        // Place comfortably centered in front of camera
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

        this.targetPosition
          .copy(camera.position)
          .addScaledVector(forward, 0.58)
          .addScaledVector(up, -0.02);

        // Face the camera directly (Plane normal +Z points at camera)
        this.targetQuaternion.copy(camera.quaternion);
        this.group.visible = true;
      }
    }

    // Smooth dampening (lerp/slerp) to prevent jitter
    if (!this.hasInitialTransform) {
      this.currentPosition.copy(this.targetPosition);
      this.currentQuaternion.copy(this.targetQuaternion);
      this.hasInitialTransform = true;
    } else {
      const lerpFactor = Math.min(1.0, delta * 14.0);
      this.currentPosition.lerp(this.targetPosition, lerpFactor);
      this.currentQuaternion.slerp(this.targetQuaternion, lerpFactor);
    }

    this.group.position.copy(this.currentPosition);
    this.group.quaternion.copy(this.currentQuaternion);
  }

  /**
   * Renders the futuristic holographic canvas
   */
  renderCanvas() {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    const hoveredId = this.interactionManager.hoveredButtonId;

    ctx.clearRect(0, 0, w, h);

    // 1. Dark Transparent Glass Background
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, 'rgba(10, 16, 32, 0.90)');
    bgGrad.addColorStop(0.5, 'rgba(15, 23, 48, 0.88)');
    bgGrad.addColorStop(1, 'rgba(6, 10, 24, 0.92)');

    this.drawRoundedRect(ctx, 16, 16, w - 32, h - 32, 28);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // 2. Cyan Glowing Border
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset shadow

    // Inner subtle purple accent border
    this.drawRoundedRect(ctx, 24, 24, w - 48, h - 48, 22);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
    ctx.stroke();

    // 3. Holographic Scanline Texture
    ctx.fillStyle = 'rgba(0, 240, 255, 0.025)';
    const scanOffset = (this.animTime * 40) % 8;
    for (let y = 30 + scanOffset; y < h - 30; y += 8) {
      ctx.fillRect(26, y, w - 52, 2);
    }

    // 4. Header Section
    this.renderHeader(ctx, w);

    // 5. Active View Content & Buttons
    const buttons = [];
    switch (this.currentView) {
      case 'MAIN':
        this.renderMainView(ctx, w, h, hoveredId, buttons);
        break;
      case 'ROOMS':
        this.renderRoomsView(ctx, w, h, hoveredId, buttons);
        break;
      case 'INVENTORY':
        this.renderInventoryView(ctx, w, h, hoveredId, buttons);
        break;
      case 'SETTINGS':
        this.renderSettingsView(ctx, w, h, hoveredId, buttons);
        break;
      case 'EXIT':
        this.renderExitView(ctx, w, h, hoveredId, buttons);
        break;
      case 'PROBABILITY':
        this.renderProbabilityView(ctx, w, h, hoveredId, buttons);
        break;
      default:
        this.renderMainView(ctx, w, h, hoveredId, buttons);
        break;
    }

    // Register active buttons in interaction manager (normalized 0..1 coordinates)
    const normalizedButtons = buttons.map((btn) => ({
      id: btn.id,
      x: btn.x / w,
      y: btn.y / h,
      width: btn.w / w,
      height: btn.h / h,
      onClick: btn.onClick,
    }));
    this.interactionManager.setActiveButtons(normalizedButtons);
  }

  renderHeader(ctx, w) {
    // Glowing Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px "Orbitron", sans-serif';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 16;
    ctx.fillText('MATH QUEST XR', w / 2, 70);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 18px "Orbitron", sans-serif';
    ctx.letterSpacing = '4px';
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 8;
    ctx.fillText('PROBABILITY ADVENTURE', w / 2, 102);
    ctx.shadowBlur = 0;

    // Current Room Indicator
    const curRoom = this.roomManager.getCurrentRoom();
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = '600 15px "Rajdhani", sans-serif';
    ctx.fillText(`LOCATION: ${curRoom.roomName.toUpperCase()}`, w / 2, 128);

    // Glowing Divider Line
    const divGrad = ctx.createLinearGradient(100, 140, w - 100, 140);
    divGrad.addColorStop(0, 'rgba(0, 240, 255, 0)');
    divGrad.addColorStop(0.5, 'rgba(0, 240, 255, 0.8)');
    divGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.strokeStyle = divGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 142);
    ctx.lineTo(w - 80, 142);
    ctx.stroke();
  }

  /**
   * VIEW: MAIN MENU
   */
  renderMainView(ctx, w, h, hoveredId, buttons) {
    const colW = 380;
    const btnH = 86;
    const leftX = 100;
    const rightX = w - 100 - colW;

    // Row 1: HOME & ROOMS
    const homeBtn = {
      id: 'btn-home',
      label: 'HOME',
      sub: 'Central Hub Atrium',
      icon: '🏛️',
      x: leftX,
      y: 180,
      w: colW,
      h: btnH,
      color: '#00f0ff',
      onClick: () => this.roomManager.teleportHome(),
    };
    const roomsBtn = {
      id: 'btn-rooms',
      label: 'ROOMS',
      sub: '8 Probability Realms',
      icon: '🌌',
      x: rightX,
      y: 180,
      w: colW,
      h: btnH,
      color: '#38bdf8',
      onClick: () => this.setView('ROOMS'),
    };

    // Row 2: INVENTORY & SETTINGS
    const invBtn = {
      id: 'btn-inventory',
      label: 'INVENTORY',
      sub: 'Coins, Dice & Keys',
      icon: '🎒',
      x: leftX,
      y: 300,
      w: colW,
      h: btnH,
      color: '#a855f7',
      onClick: () => this.setView('INVENTORY'),
    };
    const settingsBtn = {
      id: 'btn-settings',
      label: 'SETTINGS',
      sub: 'UI Scale & Sound',
      icon: '⚙️',
      x: rightX,
      y: 300,
      w: colW,
      h: btnH,
      color: '#ec4899',
      onClick: () => this.setView('SETTINGS'),
    };

    // Row 3: PROBABILITY (Optional) & EXIT
    const probBtn = {
      id: 'btn-probability',
      label: 'PROBABILITY',
      sub: 'Formulas & Odds Guide',
      icon: '📊',
      x: leftX,
      y: 420,
      w: colW,
      h: btnH,
      color: '#34d399',
      onClick: () => this.setView('PROBABILITY'),
    };
    const exitBtn = {
      id: 'btn-exit',
      label: 'EXIT',
      sub: 'Exit Adventure',
      icon: '🚪',
      x: rightX,
      y: 420,
      w: colW,
      h: btnH,
      color: '#f87171',
      onClick: () => this.setView('EXIT'),
    };

    const mainButtons = [homeBtn, roomsBtn, invBtn, settingsBtn, probBtn, exitBtn];
    mainButtons.forEach((b) => {
      this.drawCyberButton(ctx, b, b.id === hoveredId);
      buttons.push(b);
    });

    // Quick Hint at Bottom
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '500 18px "Rajdhani", sans-serif';
    ctx.fillText('VR: Point with Right Hand & Pinch to Select  •  Desktop: Click', w / 2, 690);
  }

  /**
   * VIEW: ROOMS MENU (8 ROOMS GRID)
   */
  renderRoomsView(ctx, w, h, hoveredId, buttons) {
    const rooms = this.roomManager.getRooms();
    const colW = 390;
    const btnH = 68;
    const gapX = 36;
    const gapY = 16;
    const startX = (w - (colW * 2 + gapX)) / 2;
    const startY = 165;

    rooms.forEach((room, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = startX + col * (colW + gapX);
      const by = startY + row * (btnH + gapY);

      const btn = {
        id: `room-${room.id}`,
        label: room.roomName.toUpperCase(),
        sub: room.subtitle,
        x: bx,
        y: by,
        w: colW,
        h: btnH,
        color: room.color || '#00f0ff',
        onClick: () => {
          this.roomManager.teleportToRoom(room.roomName);
          this.setView('MAIN');
        },
      };

      this.drawCyberButton(ctx, btn, btn.id === hoveredId);
      buttons.push(btn);
    });

    // Back to Main Button
    const backBtn = {
      id: 'rooms-back',
      label: 'BACK TO MENU',
      sub: '',
      icon: '◀',
      x: w / 2 - 160,
      y: 530,
      w: 320,
      h: 56,
      color: '#94a3b8',
      onClick: () => this.setView('MAIN'),
    };
    this.drawCyberButton(ctx, backBtn, backBtn.id === hoveredId);
    buttons.push(backBtn);
  }

  /**
   * VIEW: INVENTORY MENU (COINS, DICE, CARDS, KEYS)
   */
  renderInventoryView(ctx, w, h, hoveredId, buttons) {
    const items = this.inventoryManager.getItems();
    const cardW = 380;
    const cardH = 140;
    const leftX = 100;
    const rightX = w - 100 - cardW;

    items.forEach((item, idx) => {
      const bx = idx % 2 === 0 ? leftX : rightX;
      const by = idx < 2 ? 175 : 345;

      // Card Background
      this.drawRoundedRect(ctx, bx, by, cardW, cardH, 16);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fill();
      ctx.strokeStyle = item.color || '#00f0ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = item.color || '#00f0ff';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Icon
      ctx.font = '48px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(item.icon, bx + 22, by + 76);

      // Name & Quantity
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 24px "Orbitron", sans-serif';
      ctx.fillText(item.name, bx + 95, by + 52);

      ctx.fillStyle = item.color || '#00f0ff';
      ctx.font = '700 28px "Orbitron", sans-serif';
      ctx.fillText(`${item.count}`, bx + 95, by + 90);

      ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
      ctx.font = '500 15px "Rajdhani", sans-serif';
      ctx.fillText(item.desc, bx + 95, by + 118);
    });

    // Close Button
    const closeBtn = {
      id: 'inv-close',
      label: 'CLOSE INVENTORY',
      sub: '',
      icon: '✖',
      x: w / 2 - 160,
      y: 525,
      w: 320,
      h: 58,
      color: '#00f0ff',
      onClick: () => this.setView('MAIN'),
    };
    this.drawCyberButton(ctx, closeBtn, closeBtn.id === hoveredId);
    buttons.push(closeBtn);
  }

  /**
   * VIEW: SETTINGS MENU
   */
  renderSettingsView(ctx, w, h, hoveredId, buttons) {
    const scale = this.settingsManager.get('uiScale');
    const dist = this.settingsManager.get('uiDistance');
    const pos = this.settingsManager.get('handUIPosition');
    const sound = this.settingsManager.get('sound');

    const colW = 380;
    const btnH = 78;
    const leftX = 100;
    const rightX = w - 100 - colW;

    const scaleBtn = {
      id: 'set-scale',
      label: `UI SCALE: ${scale.toFixed(1)}x`,
      sub: 'Tap to Cycle (0.8x - 1.4x)',
      icon: '🔍',
      x: leftX,
      y: 180,
      w: colW,
      h: btnH,
      color: '#00f0ff',
      onClick: () => this.settingsManager.cycleScale(),
    };

    const distBtn = {
      id: 'set-dist',
      label: `DISTANCE: ${(dist * 100).toFixed(0)} CM`,
      sub: 'Wrist Offset Range',
      icon: '📏',
      x: rightX,
      y: 180,
      w: colW,
      h: btnH,
      color: '#38bdf8',
      onClick: () => this.settingsManager.cycleDistance(),
    };

    const posBtn = {
      id: 'set-pos',
      label: `MOUNT: ${pos.toUpperCase()}`,
      sub: 'Wrist / Forearm / Palm',
      icon: '⌚',
      x: leftX,
      y: 285,
      w: colW,
      h: btnH,
      color: '#a855f7',
      onClick: () => this.settingsManager.cyclePosition(),
    };

    const soundBtn = {
      id: 'set-sound',
      label: `AUDIO: ${sound ? 'ENABLED' : 'MUTED'}`,
      sub: 'Sci-Fi Sound Chimes',
      icon: sound ? '🔊' : '🔇',
      x: rightX,
      y: 285,
      w: colW,
      h: btnH,
      color: sound ? '#34d399' : '#f87171',
      onClick: () => this.settingsManager.toggleSound(),
    };

    const resetBtn = {
      id: 'set-reset',
      label: 'RESET SETTINGS',
      sub: 'Restore VR Defaults',
      icon: '🔄',
      x: leftX,
      y: 390,
      w: colW,
      h: btnH,
      color: '#fbbf24',
      onClick: () => this.settingsManager.resetDefaults(),
    };

    const closeBtn = {
      id: 'set-close',
      label: 'CLOSE',
      sub: 'Return to Main Menu',
      icon: '✔',
      x: rightX,
      y: 390,
      w: colW,
      h: btnH,
      color: '#94a3b8',
      onClick: () => this.setView('MAIN'),
    };

    const settingsButtons = [scaleBtn, distBtn, posBtn, soundBtn, resetBtn, closeBtn];
    settingsButtons.forEach((b) => {
      this.drawCyberButton(ctx, b, b.id === hoveredId);
      buttons.push(b);
    });
  }

  /**
   * VIEW: EXIT CONFIRMATION
   */
  renderExitView(ctx, w, h, hoveredId, buttons) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 32px "Orbitron", sans-serif';
    ctx.shadowColor = '#f87171';
    ctx.shadowBlur = 14;
    ctx.fillText('Exit Probability Adventure?', w / 2, 240);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(203, 213, 225, 0.85)';
    ctx.font = '500 20px "Rajdhani", sans-serif';
    ctx.fillText('Are you sure you want to exit your active XR session?', w / 2, 285);

    const btnW = 260;
    const btnH = 80;
    const gap = 40;
    const startX = (w - (btnW * 2 + gap)) / 2;

    const yesBtn = {
      id: 'exit-yes',
      label: 'YES, EXIT',
      sub: 'End VR Session',
      icon: '🚪',
      x: startX,
      y: 360,
      w: btnW,
      h: btnH,
      color: '#f87171',
      onClick: () => {
        if (window.onExitSession) {
          window.onExitSession();
        } else {
          location.reload();
        }
      },
    };

    const noBtn = {
      id: 'exit-no',
      label: 'NO, RETURN',
      sub: 'Keep Playing',
      icon: '🛡️',
      x: startX + btnW + gap,
      y: 360,
      w: btnW,
      h: btnH,
      color: '#00f0ff',
      onClick: () => this.setView('MAIN'),
    };

    [yesBtn, noBtn].forEach((b) => {
      this.drawCyberButton(ctx, b, b.id === hoveredId);
      buttons.push(b);
    });
  }

  /**
   * VIEW: PROBABILITY (OPTIONAL FORMULAS & STATS)
   */
  renderProbabilityView(ctx, w, h, hoveredId, buttons) {
    const rules = [
      { rule: 'Classical Probability', formula: 'P(A) = n(A) / n(S)', desc: 'Favorable outcomes over sample space' },
      { rule: 'Independent Events', formula: 'P(A ∩ B) = P(A) × P(B)', desc: 'Coin flip + Die roll simultaneous probability' },
      { rule: 'Conditional Probability', formula: 'P(A | B) = P(A ∩ B) / P(B)', desc: 'Monty Hall switch vs keep logic' },
      { rule: 'Binomial Theorem', formula: 'P(X = k) = C(n, k) p^k (1-p)^(n-k)', desc: 'Repeated Bernoulli coin trials' },
    ];

    rules.forEach((r, idx) => {
      const by = 165 + idx * 78;
      this.drawRoundedRect(ctx, 120, by, w - 240, 68, 12);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px "Orbitron", sans-serif';
      ctx.fillText(r.rule, 145, by + 28);

      ctx.fillStyle = '#38bdf8';
      ctx.font = '700 17px monospace';
      ctx.fillText(r.formula, 145, by + 52);

      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
      ctx.font = '500 15px "Rajdhani", sans-serif';
      ctx.fillText(r.desc, w - 145, by + 42);
    });

    const backBtn = {
      id: 'prob-back',
      label: 'BACK TO MENU',
      sub: '',
      icon: '◀',
      x: w / 2 - 160,
      y: 505,
      w: 320,
      h: 56,
      color: '#00f0ff',
      onClick: () => this.setView('MAIN'),
    };
    this.drawCyberButton(ctx, backBtn, backBtn.id === hoveredId);
    buttons.push(backBtn);
  }

  /**
   * Helper to draw high-tech glowing cyber buttons with hover state
   */
  drawCyberButton(ctx, btn, isHovered) {
    const { x, y, w, h, label, sub, icon, color = '#00f0ff' } = btn;
    const isPressed = this.interactionManager && this.interactionManager.clickedButtonId === btn.id;

    this.drawRoundedRect(ctx, x, y, w, h, 14);

    if (isPressed) {
      // High-energy pinch/click flash state
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
      grad.addColorStop(1, 'rgba(0, 240, 255, 0.65)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 30;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (isHovered) {
      // Elevated bright glowing state
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, 'rgba(0, 240, 255, 0.32)');
      grad.addColorStop(1, 'rgba(168, 85, 247, 0.32)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      // Normal dark glass state
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Icon (if any)
    if (icon) {
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(icon, x + 20, y + h / 2 + 10);
    }

    // Button Label
    ctx.textAlign = icon ? 'left' : 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = isHovered ? '900 20px "Orbitron", sans-serif' : '700 19px "Orbitron", sans-serif';
    const textX = icon ? x + 62 : x + w / 2;
    const textY = sub ? y + h / 2 - 4 : y + h / 2 + 7;
    ctx.fillText(label, textX, textY);

    // Subtitle (if any)
    if (sub) {
      ctx.fillStyle = isHovered ? color : 'rgba(148, 163, 184, 0.85)';
      ctx.font = '500 13px "Rajdhani", sans-serif';
      ctx.fillText(sub, textX, y + h / 2 + 18);
    }
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}
