import { Emitter } from '../core/Emitter.js';
import { API_SERVERS, NODES, nodeById } from '../config/topology.js';
import { API_HOST, DNS_RECORDS, PRODUCT_COUNT, RESOURCES, SITE_HOST } from '../config/site.js';
import { CACHE_TTL_MS, HEALTH_CHECK, LATENCY as L, RATE_LIMIT } from '../config/latency.js';
import { Journey, STATUS_TEXT, hopKind } from './Journey.js';

// Fallos de código o de configuración que se pueden activar (además de apagar equipos)
export const DEFAULT_FLAGS = {
  nPlusOne: false, // el backend hace una consulta por producto en vez de un JOIN
  crossOriginApi: false, // la API se sirve desde api.tienda.example en lugar de pasar por la CDN
  corsHeader: false, // la API devuelve Access-Control-Allow-Origin
  rateLimit: false, // la API limita a 5 peticiones cada 10 s
};

// Simulador de la infraestructura. Calcula de forma síncrona y determinista todo lo que le pasa
// a una petición y devuelve el resultado (ver Journey.js). No sabe que existe la escena 3D:
// la escena solo anima los hops del resultado, y en los tests se comprueba el resultado directamente.
//
// Eventos: 'request' (resultado), 'healthcheck' (comprobación), 'change' (equipo o fallo cambiado)
export class Simulator {
  constructor() {
    this.events = new Emitter();
    this.reset();
  }

  reset() {
    this.now = 0; // reloj simulado en ms
    this.nextId = 1;
    this.down = new Set();
    this.flags = { ...DEFAULT_FLAGS };
    this.health = Object.fromEntries(API_SERVERS.map((id) => [id, { healthy: true, streak: 0 }]));
    this.nextTarget = 0;
    this.nextHealthCheck = HEALTH_CHECK.intervalMs;
    this.rate = { windowStart: 0, count: 0 };
    this.stats = Object.fromEntries(NODES.map((n) => [n.id, { requests: 0, errors: 0, hits: 0, misses: 0 }]));
    this.clearCaches();
  }

  // ───────── Cambios desde fuera (panel, escenarios) ─────────

  isDown(id) {
    return this.down.has(id);
  }

  setDown(id, down) {
    if (down) this.down.add(id);
    else this.down.delete(id);
    // Redis vive en memoria: si el nodo cae, vuelve vacío
    if (id === 'cache' && down) this.redis.clear();
    this.events.emit('change', { type: 'node', id, down });
  }

  setFlag(name, value) {
    this.flags[name] = value;
    this.events.emit('change', { type: 'flag', name, value });
  }

  // Vacía todas las cachés y cierra las conexiones: como un despliegue nuevo visitado en incógnito
  clearCaches() {
    this.clearBrowser();
    this.cdnCache = new Map(); // ruta → instante en que se guardó
    this.redis = new Map(); // clave → instante en que caduca
    this.events?.emit('change', { type: 'caches' });
  }

  // Solo el navegador: caché de disco, caché DNS y conexiones abiertas
  clearBrowser() {
    this.browserCache = new Set();
    this.dnsCache = new Set();
    this.connections = new Set();
  }

  // ───────── Peticiones ─────────

  // Carga la página como un navegador: primero el HTML, luego JS y CSS en paralelo
  // y, cuando el JavaScript se ha descargado, la llamada a la API
  loadPage() {
    const [page] = this.fetchAll(['/']);
    if (!page.ok) return [page];
    const [script, styles] = this.fetchAll(['/app.js', '/styles.css']);
    if (!script.ok) return [page, script, styles];
    return [page, script, styles, this.fetchApi()];
  }

  // Varias peticiones a la vez: todas salen en el mismo instante y el reloj avanza hasta la última
  fetchAll(paths) {
    const start = this.now;
    let end = start;
    const results = paths.map((path) => {
      this.now = start;
      const result = this.fetch(path, { crossOrigin: Boolean(RESOURCES[path]?.api) && this.flags.crossOriginApi });
      end = Math.max(end, this.now);
      return result;
    });
    this.now = end;
    return results;
  }

  fetchApi() {
    return this.fetch('/api/products', { crossOrigin: this.flags.crossOriginApi });
  }

  // Varias llamadas seguidas a la API, como alguien pulsando un botón sin parar
  burst(count, gapMs = 150) {
    return Array.from({ length: count }, () => {
      const result = this.fetchApi();
      this.now += gapMs;
      return result;
    });
  }

  fetch(path, { crossOrigin = false } = {}) {
    const resource = RESOURCES[path];
    if (!resource) throw new Error(`Recurso desconocido: ${path}`);
    const host = resource.api && crossOrigin ? API_HOST : SITE_HOST;
    const origin = host === SITE_HOST ? null : `https://${SITE_HOST}`;
    const j = new Journey({ id: this.nextId++, path, host, resource, start: this.now, origin });
    this.stats.browser.requests++;

    // 1. Caché del navegador: los archivos inmutables ni siquiera salen a la red
    if (this.browserCache.has(path)) {
      j.fromDiskCache(L.diskCache);
      j.mark('browser', `${resource.name} (disk cache)`, 'success');
      return this.#finish(j);
    }

    // 2. DNS: nombre → IP
    if (!this.#resolve(j, host)) return this.#finish(j);

    // 3. Conexión TCP + TLS con la CDN (o con el balanceador si la API va en su propio dominio)
    const edge = host === SITE_HOST ? 'cdn' : 'alb';
    const oneWay = edge === 'cdn' ? L.browserToCdn : L.browserToAlb;
    if (this.isDown(edge)) {
      j.hop('browser', edge, 'request', oneWay, 'conectar');
      j.hop(edge, 'browser', 'error', oneWay, 'sin respuesta');
      j.fail('ERR_CONNECTION_TIMED_OUT', 2 * oneWay);
      j.mark('browser', 'ERR_CONNECTION_TIMED_OUT', 'error');
      this.connections.delete(host);
      return this.#finish(j);
    }
    if (!this.connections.has(host)) {
      j.timing.connect = 4 * oneWay; // 1 ida y vuelta TCP + 1 ida y vuelta TLS 1.3
      j.timing.ssl = 2 * oneWay;
      this.connections.add(host);
    }

    // 4. Petición, trabajo del servidor y respuesta
    j.hop('browser', edge, 'request', oneWay, `GET ${path}`);
    const answer = edge === 'cdn' ? this.#cdn(j, resource) : this.#balance(j);
    j.hop(edge, 'browser', hopKind(answer.status), oneWay, `${answer.status} ${STATUS_TEXT[answer.status]}`);
    const download = answer.status === 200 ? resource.size / L.bandwidth : 0.3;
    j.respond(answer.status, answer.headers, 2 * oneWay + answer.ms, download);

    // 5. CORS: la respuesta ya ha llegado, pero el navegador decide si el JavaScript puede leerla
    if (origin && answer.status < 400 && !answer.headers['access-control-allow-origin']) {
      j.blockByCors(origin);
      j.mark('browser', 'Bloqueada por CORS', 'error');
    }

    if (answer.status === 200 && resource.cacheControl.includes('immutable')) this.browserCache.add(path);
    return this.#finish(j);
  }

  #finish(j) {
    const result = j.toResult();
    this.now = result.timing.start + result.timing.total;
    this.events.emit('request', result);
    return result;
  }

  #resolve(j, host) {
    if (this.dnsCache.has(host)) return true;
    j.hop('browser', 'dns', 'dns', L.browserToDns, `¿IP de ${host}?`);
    if (this.isDown('dns')) {
      j.hop('dns', 'browser', 'error', L.browserToDns, 'sin respuesta');
      j.fail('ERR_NAME_NOT_RESOLVED', 2 * L.browserToDns);
      j.mark('browser', 'ERR_NAME_NOT_RESOLVED', 'error');
      return false;
    }
    this.stats.dns.requests++;
    j.hop('dns', 'browser', 'dns', L.browserToDns, `${host} = ${DNS_RECORDS[host]}`);
    j.timing.dns = 2 * L.browserToDns + L.dnsLookup;
    this.dnsCache.add(host);
    return true;
  }

  // ───────── CDN ─────────

  #cdn(j, resource) {
    this.stats.cdn.requests++;

    // CloudFront no cachea /api/*: lo reenvía tal cual al balanceador
    if (resource.api) {
      j.hop('cdn', 'alb', 'request', L.cdnToOrigin, `GET ${j.path}`);
      if (this.isDown('alb')) {
        j.hop('alb', 'cdn', 'error', L.cdnToOrigin, 'sin respuesta');
        return { status: 502, headers: { 'x-cache': 'Error from cloudfront' }, ms: 2 * L.cdnToOrigin };
      }
      const answer = this.#balance(j);
      j.hop('alb', 'cdn', hopKind(answer.status), L.cdnToOrigin, `${answer.status} ${STATUS_TEXT[answer.status]}`);
      return {
        ...answer,
        headers: { ...answer.headers, 'x-cache': 'Miss from cloudfront' },
        ms: answer.ms + 2 * L.cdnToOrigin,
      };
    }

    // Archivos estáticos: si la CDN ya los tiene, responde ella sin ir a S3
    const storedAt = this.cdnCache.get(j.path);
    if (storedAt !== undefined) {
      this.stats.cdn.hits++;
      j.mark('cdn', 'HIT', 'success');
      const age = String(Math.round((this.now - storedAt) / 1000));
      return {
        status: 200,
        headers: { 'cache-control': resource.cacheControl, 'x-cache': 'Hit from cloudfront', age },
        ms: 1,
      };
    }

    this.stats.cdn.misses++;
    j.mark('cdn', 'MISS: se pide a S3', 'warning');
    j.hop('cdn', 's3', 'request', L.cdnToOrigin, `GET ${j.path}`);
    if (this.isDown('s3')) {
      j.hop('s3', 'cdn', 'error', L.cdnToOrigin, 'sin respuesta');
      return { status: 502, headers: { 'x-cache': 'Error from cloudfront' }, ms: 2 * L.cdnToOrigin };
    }
    this.stats.s3.requests++;
    j.hop('s3', 'cdn', 'response', L.cdnToOrigin, '200 OK');
    this.cdnCache.set(j.path, this.now);
    return {
      status: 200,
      headers: { 'cache-control': resource.cacheControl, 'x-cache': 'Miss from cloudfront' },
      ms: 2 * L.cdnToOrigin + L.s3Read,
    };
  }

  // ───────── Balanceador ─────────

  #balance(j) {
    this.stats.alb.requests++;
    const target = this.#pickTarget();
    if (!target) {
      j.log('alb', 'No hay ningún servidor sano: 503 Service Unavailable', 'error');
      j.mark('alb', '503: ningún servidor sano', 'error');
      return { status: 503, headers: {}, ms: 1 };
    }

    j.hop('alb', target, 'request', L.albToApi, `GET ${j.path}`);
    // El balanceador aún cree que está sano, pero el servidor no contesta
    if (this.isDown(target)) {
      j.hop(target, 'alb', 'error', L.albToApi, 'conexión rechazada');
      j.log('alb', `${nodeById(target).label} no responde: 502 Bad Gateway`, 'error');
      j.mark('alb', `502: ${nodeById(target).label} no responde`, 'error');
      this.stats[target].errors++;
      return { status: 502, headers: {}, ms: 2 * L.albToApi + 1 };
    }

    const answer = this.#api(j, target);
    j.hop(target, 'alb', hopKind(answer.status), L.albToApi, `${answer.status} ${STATUS_TEXT[answer.status]}`);
    return { ...answer, ms: answer.ms + 2 * L.albToApi };
  }

  // Round robin entre los servidores que el balanceador considera sanos
  #pickTarget() {
    const healthy = API_SERVERS.filter((id) => this.health[id].healthy);
    if (!healthy.length) return null;
    return healthy[this.nextTarget++ % healthy.length];
  }

  // ───────── API ─────────

  #api(j, server) {
    this.stats[server].requests++;
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
    if (this.flags.corsHeader) headers['access-control-allow-origin'] = `https://${SITE_HOST}`;
    let ms = L.apiProcessing;

    // Límite de peticiones: ventana fija de 10 s (contador compartido por las dos instancias)
    if (this.flags.rateLimit) {
      const windowStart = Math.floor(this.now / RATE_LIMIT.windowMs) * RATE_LIMIT.windowMs;
      if (windowStart !== this.rate.windowStart) this.rate = { windowStart, count: 0 };
      this.rate.count++;
      if (this.rate.count > RATE_LIMIT.max) {
        const retryAfter = Math.ceil((windowStart + RATE_LIMIT.windowMs - this.now) / 1000);
        j.log(server, `GET /api/products 429 · más de ${RATE_LIMIT.max} peticiones en 10 s`, 'warn');
        j.mark(server, `429: espera ${retryAfter} s`, 'error');
        return { status: 429, headers: { ...headers, 'retry-after': String(retryAfter) }, ms: 1 };
      }
    }

    // 1. ¿Está en la caché?
    const cached = this.#cacheGet(j, server);
    ms += cached.ms;
    if (cached.hit) {
      j.log(server, `GET /api/products 200 · ${round(ms)} ms (desde Redis)`);
      return { status: 200, headers, ms };
    }

    // 2. Base de datos
    if (this.isDown('db')) {
      j.hop(server, 'db', 'query', L.apiToDb, 'SELECT …');
      j.hop('db', server, 'error', L.apiToDb, 'ECONNREFUSED');
      j.log(server, 'Error: connect ECONNREFUSED db:5432', 'error');
      j.log(server, 'GET /api/products 500', 'error');
      j.mark(server, '500 Internal Server Error', 'error');
      this.stats[server].errors++;
      return { status: 500, headers, ms: ms + 2 * L.apiToDb };
    }
    const queries = this.#queries();
    for (const query of queries) {
      const stream = queries.length > 1; // con N+1 las consultas salen en ráfaga
      j.hop(server, 'db', 'query', L.apiToDb, query.short, { stream });
      j.hop('db', server, 'reply', L.apiToDb, query.rows, { stream });
      j.log(server, query.sql, 'sql');
      ms += 2 * L.apiToDb + query.ms;
      this.stats.db.requests++;
    }
    j.mark(
      'db',
      queries.length === 1 ? '1 consulta' : `${queries.length} consultas`,
      queries.length > 1 ? 'error' : 'info',
    );

    // 3. Se guarda en la caché para las siguientes peticiones
    if (!this.isDown('cache')) {
      j.hop(server, 'cache', 'query', L.apiToCache, 'SET products EX 60');
      this.redis.set('products', this.now + CACHE_TTL_MS);
      j.log(server, 'Redis SET products EX 60');
      ms += L.apiToCache;
    }
    const count = queries.length === 1 ? '1 consulta' : `${queries.length} consultas`;
    j.log(server, `GET /api/products 200 · ${round(ms)} ms (${count})`);
    return { status: 200, headers, ms };
  }

  #cacheGet(j, server) {
    j.hop(server, 'cache', 'query', L.apiToCache, 'GET products');
    if (this.isDown('cache')) {
      j.hop('cache', server, 'error', L.apiToCache, 'ECONNREFUSED');
      j.log(server, 'Redis no responde (ECONNREFUSED cache:6379): se va a la base de datos', 'warn');
      j.mark(server, 'Sin Redis: a la base de datos', 'warning');
      return { hit: false, ms: 2 * L.apiToCache };
    }
    const expires = this.redis.get('products');
    const hit = expires !== undefined && expires > this.now;
    this.stats.cache[hit ? 'hits' : 'misses']++;
    j.hop('cache', server, 'reply', L.apiToCache, hit ? 'HIT' : '(nil)');
    j.mark('cache', hit ? 'HIT' : 'MISS', hit ? 'success' : 'warning');
    j.log(server, `Redis GET products → ${hit ? 'HIT' : '(nil)'}`);
    return { hit, ms: 2 * L.apiToCache + L.cacheLookup };
  }

  // Con el fallo N+1, una consulta para los productos y otra por cada producto para sus reseñas.
  // Bien hecho, una sola consulta con JOIN
  #queries() {
    if (!this.flags.nPlusOne) {
      return [
        {
          short: 'SELECT … JOIN reviews',
          sql: 'SELECT p.*, r.* FROM products p LEFT JOIN reviews r ON r.product_id = p.id LIMIT 50',
          rows: `${PRODUCT_COUNT} productos`,
          ms: L.dbJoinQuery,
        },
      ];
    }
    return [
      { short: 'SELECT products', sql: 'SELECT * FROM products LIMIT 50', rows: '50 filas', ms: L.dbQuery },
      ...Array.from({ length: PRODUCT_COUNT }, (_, k) => ({
        short: `reviews #${k + 1}`,
        sql: `SELECT * FROM reviews WHERE product_id = ${k + 1}`,
        rows: 'reseñas',
        ms: L.dbQuery,
      })),
    ];
  }

  // ───────── Health checks del balanceador ─────────

  // Avanza el reloj; cada 10 s simulados el balanceador comprueba los servidores
  advance(ms) {
    const end = this.now + ms;
    const checks = [];
    while (this.nextHealthCheck <= end) {
      this.now = this.nextHealthCheck;
      checks.push(this.runHealthChecks());
      this.nextHealthCheck += HEALTH_CHECK.intervalMs;
    }
    this.now = end;
    return checks;
  }

  // El balanceador pide GET /health a cada servidor. Hacen falta 2 fallos seguidos para darlo
  // por caído y 2 aciertos seguidos para volver a mandarle tráfico
  runHealthChecks() {
    const tracks = [];
    const results = API_SERVERS.map((id) => {
      const state = this.health[id];
      const ok = !this.isDown(id);
      tracks.push([
        { from: 'alb', to: id, kind: 'health', ms: L.albToApi, label: 'GET /health' },
        { from: id, to: 'alb', kind: ok ? 'health' : 'error', ms: L.albToApi, label: ok ? '200 OK' : 'sin respuesta' },
      ]);

      state.streak = ok === state.healthy ? 0 : state.streak + 1;
      const threshold = state.healthy ? HEALTH_CHECK.unhealthyThreshold : HEALTH_CHECK.healthyThreshold;
      const changed = state.streak >= threshold;
      if (changed) {
        state.healthy = !state.healthy;
        state.streak = 0;
      }
      const label = nodeById(id).label;
      const track = tracks.at(-1);
      if (changed) {
        track.push(
          mark(
            'alb',
            state.healthy ? `${label} vuelve al balanceador` : `${label} fuera del balanceador`,
            state.healthy ? 'success' : 'error',
          ),
        );
      } else if (state.streak) {
        track.push(mark('alb', `${label}: ${state.streak} de ${threshold} comprobaciones`, 'warning'));
      }
      return { id, ok, healthy: state.healthy, changed, streak: state.streak };
    });
    const check = { at: this.now, results, tracks };
    this.events.emit('healthcheck', check);
    return check;
  }
}

const round = (ms) => Math.round(ms * 10) / 10;
const mark = (at, label, tone) => ({ kind: 'mark', from: at, to: at, at, label, tone, ms: 0 });
