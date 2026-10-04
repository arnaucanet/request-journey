import * as THREE from 'three';

const CLICK_TOLERANCE_PX = 5;

// Clic sobre los equipos sin interferir con OrbitControls: si el puntero se ha movido
// entre pulsar y soltar, era un arrastre de cámara y no cuenta como clic.
export class Picker {
  constructor(sceneManager, view, onPick) {
    this.camera = sceneManager.camera;
    this.dom = sceneManager.renderer.domElement;
    this.view = view;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    let down = null;
    this.dom.addEventListener('pointerdown', (event) => (down = { x: event.clientX, y: event.clientY }));
    this.dom.addEventListener('pointerup', (event) => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE_PX) return;
      down = null;
      const id = this.#hit(event);
      if (id) onPick(id);
    });

    let pending = false;
    this.dom.addEventListener('pointermove', (event) => {
      if (pending || event.buttons) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        this.dom.style.cursor = this.#hit(event) ? 'pointer' : '';
      });
    });
  }

  #hit(event) {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const [hit] = this.raycaster.intersectObjects(this.view.pickables, true);
    return hit?.object.userData.nodeId ?? null;
  }
}
