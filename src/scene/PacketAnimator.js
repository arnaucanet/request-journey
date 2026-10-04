import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PACKET_COLORS } from './theme.js';

const geometry = new THREE.SphereGeometry(0.17, 16, 12);
const STREAM_GAP = 0.07; // segundos entre consultas de una ráfaga (N+1)

// Anima los hops que ha calculado el simulador: un paquete por tramo, viajando por su cable.
// play(tracks) recibe varias pistas; cada pista se anima en orden y las pistas a la vez
// (por ejemplo el JS y el CSS, que el navegador descarga en paralelo).
export class PacketAnimator {
  constructor(sceneManager, view) {
    this.scene = sceneManager.scene;
    this.view = view;
    this.speed = 1;
    this.time = 0;
    this.generation = 0;
    this.packets = [];
    this.timers = [];
    this.showLabels = true;
    sceneManager.onUpdate((dt) => this.#update(dt));
  }

  get busy() {
    return this.packets.length > 0 || this.timers.length > 0;
  }

  // Devuelve true si terminó y false si se canceló a medias
  async play(tracks) {
    const generation = this.generation;
    const done = await Promise.all(tracks.map((hops) => this.#playTrack(hops, generation)));
    return done.every(Boolean);
  }

  cancel() {
    this.generation++;
    this.packets.forEach((p) => this.#remove(p, false));
    this.packets = [];
    this.timers.forEach((t) => t.resolve(false));
    this.timers = [];
  }

  async #playTrack(hops, generation) {
    let k = 0;
    while (k < hops.length) {
      if (generation !== this.generation) return false;
      if (hops[k].stream) {
        const burst = [];
        while (k < hops.length && hops[k].stream) burst.push(hops[k++]);
        await this.#playStream(burst, generation);
      } else {
        await this.#travel(hops[k++], generation);
      }
    }
    return generation === this.generation;
  }

  // Ráfaga de consultas (N+1): salen escalonadas y cada respuesta vuelve en cuanto llega su consulta
  #playStream(hops, generation) {
    const pairs = [];
    for (let k = 0; k < hops.length; k += 2) pairs.push(hops.slice(k, k + 2));
    return Promise.all(
      pairs.map(async (pair, index) => {
        if (!(await this.#delay(index * STREAM_GAP, generation))) return;
        for (const hop of pair) {
          if (!(await this.#travel(hop, generation, { duration: 0.32, label: false }))) return;
        }
      }),
    );
  }

  #travel(hop, generation, { duration, label = this.showLabels } = {}) {
    const path = this.view.pathBetween(hop.from, hop.to);
    if (!path || generation !== this.generation) return Promise.resolve(false);

    const color = new THREE.Color(PACKET_COLORS[hop.kind]).multiplyScalar(2.6);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    if (hop.kind === 'error') mesh.scale.setScalar(1.25);
    this.scene.add(mesh);

    if (label && hop.label) {
      const el = document.createElement('div');
      el.className = `packet-label packet-label--${hop.kind}`;
      el.textContent = hop.label;
      const tag = new CSS2DObject(el);
      tag.position.y = 0.42;
      mesh.add(tag);
    }

    return new Promise((resolve) => {
      this.packets.push({
        hop,
        mesh,
        path,
        t: 0,
        duration: duration ?? THREE.MathUtils.clamp(0.4 + hop.ms * 0.012, 0.4, 0.9),
        resolve,
      });
    });
  }

  #delay(seconds, generation) {
    if (seconds <= 0) return Promise.resolve(generation === this.generation);
    return new Promise((resolve) => this.timers.push({ until: this.time + seconds, resolve }));
  }

  #remove(packet, arrived) {
    this.scene.remove(packet.mesh);
    packet.mesh.traverse((o) => o.element?.remove());
    packet.mesh.material.dispose();
    packet.resolve(arrived);
  }

  #update(dt) {
    const step = dt * this.speed;
    this.time += step;
    this.timers = this.timers.filter((t) => (this.time >= t.until ? (t.resolve(true), false) : true));

    this.packets = this.packets.filter((packet) => {
      packet.t = Math.min(packet.t + step / packet.duration, 1);
      const k = packet.t < 0.5 ? 2 * packet.t * packet.t : 1 - (-2 * packet.t + 2) ** 2 / 2;
      packet.path.curve.getPoint(packet.path.reversed ? 1 - k : k, packet.mesh.position);
      if (packet.t < 1) return true;
      this.view.flash(packet.hop.to);
      this.#remove(packet, true);
      return false;
    });
  }
}
