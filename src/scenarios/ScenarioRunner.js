import { Emitter } from '../core/Emitter.js';

const PAUSE_BETWEEN_STEPS_MS = 1600;

// Ejecuta un escenario paso a paso. Un escenario es una lista declarativa de pasos:
//   { caption: 'Texto' | (ctx) => 'Texto', run: async (ctx) => { ... } }
// El contexto (ctx) lo construye main.js y es lo único con lo que un escenario actúa sobre la app:
// lanzar peticiones, apagar equipos, activar fallos, mover la cámara, poner notas...
// En los tests se le pasa un contexto sin escena, y el escenario corre igual.
//
// En modo guiado, entre paso y paso espera a next(). stop() corta al terminar el paso en curso.
// Eventos: 'start' (scenario), 'step' ({ scenario, index, total, caption }),
//          'waiting' ({ scenario, index, total }), 'end' ({ scenario, stopped })
export class ScenarioRunner {
  constructor(context) {
    this.context = context;
    this.events = new Emitter();
    this.running = null;
    this.guided = false;
    this.stopped = false;
    this.resume = null;
  }

  async run(scenario) {
    if (this.running) this.stop();
    await this.finished;
    this.running = scenario;
    this.stopped = false;
    this.finished = this.#run(scenario);
    return this.finished;
  }

  async #run(scenario) {
    this.events.emit('start', scenario);
    try {
      await this.context.prepare?.();
      const total = scenario.steps.length;
      for (const [index, step] of scenario.steps.entries()) {
        if (index > 0 && this.guided) await this.#waitForNext({ scenario, index, total });
        if (this.stopped) break;
        const caption = typeof step.caption === 'function' ? step.caption(this.context) : step.caption;
        this.events.emit('step', { scenario, index, total, caption });
        await step.run(this.context);
        if (this.stopped) break;
        if (!this.guided && index < total - 1) await this.context.wait(PAUSE_BETWEEN_STEPS_MS);
      }
    } finally {
      this.running = null;
      this.resume = null;
      this.events.emit('end', { scenario, stopped: this.stopped });
    }
  }

  next() {
    const resume = this.resume;
    this.resume = null;
    resume?.();
  }

  stop() {
    if (!this.running) return;
    this.stopped = true;
    this.context.abort?.();
    this.next();
  }

  // La promesa se crea antes de avisar: así un next() lanzado desde el propio evento
  // 'waiting' ya encuentra el resume y el escenario no se queda colgado
  #waitForNext(info) {
    const waiting = new Promise((resolve) => (this.resume = resolve));
    this.events.emit('waiting', info);
    return waiting;
  }
}
