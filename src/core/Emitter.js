// Bus de eventos mínimo. Es lo único que conecta el simulador con la escena y la UI:
// el simulador emite, y quien quiera (escena 3D, DevTools, tests) escucha.
export class Emitter {
  #handlers = new Map();

  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(fn);
    return () => this.#handlers.get(event)?.delete(fn);
  }

  emit(event, payload) {
    this.#handlers.get(event)?.forEach((fn) => fn(payload));
  }
}
