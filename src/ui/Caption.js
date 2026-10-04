import { icon } from './icons.js';

const LINGER_MS = 5000;

// Subtítulo del escenario en curso: título, paso actual, texto y botones Siguiente / Detener
export class Caption {
  constructor(el, runner) {
    this.el = el;
    el.innerHTML = `
      <div class="caption__meta">
        <span data-title></span>
        <span class="caption__progress" data-progress></span>
      </div>
      <p class="caption__text" data-text></p>
      <div class="caption__actions">
        <button type="button" class="btn btn--primary" data-next hidden>${icon('next')} Siguiente paso</button>
        <button type="button" class="btn btn--ghost" data-stop>${icon('stop', 14)} Detener</button>
      </div>`;
    const next = el.querySelector('[data-next]');
    const stop = el.querySelector('[data-stop]');
    next.addEventListener('click', () => runner.next());
    stop.addEventListener('click', () => runner.stop());

    runner.events.on('start', (scenario) => {
      clearTimeout(this.hideTimer);
      el.hidden = false;
      el.querySelector('[data-title]').textContent = scenario.title;
      stop.hidden = false;
    });
    runner.events.on('step', ({ index, total, caption }) => {
      next.hidden = true;
      el.querySelector('[data-progress]').innerHTML = Array.from(
        { length: total },
        (_, k) => `<i class="${k < index ? 'is-done' : k === index ? 'is-current' : ''}"></i>`,
      ).join('');
      const text = el.querySelector('[data-text]');
      text.textContent = caption;
      // Reinicia la animación de entrada del texto en cada paso
      text.classList.remove('is-entering');
      void text.offsetWidth;
      text.classList.add('is-entering');
    });
    runner.events.on('waiting', () => {
      next.hidden = false;
      next.focus();
    });
    runner.events.on('end', ({ stopped }) => {
      next.hidden = true;
      stop.hidden = true;
      if (stopped) {
        el.hidden = true;
        return;
      }
      el.querySelectorAll('[data-progress] i').forEach((dot) => (dot.className = 'is-done'));
      this.hideTimer = setTimeout(() => (el.hidden = true), LINGER_MS);
    });
  }
}
