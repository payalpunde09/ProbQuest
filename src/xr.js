/**
 * ============================================================================
 * WEBXR SESSION MANAGER
 * ============================================================================
 * Initializes WebXR immersive-vr session with hand-tracking support.
 */
export class XRManager {
  constructor(renderer, onSessionStart = null, onSessionEnd = null) {
    this.renderer = renderer;
    this.onSessionStart = onSessionStart;
    this.onSessionEnd = onSessionEnd;

    this.session = null;
    this.isVRSupported = false;

    this.checkVRSupport();
  }

  async checkVRSupport() {
    if ('xr' in navigator) {
      try {
        this.isVRSupported = await navigator.xr.isSessionSupported('immersive-vr');
        console.log(`[XRManager] immersive-vr supported: ${this.isVRSupported}`);
      } catch (err) {
        console.warn('[XRManager] WebXR check failed:', err);
        this.isVRSupported = false;
      }
    } else {
      console.log('[XRManager] WebXR not available in this browser.');
      this.isVRSupported = false;
    }
    return this.isVRSupported;
  }

  async enterVR() {
    if (!('xr' in navigator)) {
      alert('WebXR is not supported by your browser. Please use a WebXR-compatible browser such as Meta Quest Browser or Chrome with WebXR enabled.');
      return false;
    }

    try {
      const sessionInit = {
        optionalFeatures: [
          'local-floor',
          'bounded-floor',
          'hand-tracking',
          'layers',
        ],
      };

      console.log('[XRManager] Requesting immersive-vr session with hand-tracking...');
      const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
      this.session = session;

      session.addEventListener('end', () => {
        this.session = null;
        console.log('[XRManager] XR Session ended.');
        if (this.onSessionEnd) this.onSessionEnd();
      });

      await this.renderer.xr.setSession(session);
      console.log('[XRManager] WebXR session successfully activated.');

      if (this.onSessionStart) this.onSessionStart(session);
      return true;
    } catch (err) {
      console.error('[XRManager] Failed to start WebXR session:', err);
      alert(`Could not enter VR: ${err.message || err}`);
      return false;
    }
  }

  exitVR() {
    if (this.session) {
      this.session.end();
    }
  }

  isInVR() {
    return this.renderer.xr.isPresenting;
  }
}
