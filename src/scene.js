import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * ============================================================================
 * 3D SCENE & ENVIRONMENT LOADER
 * ============================================================================
 * Loads the user's untouched Math Quest XR environment GLB and configures
 * lighting, camera, player rig, and WebGL renderer with WebXR support.
 */
export class SceneManager {
  constructor(containerElement, roomManager) {
    this.container = containerElement;
    this.roomManager = roomManager;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060914);

    // 2. Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.05, 150);
    this.camera.position.set(0, 1.6, 3.3); // Default spawn position

    // 3. Player Rig (holds camera, hands, and VR controllers in WebXR)
    this.playerRig = new THREE.Group();
    this.playerRig.name = 'PlayerRig';
    this.playerRig.position.set(0, 0, 0);
    this.playerRig.add(this.camera);
    this.scene.add(this.playerRig);

    // 4. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.xr.enabled = true;

    this.container.appendChild(this.renderer.domElement);

    // 5. Fantasy Theme Lighting
    this.setupLighting();

    // 6. Load Game Environment GLB
    this.environmentModel = null;
    this.loadEnvironment();

    // Resize listener
    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupLighting() {
    // Ambient Fantasy Base
    const ambientLight = new THREE.AmbientLight(0x1a243a, 1.4);
    this.scene.add(ambientLight);

    // Central Atmospheric Cyan Light
    const cyanLight = new THREE.DirectionalLight(0x00f0ff, 0.7);
    cyanLight.position.set(0, 8, 4);
    this.scene.add(cyanLight);

    // Warm Castle Light from Top
    const warmLight = new THREE.DirectionalLight(0xfff1db, 1.2);
    warmLight.position.set(5, 10, -5);
    this.scene.add(warmLight);

    // Magical Purple Rim Light
    const purpleLight = new THREE.DirectionalLight(0xa855f7, 0.6);
    purpleLight.position.set(-6, 6, -6);
    this.scene.add(purpleLight);

    // Soft point light at spawn lobby
    const lobbyPoint = new THREE.PointLight(0x38bdf8, 1.5, 15);
    lobbyPoint.position.set(0, 3.5, 0);
    this.scene.add(lobbyPoint);
  }

  loadEnvironment() {
    const loader = new GLTFLoader();
    const primaryUrl = 'models/my-environment.glb';
    const altUrl = 'models/Untitled.glb';
    const fallbackUrl = 'gltf/environment/environment.glb';

    console.log('[SceneManager] Loading environment from:', primaryUrl);

    loader.load(
      primaryUrl,
      (gltf) => {
        this.onEnvironmentLoaded(gltf);
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          const percent = Math.round((xhr.loaded / xhr.total) * 100);
          console.log(`[SceneManager] Loading GLB: ${percent}%`);
        }
      },
      (error) => {
        console.warn(`[SceneManager] Failed to load ${primaryUrl}, trying ${altUrl}...`, error);
        loader.load(
          altUrl,
          (altGltf) => {
            this.onEnvironmentLoaded(altGltf);
          },
          undefined,
          (altErr) => {
            console.warn(`[SceneManager] Failed to load ${altUrl}, trying ${fallbackUrl}...`, altErr);
            loader.load(
              fallbackUrl,
              (fallbackGltf) => {
                this.onEnvironmentLoaded(fallbackGltf);
              },
              undefined,
              (fallbackErr) => {
                console.error('[SceneManager] Error loading fallback GLB:', fallbackErr);
              }
            );
          }
        );
      }
    );
  }

  onEnvironmentLoaded(gltf) {
    this.environmentModel = gltf.scene;
    this.environmentModel.name = 'MathQuestEnvironment';

    // The user explicitly requested:
    // "Do NOT replace, rebuild, delete, or modify the geometry of my GLB."
    // "The GLB is my actual game environment and must remain unchanged."
    this.scene.add(this.environmentModel);
    console.log('[SceneManager] Environment GLB successfully added to scene untouched.');

    // Calibrate room positions based on actual GLB nodes
    if (this.roomManager) {
      this.roomManager.autoDetectFromGLB(this.environmentModel);
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
