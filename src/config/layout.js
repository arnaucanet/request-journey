// Dónde está cada equipo en la escena (x hacia la derecha, z hacia la cámara).
// Va aparte de la topología: la red es la misma aunque se recoloque todo.
export const POSITIONS = {
  browser: [-10.5, 2.6],
  dns: [-10.5, -3.2],
  cdn: [-4.6, 0],
  s3: [0.2, -4.4],
  alb: [3.4, 0.6],
  api1: [7.4, -2.6],
  api2: [7.4, 3.4],
  cache: [11.6, -2.8],
  db: [11.6, 3.4],
};

// Zonas del suelo: dónde vive cada cosa
export const ZONES = [
  { id: 'internet', label: 'Internet', detail: 'tu casa', x: [-13.6, -7.6], z: [-6.2, 6.4], tone: 'internet' },
  { id: 'edge', label: 'Edge de CloudFront', detail: 'Madrid', x: [-7.2, -2], z: [-6.2, 6.4], tone: 'edge' },
  { id: 'region', label: 'AWS · eu-west-1', detail: 'Irlanda', x: [-1.6, 14], z: [-7, 6.8], tone: 'region' },
  { id: 'vpc', label: 'VPC', detail: 'red privada', x: [1.6, 13.6], z: [-5.4, 6.3], tone: 'vpc' },
];
