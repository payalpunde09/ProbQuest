/**
 * ============================================================================
 * SETTINGS SYSTEM
 * ============================================================================
 * Manages functional UI Scale, UI Distance, Hand UI Position, Sound, and Reset
 */
export class SettingsManager {
  constructor() {
    this.settings = {
      uiScale: 1.0, // Multiplier: 0.8, 1.0, 1.2, 1.4
      uiDistance: 0.12, // Wrist offset distance (m): 0.08, 0.12, 0.16
      handUIPosition: 'wrist', // 'wrist' | 'forearm' | 'palm'
      sound: true, // Audio feedback enabled
      soundVolume: 0.7, // 0.0 - 1.0
    };

    this.listeners = new Set();
  }

  get(key) {
    return this.settings[key];
  }

  set(key, value) {
    if (this.settings[key] !== undefined) {
      this.settings[key] = value;
      this.notify(key, value);
    }
  }

  cycleScale() {
    const scales = [0.8, 1.0, 1.2, 1.4];
    const idx = scales.indexOf(this.settings.uiScale);
    const nextIdx = (idx + 1) % scales.length;
    this.set('uiScale', scales[nextIdx]);
    return this.settings.uiScale;
  }

  cycleDistance() {
    const distances = [0.08, 0.12, 0.16];
    const idx = distances.indexOf(this.settings.uiDistance);
    const nextIdx = (idx + 1) % distances.length;
    this.set('uiDistance', distances[nextIdx]);
    return this.settings.uiDistance;
  }

  cyclePosition() {
    const positions = ['wrist', 'forearm', 'palm'];
    const idx = positions.indexOf(this.settings.handUIPosition);
    const nextIdx = (idx + 1) % positions.length;
    this.set('handUIPosition', positions[nextIdx]);
    return this.settings.handUIPosition;
  }

  toggleSound() {
    this.set('sound', !this.settings.sound);
    return this.settings.sound;
  }

  resetDefaults() {
    this.settings.uiScale = 1.0;
    this.settings.uiDistance = 0.12;
    this.settings.handUIPosition = 'wrist';
    this.settings.sound = true;
    this.settings.soundVolume = 0.7;
    this.notify('all', this.settings);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(key, value) {
    this.listeners.forEach((fn) => fn(key, value, this.settings));
  }
}
