import * as THREE from 'three';
import { DEVICE_ACCENTS } from './theme.js';

// Modelos low-poly de cada tipo de equipo, hechos con primitivas de Three.js.
// Cada uno devuelve { group, height, port, led, materials }:
//   height: altura del modelo (para poner la etiqueta encima)
//   port:   altura a la que se enganchan los cables
//   led:    luz de estado que InfraView pinta de verde, ámbar o rojo
//   materials: los que se apagan cuando el equipo está caído

export function createDevice(kind) {
  const materials = {
    body: new THREE.MeshStandardMaterial({ color: 0x2b323c, roughness: 0.55, metalness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x161a20, roughness: 0.7, metalness: 0.2 }),
    accent: new THREE.MeshStandardMaterial({
      color: DEVICE_ACCENTS[kind],
      emissive: DEVICE_ACCENTS[kind],
      emissiveIntensity: 0.25,
      roughness: 0.4,
      metalness: 0.2,
    }),
  };
  const group = new THREE.Group();
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const model = BUILDERS[kind](add, materials, group);
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  );
  led.position.set(...model.led);
  group.add(led);

  return { group, height: model.height, port: model.port, led, materials };
}

const BUILDERS = {
  // Portátil con la pantalla abierta
  browser(add, m, group) {
    add(new THREE.BoxGeometry(1.7, 0.08, 1.15), m.body, 0, 0.04, 0.15);
    const lid = new THREE.Group();
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.05, 0.05), m.body);
    screen.position.y = 0.52;
    screen.castShadow = true;
    const display = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85), m.accent);
    display.position.set(0, 0.52, 0.03);
    lid.add(screen, display);
    lid.position.set(0, 0.08, -0.42);
    lid.rotation.x = -0.22;
    group.add(lid);
    return { height: 1.3, port: 0.5, led: [0.75, 0.1, 0.65] };
  },

  // Servidor DNS: una columna con anillos, como una guía de direcciones
  dns(add, m) {
    add(new THREE.CylinderGeometry(0.55, 0.62, 1.3, 20), m.body, 0, 0.65);
    for (let k = 0; k < 3; k++)
      add(new THREE.TorusGeometry(0.6, 0.045, 8, 32), m.accent, 0, 0.3 + k * 0.38).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.4, 0.55, 0.12, 20), m.dark, 0, 1.36);
    return { height: 1.45, port: 0.7, led: [0, 1.5, 0] };
  },

  // CDN: un globo sobre un pedestal (servidor repartido por el mundo)
  cdn(add, m, group) {
    add(new THREE.CylinderGeometry(0.5, 0.7, 0.35, 20), m.body, 0, 0.18);
    add(new THREE.IcosahedronGeometry(0.78, 1), m.dark, 0, 1.15);
    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.8, 1),
      new THREE.MeshBasicMaterial({ color: m.accent.color, wireframe: true, transparent: true, opacity: 0.7 }),
    );
    wire.position.y = 1.15;
    group.add(wire);
    return { height: 2, port: 0.9, led: [0, 0.37, 0.7] };
  },

  // S3: literalmente un cubo
  bucket(add, m) {
    const bucket = add(new THREE.CylinderGeometry(0.75, 0.55, 1.1, 24, 1, true), m.accent, 0, 0.55);
    bucket.material.side = THREE.DoubleSide;
    add(new THREE.CircleGeometry(0.55, 24), m.dark, 0, 0.02).rotation.x = -Math.PI / 2;
    add(new THREE.TorusGeometry(0.75, 0.04, 8, 32), m.body, 0, 1.1).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(0.66, 0.03, 8, 32), m.body, 0, 0.6).rotation.x = Math.PI / 2;
    return { height: 1.25, port: 0.6, led: [0, 0.12, 0.7] };
  },

  // Balanceador: caja ancha y plana con tres salidas
  balancer(add, m) {
    add(new THREE.BoxGeometry(2, 0.55, 1.1), m.body, 0, 0.3);
    add(new THREE.BoxGeometry(1.8, 0.06, 0.9), m.dark, 0, 0.6);
    for (const x of [-0.6, 0, 0.6])
      add(new THREE.ConeGeometry(0.16, 0.36, 4), m.accent, x, 0.82).rotation.y = Math.PI / 4;
    return { height: 1.1, port: 0.35, led: [0.85, 0.35, 0.56] };
  },

  // Servidor: un rack con ranuras
  server(add, m) {
    add(new THREE.BoxGeometry(0.95, 1.9, 0.95), m.body, 0, 0.95);
    for (let k = 0; k < 5; k++) add(new THREE.BoxGeometry(0.8, 0.07, 0.02), m.dark, 0, 0.4 + k * 0.32, 0.48);
    add(new THREE.BoxGeometry(0.05, 1.5, 0.02), m.accent, -0.36, 0.95, 0.485);
    return { height: 2, port: 0.9, led: [0.32, 1.72, 0.49] };
  },

  // Redis: módulos de memoria apilados
  cache(add, m) {
    for (let k = 0; k < 3; k++) {
      add(new THREE.BoxGeometry(1.3, 0.28, 0.9), m.body, 0, 0.16 + k * 0.38);
      add(new THREE.BoxGeometry(1.1, 0.06, 0.02), m.accent, 0, 0.16 + k * 0.38, 0.46);
    }
    return { height: 1.25, port: 0.55, led: [0.58, 1.06, 0.46] };
  },

  // Base de datos: los tres cilindros de siempre
  database(add, m) {
    for (let k = 0; k < 3; k++) {
      add(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 28), m.body, 0, 0.22 + k * 0.48);
      add(new THREE.TorusGeometry(0.7, 0.03, 6, 32), m.accent, 0, 0.44 + k * 0.48).rotation.x = Math.PI / 2;
    }
    return { height: 1.5, port: 0.7, led: [0, 1.5, 0] };
  },
};
