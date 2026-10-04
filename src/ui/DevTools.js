import { bytes, escapeHtml, ms } from './format.js';
import { icon } from './icons.js';

const TYPES = { document: 'document', script: 'script', stylesheet: 'stylesheet', fetch: 'fetch' };
const PHASES = [
  { key: 'dns', label: 'DNS' },
  { key: 'connect', label: 'Conexión (TCP + TLS)' },
  { key: 'wait', label: 'Esperando al servidor (TTFB)' },
  { key: 'download', label: 'Descarga' },
];

// Panel inferior con el aspecto de las DevTools del navegador: Network (con su cascada de tiempos),
// Console y los logs de los servidores. Solo pinta los resultados que le pasa main.js.
export class DevTools {
  constructor(el, { onToggle }) {
    this.el = el;
    this.rows = new Map(); // id → resultado
    this.selected = null;
    this.onToggle = onToggle;

    el.innerHTML = `
      <header class="devtools__bar">
        <div class="devtools__tabs" role="tablist">
          <button type="button" role="tab" data-tab="network" aria-selected="true">Network</button>
          <button type="button" role="tab" data-tab="console">Console <span class="count" data-console-count hidden></span></button>
          <button type="button" role="tab" data-tab="logs">Logs del servidor</button>
        </div>
        <span class="devtools__summary" data-summary></span>
        <button type="button" class="icon-btn" data-clear title="Limpiar">${icon('clear', 15)}</button>
        <button type="button" class="icon-btn" data-collapse title="Plegar">${icon('chevron', 15)}</button>
      </header>
      <div class="devtools__body">
        <section class="network" data-panel="network">
          <div class="network__table">
            <table>
              <thead><tr><th>Nombre</th><th>Estado</th><th>Tipo</th><th>Tamaño</th><th>Tiempo</th><th class="col-waterfall">Cascada</th></tr></thead>
              <tbody data-rows></tbody>
            </table>
            <p class="empty" data-empty>Pulsa <strong>Cargar página</strong> o lanza un escenario para ver las peticiones.</p>
          </div>
          <aside class="network__detail" data-detail hidden></aside>
        </section>
        <section data-panel="console" hidden><ol class="console" data-console></ol></section>
        <section data-panel="logs" hidden><ol class="logs" data-logs></ol></section>
      </div>`;

    el.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => this.show(tab.dataset.tab)));
    el.querySelector('[data-clear]').addEventListener('click', () => this.clear(true));
    el.querySelector('[data-collapse]').addEventListener('click', () => {
      el.classList.toggle('is-collapsed');
      this.onToggle?.();
    });
    el.querySelector('[data-rows]').addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-id]');
      if (row) this.#select(Number(row.dataset.id));
    });
  }

  show(tab) {
    this.el
      .querySelectorAll('[data-tab]')
      .forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    this.el.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
    if (this.el.classList.contains('is-collapsed')) {
      this.el.classList.remove('is-collapsed');
      this.onToggle?.();
    }
  }

  // Como el navegador al navegar: se vacían Network y Console (los logs del servidor no)
  clear(all = false) {
    this.rows.clear();
    this.selected = null;
    this.el.querySelector('[data-rows]').innerHTML = '';
    this.el.querySelector('[data-console]').innerHTML = '';
    this.el.querySelector('[data-detail]').hidden = true;
    if (all) this.el.querySelector('[data-logs]').innerHTML = '';
    this.#renderSummary();
  }

  // Fila pendiente: la petición ha salido pero el paquete aún no ha vuelto
  add(result) {
    this.rows.set(result.id, { result, pending: true });
    const row = document.createElement('tr');
    row.dataset.id = result.id;
    this.el.querySelector('[data-rows]').appendChild(row);
    this.#renderRow(result.id);
    this.#renderSummary();
  }

  complete(result) {
    if (!this.rows.has(result.id)) this.add(result);
    this.rows.get(result.id).pending = false;
    this.rows.forEach((_, id) => this.#renderRow(id)); // la escala de la cascada cambia con cada fila
    result.console.forEach((m) =>
      this.#append('[data-console]', `<li class="console__${m.level}">${escapeHtml(m.text)}</li>`),
    );
    result.logs.forEach((log) =>
      this.#append(
        '[data-logs]',
        `<li class="logs__${log.level}"><span>${log.source === 'alb' ? 'alb' : log.source.replace('api', 'api-')}</span>${escapeHtml(log.text)}</li>`,
      ),
    );
    this.#renderSummary();
    if (this.selected === result.id) this.#select(result.id);
  }

  #append(selector, html) {
    const list = this.el.querySelector(selector);
    list.insertAdjacentHTML('beforeend', html);
    list.parentElement.scrollTop = list.parentElement.scrollHeight;
  }

  #renderRow(id) {
    const { result: r, pending } = this.rows.get(id);
    const row = this.el.querySelector(`tr[data-id="${id}"]`);
    const failed = r.error || r.blocked || r.status >= 400;
    row.className = [pending && 'is-pending', failed && !pending && 'is-failed', this.selected === id && 'is-selected']
      .filter(Boolean)
      .join(' ');

    const status = pending ? '(pendiente)' : r.error ? '(failed)' : r.blocked ? 'CORS error' : r.status;
    const size = pending ? '' : r.fromCache ? `(${r.fromCache} cache)` : r.error || r.blocked ? '0 B' : bytes(r.size);
    row.innerHTML = `
      <td title="${r.url}">${escapeHtml(r.name)}</td>
      <td>${status}</td>
      <td>${TYPES[r.type]}</td>
      <td>${size}</td>
      <td>${pending ? '' : ms(r.timing.total)}</td>
      <td class="col-waterfall">${pending ? '' : this.#waterfall(r)}</td>`;
  }

  // Barra de la cascada: cada fase con su color, a escala del conjunto de peticiones visibles
  #waterfall(r) {
    const done = [...this.rows.values()].filter((x) => !x.pending).map((x) => x.result);
    const start = Math.min(...done.map((x) => x.timing.start));
    const end = Math.max(...done.map((x) => x.timing.start + x.timing.total));
    const span = Math.max(end - start, 1);
    const pct = (v) => `${((v / span) * 100).toFixed(2)}%`;
    const segments = PHASES.filter((p) => r.timing[p.key] > 0)
      .map((p) => `<i class="wf wf--${p.key}" style="width:${pct(r.timing[p.key])}"></i>`)
      .join('');
    return `<div class="waterfall" style="margin-left:${pct(r.timing.start - start)}">${segments || '<i class="wf wf--cache" style="width:2px"></i>'}</div>`;
  }

  #select(id) {
    this.selected = id;
    this.rows.forEach((_, rowId) => this.#renderRow(rowId));
    const { result: r, pending } = this.rows.get(id);
    const detail = this.el.querySelector('[data-detail]');
    detail.hidden = false;
    if (pending) {
      detail.innerHTML = '<p class="empty">Esperando respuesta…</p>';
      return;
    }
    const list = (headers) =>
      Object.entries(headers)
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`)
        .join('') || '<div><dd class="muted">—</dd></div>';
    const status = r.error
      ? `(failed) net::${r.error}`
      : `${r.status} ${r.statusText}${r.blocked ? ' · bloqueada por CORS' : ''}`;
    detail.innerHTML = `
      <header><strong>${escapeHtml(r.name)}</strong><button type="button" class="icon-btn" data-close-detail>${icon('close', 14)}</button></header>
      <h4>General</h4>
      <dl><div><dt>Request URL</dt><dd>${r.url}</dd></div><div><dt>Método</dt><dd>${r.method}</dd></div><div><dt>Estado</dt><dd>${status}</dd></div></dl>
      <h4>Tiempos</h4>
      <dl>${PHASES.map((p) => `<div><dt><i class="wf wf--${p.key}"></i>${p.label}</dt><dd>${ms(r.timing[p.key])}</dd></div>`).join('')}
        <div class="total"><dt>Total</dt><dd>${ms(r.timing.total)}</dd></div></dl>
      <h4>Cabeceras de respuesta</h4><dl>${list(r.headers.response)}</dl>
      <h4>Cabeceras de petición</h4><dl>${list(r.headers.request)}</dl>`;
    detail.querySelector('[data-close-detail]').addEventListener('click', () => {
      detail.hidden = true;
      this.selected = null;
      this.rows.forEach((_, rowId) => this.#renderRow(rowId));
    });
  }

  #renderSummary() {
    const done = [...this.rows.values()].filter((x) => !x.pending).map((x) => x.result);
    this.el.querySelector('[data-empty]').hidden = this.rows.size > 0;
    const errors = this.el.querySelectorAll('[data-console] .console__error').length;
    const badge = this.el.querySelector('[data-console-count]');
    badge.hidden = !errors;
    badge.textContent = errors;
    if (!done.length) {
      this.el.querySelector('[data-summary]').textContent = '';
      return;
    }
    const start = Math.min(...done.map((x) => x.timing.start));
    const end = Math.max(...done.map((x) => x.timing.start + x.timing.total));
    const transferred = done.reduce((sum, x) => sum + (x.fromCache ? 0 : x.size), 0);
    this.el.querySelector('[data-summary]').textContent =
      `${done.length} peticiones · ${bytes(transferred)} transferidos · terminado en ${ms(end - start)}`;
  }
}
