import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Notas flotantes sobre los equipos ("MISS", "502 Bad Gateway", "51 consultas"...).
// La animación (subir y desvanecerse) es CSS; aquí solo se crean y se retiran al terminar.
export class Notes {
  constructor(sceneManager, view) {
    this.scene = sceneManager.scene;
    this.view = view;
    this.stacks = new Map(); // notas visibles por equipo, para apilarlas sin que se solapen
  }

  on(nodeId, text, tone = 'info') {
    const index = this.stacks.get(nodeId) ?? 0;
    this.stacks.set(nodeId, index + 1);

    const el = document.createElement('div');
    const note = document.createElement('span');
    note.className = `fx-note fx-note--${tone}`;
    note.style.setProperty('--stack', index);
    note.textContent = text;
    el.appendChild(note);

    const label = new CSS2DObject(el);
    label.position.copy(this.view.topOf(nodeId)).add({ x: 0, y: 1.1, z: 0 });
    this.scene.add(label);

    note.addEventListener(
      'animationend',
      () => {
        this.scene.remove(label);
        this.stacks.set(nodeId, Math.max((this.stacks.get(nodeId) ?? 1) - 1, 0));
      },
      { once: true },
    );
  }
}
