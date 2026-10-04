import './styles/main.css';
import { NODES } from './config/topology.js';
import { Simulator } from './sim/Simulator.js';
import { SceneManager } from './scene/SceneManager.js';
import { InfraView } from './scene/InfraView.js';
import { PacketAnimator } from './scene/PacketAnimator.js';
import { Notes } from './scene/Notes.js';
import { Picker } from './scene/Picker.js';
import { ActionBar, SPEEDS } from './ui/ActionBar.js';
import { DevTools } from './ui/DevTools.js';
import { InfraPanel, statusOf } from './ui/InfraPanel.js';
import { NodePanel } from './ui/NodePanel.js';
import { ScenarioMenu } from './ui/ScenarioMenu.js';
import { Caption } from './ui/Caption.js';
import { icon } from './ui/icons.js';
import { SCENARIOS } from './scenarios/index.js';
import { ScenarioRunner } from './scenarios/ScenarioRunner.js';

// Crea las piezas y las conecta. El simulador calcula cada petición al instante; aquí se anima
// su recorrido y, cuando el paquete vuelve al navegador, se completa la fila de las DevTools.

const sceneManager = new SceneManager(document.getElementById('viewport'));
const view = new InfraView(sceneManager);
const animator = new PacketAnimator(sceneManager, view);
const notes = new Notes(sceneManager, view);
const sim = new Simulator();

const state = { busy: false, speed: 0, page: [], last: [] };

document.getElementById('brand-mark').innerHTML = icon('brand', 22);

const devtools = new DevTools(document.getElementById('devtools'), { onToggle: updateInsets });
const nodePanel = new NodePanel(document.getElementById('node-panel'), sim);
const infraPanel = new InfraPanel(document.getElementById('infra-panel'), sim, {
  onSelect: (id) => selectNode(id),
  onToggle: updateInsets,
});
const actionBar = new ActionBar(document.getElementById('actions'), {
  load: () => run(loadPage),
  api: () => run(() => callApi()),
  burst: () => run(() => burst(8)),
  time: () => run(() => passTime(10)),
  caches: () => clearCaches(),
  speed: () => {
    state.speed = (state.speed + 1) % SPEEDS.length;
    animator.speed = SPEEDS[state.speed];
    renderActions();
  },
});

new Picker(sceneManager, view, (id) => selectNode(id));
animator.onMark = (mark) => notes.on(mark.at, mark.label, mark.tone);

function selectNode(id) {
  nodePanel.open(id);
  sceneManager.focusOn(view.topOf(id), 15);
}

function renderActions() {
  actionBar.render(state);
}

// ───────── Acciones ─────────
// Las que lanzan peticiones devuelven los resultados del simulador (los usan los escenarios)

async function run(action) {
  if (state.busy || runner.running) return;
  state.busy = true;
  renderActions();
  try {
    await action();
  } finally {
    state.busy = false;
    renderActions();
  }
}

// Anima una tanda de peticiones a la vez: filas pendientes, viaje de los paquetes y filas completas
async function animateRequests(results) {
  results.forEach((r) => devtools.add(r));
  state.page.push(...results);
  state.last = results;
  await animator.play(results.map((r) => r.hops));
  results.forEach((r) => devtools.complete(r));
  sync();
  return results;
}

// El navegador pide el HTML; después el JS y el CSS a la vez; y cuando llega el JS, la API
async function loadPage() {
  newPage();
  const [page, ...rest] = sim.loadPage();
  const groups = [[page], rest.filter((r) => r.type !== 'fetch'), rest.filter((r) => r.type === 'fetch')];
  const generation = animator.generation;
  for (const group of groups.filter((g) => g.length)) {
    await animateRequests(group);
    if (generation !== animator.generation) break; // se ha cancelado a medias
  }
  return [page, ...rest];
}

// Como al navegar a una página nueva: Network y Console empiezan de cero
function newPage() {
  devtools.clear();
  state.page = [];
}

const fetchPaths = (paths) => animateRequests(sim.fetchAll(paths));
const callApi = () => animateRequests([sim.fetchApi()]);

// Varias llamadas seguidas: cada una sale medio segundo después de la anterior
async function burst(count) {
  const results = sim.burst(count);
  await Promise.all(
    results.map(async (result, k) => {
      if (await animator.wait(k * 0.5)) await animateRequests([result]);
    }),
  );
  state.last = results;
  return results;
}

// Avanza el reloj: el balanceador hace sus health checks cada 10 s simulados
async function passTime(seconds) {
  notes.on('alb', `+${seconds} s`, 'info');
  for (const check of sim.advance(seconds * 1000)) {
    const completed = await animator.play(check.tracks);
    sync();
    if (!completed) return;
  }
}

function clearCaches() {
  sim.clearCaches();
  for (const id of ['browser', 'cdn', 'cache']) notes.on(id, 'Caché vacía', 'info');
}

// Tiempo desde la primera petición hasta la última respuesta, como el "Finish" de DevTools
const span = (results) =>
  results.length
    ? Math.max(...results.map((r) => r.timing.start + r.timing.total)) - Math.min(...results.map((r) => r.timing.start))
    : 0;

// ───────── Escenarios ─────────
// El contexto es la única forma que tiene un escenario de actuar sobre la app.
// tests/scenarios.test.js construye uno equivalente sin escena.
const waits = new Set();
const scenarioContext = {
  prepare() {
    animator.cancel();
    nodePanel.close();
  },
  abort() {
    animator.cancel();
    waits.forEach((cancel) => cancel());
  },
  // Todo encendido, sin fallos y con las cachés vacías
  reset() {
    animator.cancel();
    sim.reset();
    devtools.clear(true);
    state.page = [];
    state.last = [];
    sync();
  },
  newPage,
  // Visita previa sin animar, para partir con las cachés llenas. Devuelve lo que tardó
  warmUp({ page = true } = {}) {
    const results = page ? sim.loadPage() : [sim.fetchApi()];
    sync();
    return span(results);
  },
  fetch: fetchPaths,
  loadPage,
  callApi,
  burst,
  passTime,
  clearCaches,
  setDown: (id, down) => sim.setDown(id, down),
  setFlag: (name, value) => sim.setFlag(name, value),
  focus: (id) => (id === 'home' ? sceneManager.resetView() : sceneManager.focusOn(view.topOf(id), 15)),
  note: (id, text, tone) => notes.on(id, text, tone),
  select: selectNode,
  showTab: (tab) => devtools.show(tab),
  selectRequest: (name) => devtools.selectByName(name),
  last: () => state.last,
  pageTime: () => span(state.page),
  wait: (ms) =>
    new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        waits.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms / animator.speed);
      waits.add(done);
    }),
};

const runner = new ScenarioRunner(scenarioContext);
new ScenarioMenu(document.getElementById('hud-actions'), SCENARIOS, {
  onRun: (scenario) => runner.run(scenario),
  onGuidedChange: (guided) => (runner.guided = guided),
});
new Caption(document.getElementById('caption'), runner);
runner.events.on('start', () => {
  state.busy = true;
  renderActions();
});
runner.events.on('end', () => {
  state.busy = false;
  renderActions();
});

// Enlace directo a un escenario (?escenario=cors), para compartirlo; arranca tras la intro
const linked = SCENARIOS.find((s) => s.id === new URLSearchParams(location.search).get('escenario'));
if (linked) setTimeout(() => runner.run(linked), 2800);

// ───────── Estado de la escena y los paneles ─────────

function sync() {
  for (const { id } of NODES) {
    const status = statusOf(sim, id);
    view.setStatus(id, status);
    view.setBadge(id, badgeOf(id, status));
  }
  view.setLinkActive('browser', 'alb', sim.flags.crossOriginApi);
  infraPanel.sync();
  nodePanel.render();
}

function badgeOf(id, status) {
  if (status === 'down') return 'APAGADO';
  if (status === 'unhealthy') return 'FUERA DEL BALANCEADOR';
  const { requests, hits, misses } = sim.stats[id];
  if (id === 'cdn' || id === 'cache') return hits + misses ? `HIT ${hits} · MISS ${misses}` : null;
  if (id === 'db') return requests ? plural(requests, 'consulta', 'consultas') : null;
  if (id === 'api1' || id === 'api2') return requests ? plural(requests, 'petición', 'peticiones') : null;
  return null;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// La cámara centra la escena en el hueco que dejan el panel derecho y las DevTools
function updateInsets() {
  const narrow = window.innerWidth <= 900;
  const panel = document.getElementById('infra-panel');
  const dock = document.getElementById('devtools');
  sceneManager.setInsets({
    // En móvil los controles van arriba, uno debajo de otro
    top: narrow ? panel.getBoundingClientRect().bottom : 0,
    right: narrow || panel.classList.contains('is-collapsed') ? 0 : panel.offsetWidth + 16,
    bottom: dock.offsetHeight + 16,
  });
}

sim.events.on('change', sync);
window.addEventListener('resize', updateInsets);

window.addEventListener('keydown', (event) => {
  if (event.target instanceof Element && event.target.closest('input, select, textarea, button')) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const actions = {
    KeyL: () => run(loadPage),
    KeyA: () => run(() => callApi()),
    KeyR: () => sceneManager.resetView(),
    Escape: () => nodePanel.close(),
  };
  if (!actions[event.code]) return;
  event.preventDefault();
  actions[event.code]();
});

sync();
renderActions();
updateInsets();
sceneManager.start();

if (import.meta.env.DEV) {
  Object.assign(window, {
    sim,
    view,
    animator,
    sceneManager,
    devtools,
    state,
    run,
    runner,
    loadPage,
    callApi,
    burst,
    passTime,
  });
}
