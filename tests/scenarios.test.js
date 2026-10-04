import { describe, expect, it } from 'vitest';
import { Simulator } from '../src/sim/Simulator.js';
import { SCENARIOS } from '../src/scenarios/index.js';
import { ScenarioRunner } from '../src/scenarios/ScenarioRunner.js';

const span = (results) =>
  results.length
    ? Math.max(...results.map((r) => r.timing.start + r.timing.total)) - Math.min(...results.map((r) => r.timing.start))
    : 0;
const queries = (result) => result.hops.filter((h) => h.to === 'db' && h.kind === 'query').length;
const marks = (result) => result.hops.filter((h) => h.kind === 'mark').map((h) => `${h.at}: ${h.label}`);
const target = (result) => result.hops.find((h) => h.from === 'alb' && h.kind === 'request')?.to;
const numbers = (text) => [...text.matchAll(/(\d+(?:,\d+)?) ms/g)].map((m) => Number(m[1].replace(',', '.')));

// El mismo contexto que construye main.js, pero sin escena: todo instantáneo.
// Guarda qué resultados ha producido cada paso para poder comprobarlos.
function headlessContext() {
  const sim = new Simulator();
  const log = [];
  let step = 0;
  let page = [];
  let last = [];
  const record = (results) => {
    log.push({ step, results });
    page.push(...results);
    last = results;
    return results;
  };
  return {
    sim,
    log,
    setStep: (index) => (step = index),
    prepare() {},
    abort() {},
    reset() {
      sim.reset();
      page = [];
      last = [];
    },
    newPage: () => (page = []),
    warmUp: ({ page: full = true } = {}) => span(full ? sim.loadPage() : [sim.fetchApi()]),
    fetch: async (paths) => record(sim.fetchAll(paths)),
    loadPage: async () => {
      page = [];
      return record(sim.loadPage());
    },
    callApi: async () => record([sim.fetchApi()]),
    burst: async (count) => record(sim.burst(count)),
    passTime: async (seconds) => log.push({ step, checks: sim.advance(seconds * 1000) }),
    clearCaches: () => sim.clearCaches(),
    setDown: (id, down) => sim.setDown(id, down),
    setFlag: (name, value) => sim.setFlag(name, value),
    focus() {},
    note() {},
    select() {},
    showTab() {},
    selectRequest() {},
    last: () => last,
    pageTime: () => span(page),
    wait: async () => {},
  };
}

async function play(id) {
  const scenario = SCENARIOS.find((s) => s.id === id);
  const ctx = headlessContext();
  const runner = new ScenarioRunner(ctx);
  const captions = [];
  runner.events.on('step', ({ index, caption }) => {
    ctx.setStep(index);
    captions.push(caption);
  });
  await runner.run(scenario);
  const results = (index) => ctx.log.filter((e) => e.step === index && e.results).flatMap((e) => e.results);
  const checks = (index) => ctx.log.filter((e) => e.step === index && e.checks).flatMap((e) => e.checks);
  return { scenario, captions, results, checks, sim: ctx.sim };
}

describe('todos los escenarios', () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.title}: se ejecuta entero y cada paso tiene su subtítulo`, async () => {
      const { captions } = await play(scenario.id);
      expect(captions).toHaveLength(scenario.steps.length);
      expect(captions.every((c) => typeof c === 'string' && c.length > 20)).toBe(true);
    });
  }
});

// Lo que cuenta cada subtítulo, comprobado con el simulador
describe('los escenarios dicen la verdad', () => {
  it('Primera visita: DNS, conexión y MISS en la CDN; la API va a la base de datos', async () => {
    const { results, captions } = await play('primera-visita');
    const [page] = results(0);
    expect(page.timing.dns).toBeGreaterThan(0);
    expect(page.timing.connect).toBeGreaterThan(0);
    expect(marks(page)).toContain('cdn: MISS: se pide a S3');
    expect(results(1).map((r) => r.name)).toEqual(['app.js', 'styles.css']);
    expect(marks(results(2)[0])).toContain('cache: MISS');
    expect(queries(results(2)[0])).toBe(1);

    const total = span([...results(0), ...results(1), ...results(2)]);
    expect(numbers(captions[3])).toEqual([Math.round(total)]);
  });

  it('Segunda visita: HIT en la CDN, disco para JS y CSS, HIT en Redis y mucho más rápida', async () => {
    const { results, captions } = await play('segunda-visita');
    const [page] = results(1);
    expect(page.timing.dns).toBe(0);
    expect(page.timing.connect).toBe(0);
    expect(marks(page)).toEqual(['cdn: HIT']);
    expect(results(2).every((r) => r.fromCache === 'disk')).toBe(true);
    expect(queries(results(3)[0])).toBe(0);
    expect(marks(results(3)[0])).toContain('cache: HIT');

    const [warm, cold] = numbers(captions[4]);
    expect(warm * 3).toBeLessThan(cold);
  });

  it('N+1: 51 consultas; Redis lo esconde; con JOIN, 1 consulta y mucho menos tiempo', async () => {
    const { results, captions } = await play('n-mas-1');
    const slow = results(1)[0];
    expect(queries(slow)).toBe(51);
    expect(slow.logs.filter((l) => l.text.startsWith('SELECT * FROM reviews'))).toHaveLength(50);
    expect(numbers(captions[2])).toEqual([Math.round(slow.timing.wait)]);

    expect(queries(results(3)[0])).toBe(0);

    const fast = results(4)[0];
    expect(queries(fast)).toBe(1);
    expect(fast.timing.wait * 3).toBeLessThan(slow.timing.wait);
    expect(numbers(captions[5])).toEqual([Math.round(fast.timing.wait)]);
  });

  it('Redis caído: la API responde pero cada petición va a la base de datos', async () => {
    const { results } = await play('redis-caido');
    expect(queries(results(0)[0])).toBe(0);

    const [degraded] = results(2);
    expect(degraded.status).toBe(200);
    expect(degraded.hops.some((h) => h.from === 'cache' && h.kind === 'error')).toBe(true);
    expect(degraded.timing.wait).toBeGreaterThan(results(0)[0].timing.wait);

    const burst = results(3);
    expect(burst).toHaveLength(8);
    expect(burst.every((r) => r.status === 200 && queries(r) === 1)).toBe(true);

    const [refill, hit] = results(4);
    expect(marks(refill)).toContain('cache: MISS');
    expect(marks(hit)).toContain('cache: HIT');
  });

  it('Servidor caído: una de cada dos da 502 hasta que 2 health checks lo sacan', async () => {
    const { results, checks } = await play('servidor-caido');
    expect(new Set(results(0).map(target))).toEqual(new Set(['api1', 'api2']));

    const statuses = results(2).map((r) => r.status);
    expect(statuses.filter((s) => s === 502)).toHaveLength(2);
    expect(statuses.filter((s) => s === 200)).toHaveLength(2);

    const [first, second] = checks(3);
    expect(first.results.find((r) => r.id === 'api2').healthy).toBe(true);
    expect(second.results.find((r) => r.id === 'api2')).toMatchObject({ healthy: false, changed: true });

    expect(results(4).every((r) => r.status === 200 && target(r) === 'api1')).toBe(true);

    expect(
      checks(5)
        .at(-1)
        .results.find((r) => r.id === 'api2').healthy,
    ).toBe(true);
    expect(new Set(results(5).map(target))).toEqual(new Set(['api1', 'api2']));
  });

  it('CORS: el servidor responde 200, el navegador la bloquea; con la cabecera funciona', async () => {
    const { results } = await play('cors');
    const [blocked] = results(1);
    expect(blocked.host).toBe('api.tienda.example');
    expect(blocked.status).toBe(200);
    expect(blocked.blocked).toBe('cors');
    expect(blocked.console[0].text).toContain('blocked by CORS policy');
    expect(blocked.logs.some((l) => l.text.startsWith('GET /api/products 200'))).toBe(true);

    const [fixed] = results(4);
    expect(fixed.ok).toBe(true);
    expect(fixed.headers.response['access-control-allow-origin']).toBe('https://tienda.example');
  });

  it('Límite de peticiones: 5 pasan, 3 reciben 429 con Retry-After; tras 10 s vuelve a ir', async () => {
    const { results } = await play('rate-limit');
    const burst = results(1);
    expect(burst.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 429, 429, 429]);
    expect(Number(burst.at(-1).headers.response['retry-after'])).toBeGreaterThan(0);
    expect(results(3)[0].status).toBe(200);
  });
});
