import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SCENE_COLORS } from './theme.js';

const HOME = { position: new THREE.Vector3(0.5, 20, 25), target: new THREE.Vector3(0.5, 0, 0.6) };
const INTRO_FROM = new THREE.Vector3(-20, 30, 36);

// Infraestructura 3D genérica: escena, cámara, luces, bucle de render y post-procesado.
// No sabe nada de redes ni de peticiones; el resto de módulos se enganchan con onUpdate().
export class SceneManager {
  constructor(container) {
    this.container = container;
    this.updaters = new Set();
    this.timer = new THREE.Timer();
    this.timer.connect(document);

    this.#createScene();
    this.#createRenderers();
    this.#createCamera();
    this.#createLights();
    this.#createFloor();
    this.#createPostProcessing();

    new ResizeObserver(() => this.#resize()).observe(container);
    this.#resize();
  }

  #createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE_COLORS.background);
    this.scene.fog = new THREE.Fog(SCENE_COLORS.background, 40, 90);
  }

  #createRenderers() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    this.container.appendChild(this.labelRenderer.domElement);
  }

  #createCamera() {
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    this.camera.position.copy(INTRO_FROM);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(HOME.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.enabled = false;
    this.controls.addEventListener('start', () => (this.flight = null));

    this.flight = this.#flight(HOME, 2.6);
  }

  #createLights() {
    this.scene.add(new THREE.HemisphereLight(0xdde4ee, 0x0b0d10, 0.85));

    const key = new THREE.DirectionalLight(0xfff4e6, 2);
    key.position.set(8, 22, 14);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    Object.assign(key.shadow.camera, { left: -24, right: 24, top: 16, bottom: -16, near: 1, far: 60 });
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x8fb4d6, 0.45);
    rim.position.set(-16, 10, -16);
    this.scene.add(rim);
  }

  #createFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: SCENE_COLORS.floor, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(200, 200, SCENE_COLORS.gridMajor, SCENE_COLORS.gridMinor);
    grid.position.y = 0.002;
    this.scene.add(grid);
  }

  #createPostProcessing() {
    const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Umbral alto: solo brillan los paquetes y los LEDs
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.4, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  #resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    // En vertical se abre el campo de visión para que quepa toda la infraestructura
    this.camera.fov = width / height < 1 ? 62 : 36;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width, height);
    this.labelRenderer.setSize(width, height);
  }

  onUpdate(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  // Acerca la cámara a un punto de la escena, mirándolo desde delante y desde arriba
  focusOn(point, distance = 13) {
    const target = point.clone().setY(0.6);
    const position = target.clone().add(new THREE.Vector3(0, distance * 0.62, distance * 0.78));
    this.flight = this.#flight({ position, target }, 1.3);
  }

  resetView() {
    this.flight = this.#flight(HOME, 1.3);
  }

  #flight(to, duration) {
    return {
      t: 0,
      duration,
      to,
      fromPosition: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
    };
  }

  #updateCamera(dt) {
    if (this.flight) {
      const f = this.flight;
      f.t += dt;
      const k = easeInOutCubic(Math.min(f.t / f.duration, 1));
      this.camera.position.lerpVectors(f.fromPosition, f.to.position, k);
      this.controls.target.lerpVectors(f.fromTarget, f.to.target, k);
      if (k === 1) {
        this.flight = null;
        this.controls.enabled = true;
      }
    }
    this.controls.update();
  }

  start() {
    this.renderer.setAnimationLoop((timestamp) => {
      this.timer.update(timestamp);
      const dt = Math.min(this.timer.getDelta(), 0.1);
      this.#updateCamera(dt);
      this.updaters.forEach((fn) => fn(dt, this.timer.getElapsed()));
      this.composer.render();
      this.labelRenderer.render(this.scene, this.camera);
    });
  }
}

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
