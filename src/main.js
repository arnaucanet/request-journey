import './styles/main.css';
import { Simulator } from './sim/Simulator.js';
import { SceneManager } from './scene/SceneManager.js';
import { InfraView } from './scene/InfraView.js';
import { PacketAnimator } from './scene/PacketAnimator.js';

const sceneManager = new SceneManager(document.getElementById('viewport'));
const view = new InfraView(sceneManager);
const animator = new PacketAnimator(sceneManager, view);
const sim = new Simulator();

view.setLinkActive('browser', 'alb', false);

window.addEventListener('keydown', async (event) => {
  if (event.code !== 'KeyL') return;
  const [page, script, styles, api] = sim.loadPage();
  await animator.play([page.hops]);
  await animator.play([script.hops, styles.hops]);
  if (api) await animator.play([api.hops]);
});

sceneManager.start();

if (import.meta.env.DEV) Object.assign(window, { sim, view, animator, sceneManager });
