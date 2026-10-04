import { nodeById } from '../config/topology.js';
import { statusOf } from './InfraPanel.js';
import { icon } from './icons.js';

const STATUS_TEXT = {
  up: 'Funcionando',
  unhealthy: 'Encendido, pero fuera del balanceador',
  down: 'Apagado',
};

// Ficha de un equipo al hacer clic: qué hace, en qué servicio de AWS vive y sus contadores
export class NodePanel {
  constructor(el, sim) {
    this.el = el;
    this.sim = sim;
    this.id = null;
    el.addEventListener('click', (event) => {
      if (event.target.closest('[data-close]')) this.close();
      const power = event.target.closest('[data-power]');
      if (power) sim.setDown(this.id, !sim.isDown(this.id));
    });
  }

  open(id) {
    this.id = id;
    this.el.hidden = false;
    this.render();
  }

  close() {
    this.id = null;
    this.el.hidden = true;
  }

  render() {
    if (!this.id) return;
    const node = nodeById(this.id);
    const stats = this.sim.stats[this.id];
    const status = statusOf(this.sim, this.id);
    const counters = [
      ['Peticiones', stats.requests],
      ['Errores', stats.errors],
      ...(stats.hits || stats.misses
        ? [
            ['Aciertos de caché (HIT)', stats.hits],
            ['Fallos de caché (MISS)', stats.misses],
          ]
        : []),
    ];
    this.el.innerHTML = `
      <header class="node-panel__header">
        <div><strong>${node.label}</strong><span>${node.service}</span></div>
        <button type="button" class="icon-btn" data-close aria-label="Cerrar">${icon('close')}</button>
      </header>
      <p class="node-panel__role">${node.role}</p>
      <p class="node-panel__status" data-status="${status}"><i class="status-dot"></i>${STATUS_TEXT[status]}</p>
      <dl class="node-panel__stats">${counters.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      ${
        node.canFail
          ? `<button type="button" class="btn ${status === 'down' ? 'btn--primary' : 'btn--danger'}" data-power>
               ${icon('power', 15)} ${status === 'down' ? 'Encender' : 'Apagar'}
             </button>`
          : ''
      }`;
  }
}
