/**
 * ============================================================================
 * INTERACTION & AUDIO SYSTEM
 * ============================================================================
 * Handles sound effects (via Web Audio API synthesis) and unified button
 * ray hit testing for both VR pinch and Desktop mouse interaction.
 */
export class InteractionManager {
  constructor(settingsManager) {
    this.settingsManager = settingsManager;
    this.audioCtx = null;
    this.hoveredButtonId = null;
    this.clickedButtonId = null;
    this.clickAnimTimer = 0;
    this.activeButtons = []; // Registered by HandUI on each render
    this.lastClickTime = 0;
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  isSoundEnabled() {
    return this.settingsManager ? this.settingsManager.get('sound') : true;
  }

  getVolume() {
    return this.settingsManager ? this.settingsManager.get('soundVolume') : 0.7;
  }

  playHoverSound() {
    if (!this.isSoundEnabled()) return;
    this.initAudio();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);

      const vol = 0.08 * this.getVolume();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (err) {
      // Audio context may not have been unlocked yet
    }
  }

  playClickSound() {
    if (!this.isSoundEnabled()) return;
    this.initAudio();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      // Futuristic two-tone harmonic chime
      const freqs = [659.25, 987.77]; // E5, B5
      const vol = 0.15 * this.getVolume();

      freqs.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.03);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.14);

        gain.gain.setValueAtTime(0.001, now + idx * 0.03);
        gain.gain.linearRampToValueAtTime(vol, now + idx * 0.03 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now + idx * 0.03);
        osc.stop(now + 0.2);
      });
    } catch (err) {
      // Ignore audio failure
    }
  }

  playTeleportSound() {
    if (!this.isSoundEnabled()) return;
    this.initAudio();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);

      const vol = 0.18 * this.getVolume();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.42);
    } catch (err) {
      // Ignore audio failure
    }
  }

  /**
   * Set the current interactive buttons from the UI canvas layout
   * Each button: { id, x, y, width, height, onClick } (in normalized 0..1 canvas space)
   */
  setActiveButtons(buttons) {
    this.activeButtons = buttons || [];
  }

  /**
   * Test hit with a normalized UV coordinate (0..1, 0..1)
   * Note: Canvas Y in WebGL texture is inverted (1 - uv.y)
   */
  testHit(uv) {
    const now = performance.now();
    if (this.clickedButtonId && now - this.clickAnimTimer > 200) {
      this.clickedButtonId = null;
    }

    if (!uv) {
      if (this.hoveredButtonId !== null) {
        this.hoveredButtonId = null;
        return { changed: true, hoveredBtn: null };
      }
      return { changed: false, hoveredBtn: null };
    }

    const hitX = uv.x;
    const hitY = 1.0 - uv.y; // Invert texture V to match canvas Y

    let found = null;
    for (const btn of this.activeButtons) {
      if (
        hitX >= btn.x &&
        hitX <= btn.x + btn.width &&
        hitY >= btn.y &&
        hitY <= btn.y + btn.height
      ) {
        found = btn;
        break;
      }
    }

    const changed = (found ? found.id : null) !== this.hoveredButtonId;
    if (changed) {
      this.hoveredButtonId = found ? found.id : null;
      if (found) {
        this.playHoverSound();
      }
    }

    return { changed, hoveredBtn: found };
  }

  /**
   * Execute click on the currently hovered button
   */
  triggerClick() {
    const now = performance.now();
    if (now - this.lastClickTime < 220) {
      return false; // Debounce double clicks
    }
    this.lastClickTime = now;

    if (!this.hoveredButtonId) return false;

    const btn = this.activeButtons.find((b) => b.id === this.hoveredButtonId);
    if (btn && typeof btn.onClick === 'function') {
      this.clickedButtonId = btn.id;
      this.clickAnimTimer = now;
      this.playClickSound();
      btn.onClick();
      return true;
    }
    return false;
  }
}
