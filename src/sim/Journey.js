// Lo que le pasa a una petición de principio a fin. El simulador lo va rellenando paso a paso
// y al final lo congela con toResult(): ese objeto es lo que pintan la escena y las DevTools.
//
// - hops: cada tramo que recorre un paquete (de, a, tipo, ms). La escena los anima en orden.
// - timing: las fases de la cascada de DevTools (DNS, conexión, espera del servidor, descarga).
// - logs: lo que escriben los servidores. console: lo que vería el desarrollador en la consola.

export const STATUS_TEXT = {
  0: '',
  200: 'OK',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

// Color del paquete de vuelta: verde si todo bien, rojo si es un error
export const hopKind = (status) => (status >= 400 ? 'error' : 'response');

export class Journey {
  constructor({ id, path, host, resource, start, origin }) {
    this.id = id;
    this.path = path;
    this.host = host;
    this.resource = resource;
    this.url = `https://${host}${path}`;
    this.requestHeaders = { host, accept: resource.type === 'fetch' ? 'application/json' : '*/*' };
    if (origin) this.requestHeaders.origin = origin;

    this.hops = [];
    this.logs = [];
    this.messages = [];
    this.timing = { start, dns: 0, connect: 0, ssl: 0, wait: 0, download: 0 };
    this.status = 0;
    this.headers = {};
    this.error = null;
    this.blocked = null;
    this.fromCache = null;
  }

  hop(from, to, kind, ms, label, extra = {}) {
    this.hops.push({ from, to, kind, ms, label, ...extra });
  }

  log(source, text, level = 'info') {
    this.logs.push({ source, text, level });
  }

  console(level, text) {
    this.messages.push({ level, text });
  }

  fromDiskCache(ms) {
    this.status = 200;
    this.fromCache = 'disk';
    this.headers = { 'cache-control': this.resource.cacheControl };
    this.timing.wait = ms;
  }

  // La petición no llegó a tener respuesta (DNS caído, servidor que no contesta...)
  fail(error, ms) {
    this.error = error;
    this.timing.wait = ms;
    this.console('error', `GET ${this.url} net::${error}`);
  }

  respond(status, headers, wait, download) {
    this.status = status;
    this.headers = headers;
    this.timing.wait = wait;
    this.timing.download = download;
    if (status >= 400) this.console('error', `GET ${this.url} ${status} (${STATUS_TEXT[status]})`);
  }

  // El servidor ha respondido, pero el navegador no deja que el JavaScript lea la respuesta
  blockByCors(origin) {
    this.blocked = 'cors';
    this.console(
      'error',
      `Access to fetch at '${this.url}' from origin '${origin}' has been blocked by CORS policy: ` +
        `No 'Access-Control-Allow-Origin' header is present on the requested resource.`,
    );
    this.console('error', `GET ${this.url} net::ERR_FAILED ${this.status} (${STATUS_TEXT[this.status]})`);
  }

  toResult() {
    const { dns, connect, wait, download } = this.timing;
    return {
      id: this.id,
      name: this.resource.name,
      url: this.url,
      path: this.path,
      host: this.host,
      method: 'GET',
      type: this.resource.type,
      size: this.status === 200 ? this.resource.size : 0,
      status: this.status,
      statusText: STATUS_TEXT[this.status] ?? '',
      error: this.error,
      blocked: this.blocked,
      fromCache: this.fromCache,
      ok: !this.error && !this.blocked && this.status >= 200 && this.status < 400,
      headers: { request: this.requestHeaders, response: this.headers },
      timing: { ...this.timing, total: dns + connect + wait + download },
      hops: this.hops,
      logs: this.logs,
      console: this.messages,
    };
  }
}
