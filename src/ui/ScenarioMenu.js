import { icon } from './icons.js';

// Botón «Escenarios» de la cabecera y su menú desplegable con la lista y el modo paso a paso
export class ScenarioMenu {
  constructor(container, scenarios, { onRun, onGuidedChange }) {
    this.scenarios = scenarios;
    container.innerHTML = `
      <button type="button" class="btn btn--primary" data-toggle aria-expanded="false" aria-controls="scenario-menu">
        ${icon('scenarios')} Escenarios
      </button>
      <div class="scenario-menu" id="scenario-menu" hidden>
        <header>
          <strong>Escenarios guiados</strong>
          <label class="check"><input type="checkbox" data-guided /> Paso a paso</label>
        </header>
        <ol>
          ${scenarios
            .map(
              (s, k) => `
              <li>
                <button type="button" data-run="${s.id}">
                  <span class="scenario-menu__index">${String(k + 1).padStart(2, '0')}</span>
                  <span><strong>${s.title}</strong><small>${s.description}</small></span>
                </button>
              </li>`,
            )
            .join('')}
        </ol>
      </div>`;

    this.toggle = container.querySelector('[data-toggle]');
    this.menu = container.querySelector('.scenario-menu');
    this.toggle.addEventListener('click', () => this.setOpen(this.menu.hidden));
    container.querySelector('[data-guided]').addEventListener('change', (e) => onGuidedChange(e.target.checked));
    container.querySelectorAll('[data-run]').forEach((button) =>
      button.addEventListener('click', () => {
        this.setOpen(false);
        onRun(scenarios.find((s) => s.id === button.dataset.run));
      }),
    );
    document.addEventListener('pointerdown', (event) => {
      if (!container.contains(event.target)) this.setOpen(false);
    });
    document.addEventListener('keydown', (event) => event.key === 'Escape' && this.setOpen(false));
  }

  setOpen(open) {
    this.menu.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
  }
}
