import { icon } from './icons.js';

export const SPEEDS = [1, 2, 0.5];

// Botones principales: qué petición lanzar y qué hacer con el tiempo y las cachés
export class ActionBar {
  constructor(el, actions) {
    this.el = el;
    el.innerHTML = `
      <button type="button" class="btn btn--primary" data-action="load" title="Carga la web completa (L)">${icon('load')} Cargar página</button>
      <button type="button" class="btn" data-action="api" title="Solo la llamada a la API (A)">${icon('api')} Llamar a la API</button>
      <button type="button" class="btn" data-action="burst" title="8 llamadas seguidas">${icon('burst')} Ráfaga ×8</button>
      <span class="actions__sep"></span>
      <button type="button" class="btn btn--ghost" data-action="time" title="Avanza el reloj: el balanceador hace su health check">${icon('time')} +10 s</button>
      <button type="button" class="btn btn--ghost" data-action="caches" title="Vacía navegador, CDN y Redis">${icon('caches')} Vaciar cachés</button>
      <button type="button" class="btn btn--ghost" data-action="speed" title="Velocidad de la animación">${icon('speed')} <span data-speed></span></button>`;
    el.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (button) actions[button.dataset.action]?.();
    });
  }

  render({ busy, speed }) {
    this.el.querySelectorAll('[data-action]').forEach((b) => (b.disabled = busy && b.dataset.action !== 'speed'));
    this.el.querySelector('[data-speed]').textContent = `${String(SPEEDS[speed]).replace('.', ',')}×`;
  }
}
