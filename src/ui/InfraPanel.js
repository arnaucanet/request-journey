import { NODES } from '../config/topology.js';
import { PACKET_COLORS, PACKET_LABELS } from '../scene/theme.js';
import { icon } from './icons.js';

const FLAGS = [
  { name: 'nPlusOne', label: 'Consultas N+1', detail: 'una consulta por producto en vez de un JOIN' },
  { name: 'crossOriginApi', label: 'API en su propio dominio', detail: 'api.tienda.example, sin pasar por la CDN' },
  { name: 'corsHeader', label: 'Cabecera CORS', detail: 'Access-Control-Allow-Origin en la API' },
  { name: 'rateLimit', label: 'Límite de peticiones', detail: '5 cada 10 s por cliente' },
];

// Panel derecho: encender y apagar equipos, activar fallos de código y la leyenda de colores.
// Solo traduce clics a llamadas al simulador; sync() pinta el estado actual.
export class InfraPanel {
  constructor(el, sim, { onSelect, onToggle }) {
    this.el = el;
    this.sim = sim;
    el.innerHTML = `
      <button class="panel__header" type="button" aria-expanded="true">
        <span>Infraestructura</span>${icon('chevron')}
      </button>
      <div class="panel__body">
        <section class="group">
          <h3>Equipos <small>clic para ver qué hace</small></h3>
          <ul class="nodes">
            ${NODES.map(
              (n) => `
              <li data-node="${n.id}">
                <i class="status-dot"></i>
                <button type="button" class="nodes__name" data-select="${n.id}">${n.label}<small>${n.service}</small></button>
                ${n.canFail ? `<label class="switch" title="Encender / apagar"><input type="checkbox" data-power="${n.id}" checked /><span></span></label>` : ''}
              </li>`,
            ).join('')}
          </ul>
        </section>
        <section class="group">
          <h3>Fallos de código y configuración</h3>
          ${FLAGS.map(
            (f) => `
            <label class="flag">
              <input type="checkbox" data-flag="${f.name}" />
              <span><strong>${f.label}</strong><small>${f.detail}</small></span>
            </label>`,
          ).join('')}
        </section>
        <section class="group">
          <h3>Paquetes</h3>
          <ul class="legend">
            ${Object.entries(PACKET_LABELS)
              .map(([kind, label]) => `<li><i style="--c:${PACKET_COLORS[kind]}"></i>${label}</li>`)
              .join('')}
          </ul>
        </section>
      </div>`;

    const header = el.querySelector('.panel__header');
    const collapse = (collapsed) => {
      el.classList.toggle('is-collapsed', collapsed);
      header.setAttribute('aria-expanded', String(!collapsed));
      onToggle?.();
    };
    header.addEventListener('click', () => collapse(!el.classList.contains('is-collapsed')));
    if (window.matchMedia('(max-width: 900px)').matches) collapse(true);

    el.addEventListener('change', (event) => {
      const { power, flag } = event.target.dataset;
      if (power) sim.setDown(power, !event.target.checked);
      if (flag) sim.setFlag(flag, event.target.checked);
    });
    el.addEventListener('click', (event) => {
      const button = event.target.closest('[data-select]');
      if (button) onSelect(button.dataset.select);
    });
  }

  sync() {
    const { sim } = this;
    for (const node of NODES) {
      const status = statusOf(sim, node.id);
      this.el.querySelector(`[data-node="${node.id}"]`).dataset.status = status;
      const power = this.el.querySelector(`[data-power="${node.id}"]`);
      if (power) power.checked = !sim.isDown(node.id);
    }
    this.el.querySelectorAll('[data-flag]').forEach((input) => (input.checked = sim.flags[input.dataset.flag]));
  }
}

// up, unhealthy (encendido pero fuera del balanceador) o down
export function statusOf(sim, id) {
  if (sim.isDown(id)) return 'down';
  if (sim.health[id] && !sim.health[id].healthy) return 'unhealthy';
  return 'up';
}
