import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LINKS, NODES } from '../config/topology.js';
import { POSITIONS, ZONES } from '../config/layout.js';
import { createDevice } from './devices.js';
import { SCENE_COLORS, STATUS_COLORS, ZONE_COLORS } from './theme.js';

const linkKey = (a, b) => [a, b].sort().join('|');

// Dibuja la infraestructura: zonas del suelo, equipos con su etiqueta y cables entre ellos.
// No decide nada: main.js le dice qué equipos están caídos y PacketAnimator usa sus cables.
export class InfraView {
  constructor(sceneManager) {
    this.root = new THREE.Group();
    sceneManager.scene.add(this.root);
    this.devices = new Map();
    this.links = new Map();

    ZONES.forEach((zone, k) => this.#addZone(zone, k));
    NODES.forEach((node) => this.#addDevice(node));
    LINKS.forEach(([a, b]) => this.#addLink(a, b));
    sceneManager.onUpdate((dt) => this.#update(dt));
  }

  #addZone({ label, detail, x, z, tone }, index) {
    const [x0, x1] = x;
    const [z0, z1] = z;
    const y = 0.01 + index * 0.004; // las zonas anidadas quedan un pelo por encima
    const color = new THREE.Color(ZONE_COLORS[tone]);

    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, z1 - z0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);

    const border = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x0, y, z0),
        new THREE.Vector3(x1, y, z0),
        new THREE.Vector3(x1, y, z1),
        new THREE.Vector3(x0, y, z1),
      ]),
      new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(2.2) }),
    );

    const el = document.createElement('div');
    el.className = 'zone-label';
    el.innerHTML = `<strong>${label}</strong><span>${detail}</span>`;
    const tag = new CSS2DObject(el);
    // Esquina delantera izquierda: detrás quedaría tapada por las etiquetas de los equipos
    tag.position.set(x0 + 0.3, y, z1 - 0.3);
    tag.center.set(0, 1);
    this.root.add(fill, border, tag);
  }

  #addDevice(node) {
    const [x, z] = POSITIONS[node.id];
    const device = createDevice(node.kind);
    device.group.position.set(x, 0, z);
    device.group.traverse((o) => (o.userData.nodeId = node.id));
    this.root.add(device.group);

    const el = document.createElement('div');
    el.className = 'device-label';
    el.innerHTML = `<em class="device-label__badge" hidden></em><strong>${node.label}</strong><span>${node.service}</span>`;
    const label = new CSS2DObject(el);
    label.position.set(x, device.height + 0.35, z);
    label.center.set(0.5, 1);
    this.root.add(label);

    this.devices.set(node.id, { ...device, node, label: el, flash: 0, position: new THREE.Vector3(x, 0, z) });
    this.setStatus(node.id, 'up');
  }

  #addLink(a, b) {
    const start = this.portOf(a);
    const end = this.portOf(b);
    // Arco suave: cuanto más largo el cable, más se levanta
    const mid = start.clone().lerp(end, 0.5);
    mid.y += THREE.MathUtils.clamp(start.distanceTo(end) * 0.16, 0.6, 3.2);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);

    const material = new THREE.MeshStandardMaterial({
      color: SCENE_COLORS.cable,
      roughness: 0.6,
      transparent: true,
      opacity: 0.9,
    });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.035, 6, false), material);
    tube.castShadow = true;
    this.root.add(tube);
    this.links.set(linkKey(a, b), { a, b, curve, material });
  }

  portOf(id) {
    const [x, z] = POSITIONS[id];
    return new THREE.Vector3(x, this.devices.get(id).port, z);
  }

  // Curva que va de un equipo a otro (en ese sentido)
  pathBetween(from, to) {
    const link = this.links.get(linkKey(from, to));
    if (!link) return null;
    return { curve: link.curve, reversed: link.a !== from };
  }

  // El cable navegador–balanceador solo se usa cuando la API tiene su propio dominio
  setLinkActive(a, b, active) {
    const link = this.links.get(linkKey(a, b));
    if (link) link.material.opacity = active ? 0.9 : 0.12;
  }

  // 'up' (verde), 'unhealthy' (ámbar: vivo, pero el balanceador no le manda tráfico) o 'down' (rojo)
  setStatus(id, status) {
    const device = this.devices.get(id);
    device.status = status;
    device.led.material.color.set(STATUS_COLORS[status]).multiplyScalar(status === 'down' ? 2.5 : 2);
    device.materials.body.color.set(status === 'down' ? 0x1b1f25 : 0x2b323c);
    device.materials.accent.emissiveIntensity = status === 'down' ? 0 : 0.25;
    device.label.classList.toggle('is-down', status === 'down');
    device.label.classList.toggle('is-unhealthy', status === 'unhealthy');
  }

  // Texto pequeño sobre la etiqueta: "APAGADO", "HIT 3 · MISS 1", "51 consultas"...
  setBadge(id, text) {
    const badge = this.devices.get(id).label.querySelector('.device-label__badge');
    badge.hidden = !text;
    badge.textContent = text ?? '';
  }

  // Destello cuando le llega un paquete
  flash(id) {
    this.devices.get(id).flash = 1;
  }

  topOf(id) {
    const device = this.devices.get(id);
    return device.position.clone().setY(device.height + 0.2);
  }

  get pickables() {
    return [...this.devices.values()].map((d) => d.group);
  }

  #update(dt) {
    for (const device of this.devices.values()) {
      if (device.flash <= 0) continue;
      device.flash = Math.max(0, device.flash - dt * 2.5);
      if (device.status === 'down') continue;
      device.materials.accent.emissiveIntensity = 0.25 + device.flash * 1.4;
      device.group.scale.setScalar(1 + device.flash * 0.04);
    }
  }
}
