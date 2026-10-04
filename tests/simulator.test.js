import { beforeEach, describe, expect, it } from 'vitest';
import { Simulator } from '../src/sim/Simulator.js';

const hopsTo = (result, node, kind) => result.hops.filter((h) => h.to === node && (!kind || h.kind === kind));
const byName = (results, name) => results.find((r) => r.name === name);

let sim;
beforeEach(() => {
  sim = new Simulator();
});

describe('primera visita', () => {
  it('resuelve el DNS, abre la conexión y la CDN va a S3 a por los estáticos', () => {
    const results = sim.loadPage();
    expect(results.map((r) => r.name)).toEqual(['tienda.example', 'app.js', 'styles.css', 'products']);
    expect(results.every((r) => r.ok)).toBe(true);

    const page = results[0];
    expect(page.timing.dns).toBeGreaterThan(0);
    expect(page.timing.connect).toBeGreaterThan(0);
    expect(page.headers.response['x-cache']).toBe('Miss from cloudfront');
    expect(hopsTo(page, 's3')).toHaveLength(1);
  });

  it('la API no está en Redis y consulta la base de datos con un JOIN', () => {
    const api = byName(sim.loadPage(), 'products');
    expect(hopsTo(api, 'db', 'query')).toHaveLength(1);
    expect(api.logs.some((l) => l.text.includes('JOIN'))).toBe(true);
    expect(api.logs.some((l) => l.text === 'Redis GET products → (nil)')).toBe(true);
  });

  it('el JS y el CSS se piden en paralelo, después del HTML', () => {
    const [page, script, styles, api] = sim.loadPage();
    const pageEnd = page.timing.start + page.timing.total;
    expect(script.timing.start).toBe(pageEnd);
    expect(styles.timing.start).toBe(pageEnd);
    expect(api.timing.start).toBeGreaterThanOrEqual(script.timing.start + script.timing.total);
  });
});

describe('segunda visita', () => {
  it('JS y CSS salen de la caché de disco, el HTML de la CDN y la API de Redis', () => {
    const cold = sim.loadPage();
    const warm = sim.loadPage();

    expect(byName(warm, 'app.js').fromCache).toBe('disk');
    expect(byName(warm, 'app.js').hops).toHaveLength(0);
    expect(warm[0].headers.response['x-cache']).toBe('Hit from cloudfront');
    expect(warm[0].timing.dns).toBe(0);
    expect(warm[0].timing.connect).toBe(0);

    const api = byName(warm, 'products');
    expect(hopsTo(api, 'db')).toHaveLength(0);
    expect(api.logs.some((l) => l.text === 'Redis GET products → HIT')).toBe(true);

    const total = (results) =>
      Math.max(...results.map((r) => r.timing.start + r.timing.total)) - results[0].timing.start;
    expect(total(warm)).toBeLessThan(total(cold) / 3);
  });

  it('Redis caduca a los 60 s', () => {
    sim.fetchApi();
    sim.advance(61_000);
    expect(hopsTo(sim.fetchApi(), 'db')).toHaveLength(1);
  });
});

describe('consultas N+1', () => {
  it('con el fallo hace 51 consultas y tarda mucho más; con JOIN, 1', () => {
    sim.setFlag('nPlusOne', true);
    const slow = sim.fetchApi();
    expect(hopsTo(slow, 'db', 'query')).toHaveLength(51);
    expect(slow.logs.filter((l) => l.level === 'sql')).toHaveLength(51);

    sim.setFlag('nPlusOne', false);
    sim.clearCaches();
    const fast = sim.fetchApi();
    expect(hopsTo(fast, 'db', 'query')).toHaveLength(1);
    expect(slow.timing.wait).toBeGreaterThan(fast.timing.wait * 3);
  });

  it('la caché lo esconde: la segunda petición no toca la base de datos', () => {
    sim.setFlag('nPlusOne', true);
    sim.fetchApi();
    expect(hopsTo(sim.fetchApi(), 'db')).toHaveLength(0);
  });
});

describe('Redis caído', () => {
  it('la API sigue funcionando pero cada petición va a la base de datos', () => {
    sim.setDown('cache', true);
    const first = sim.fetchApi();
    const second = sim.fetchApi();
    for (const result of [first, second]) {
      expect(result.status).toBe(200);
      expect(result.hops.some((h) => h.from === 'cache' && h.kind === 'error')).toBe(true);
      expect(hopsTo(result, 'db', 'query')).toHaveLength(1);
    }
    expect(first.logs.some((l) => l.text.includes('ECONNREFUSED cache:6379'))).toBe(true);
  });
});

describe('servidor caído y health checks', () => {
  it('502 en las peticiones que le tocan hasta que el balanceador lo saca, luego todo va a API 1', () => {
    sim.setDown('api2', true);
    const before = sim.burst(4).map((r) => r.status);
    expect(before).toEqual([200, 502, 200, 502]);

    const [first, second] = sim.advance(20_000);
    expect(first.results.find((r) => r.id === 'api2')).toMatchObject({ ok: false, healthy: true });
    expect(second.results.find((r) => r.id === 'api2')).toMatchObject({ ok: false, healthy: false, changed: true });

    const after = sim.burst(4);
    expect(after.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(after.every((r) => hopsTo(r, 'api1').length > 0)).toBe(true);
  });

  it('vuelve a recibir tráfico tras 2 health checks correctos', () => {
    sim.setDown('api2', true);
    sim.advance(20_000);
    sim.setDown('api2', false);
    sim.advance(20_000);
    expect(sim.health.api2.healthy).toBe(true);
    const targets = sim.burst(2).map((r) => r.hops.find((h) => h.from === 'alb' && h.kind === 'request').to);
    expect(new Set(targets)).toEqual(new Set(['api1', 'api2']));
  });

  it('sin servidores sanos el balanceador responde 503', () => {
    sim.setDown('api1', true);
    sim.setDown('api2', true);
    sim.advance(20_000);
    expect(sim.fetchApi().status).toBe(503);
  });
});

describe('CORS', () => {
  it('el servidor responde 200, pero el navegador bloquea la respuesta', () => {
    sim.setFlag('crossOriginApi', true);
    const result = sim.fetchApi();
    expect(result.host).toBe('api.tienda.example');
    expect(result.headers.request.origin).toBe('https://tienda.example');
    expect(result.status).toBe(200);
    expect(result.blocked).toBe('cors');
    expect(result.ok).toBe(false);
    expect(result.logs.some((l) => l.text.startsWith('GET /api/products 200'))).toBe(true);
    expect(result.console[0].text).toContain('has been blocked by CORS policy');
    // Va directo al balanceador, sin pasar por la CDN
    expect(result.hops[0]).toMatchObject({ from: 'browser', to: 'dns' });
    expect(hopsTo(result, 'cdn')).toHaveLength(0);
  });

  it('con la cabecera Access-Control-Allow-Origin funciona', () => {
    sim.setFlag('crossOriginApi', true);
    sim.setFlag('corsHeader', true);
    const result = sim.fetchApi();
    expect(result.headers.response['access-control-allow-origin']).toBe('https://tienda.example');
    expect(result.ok).toBe(true);
  });
});

describe('límite de peticiones', () => {
  it('a partir de la sexta en 10 s responde 429 con Retry-After', () => {
    sim.setFlag('rateLimit', true);
    const results = sim.burst(8);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 429, 429, 429]);
    expect(Number(results[5].headers.response['retry-after'])).toBeGreaterThan(0);
    sim.advance(10_000);
    expect(sim.fetchApi().status).toBe(200);
  });
});

describe('otras averías', () => {
  it('DNS caído: ERR_NAME_NOT_RESOLVED y la petición no sale', () => {
    sim.setDown('dns', true);
    const [page] = sim.loadPage();
    expect(page.error).toBe('ERR_NAME_NOT_RESOLVED');
    expect(page.hops.map((h) => h.to)).toEqual(['dns', 'browser']);
  });

  it('base de datos caída: 500', () => {
    sim.setDown('db', true);
    expect(sim.fetchApi().status).toBe(500);
  });

  it('S3 caído con la CDN vacía: 502 de CloudFront', () => {
    sim.setDown('s3', true);
    const [page] = sim.loadPage();
    expect(page.status).toBe(502);
    expect(page.headers.response['x-cache']).toBe('Error from cloudfront');
  });

  it('emite un evento por petición', () => {
    const seen = [];
    sim.events.on('request', (r) => seen.push(r.name));
    sim.loadPage();
    expect(seen).toEqual(['tienda.example', 'app.js', 'styles.css', 'products']);
  });
});
