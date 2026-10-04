// Colores de los paquetes: es lo único con color fuerte de la escena
export const PACKET_COLORS = {
  dns: '#e5c07b',
  request: '#6ea8ff',
  response: '#7fd18b',
  query: '#c792ea',
  reply: '#c792ea',
  health: '#9aa6b5',
  error: '#ff6b6b',
};

export const PACKET_LABELS = {
  dns: 'DNS',
  request: 'Petición',
  response: 'Respuesta',
  query: 'Caché / BD',
  health: 'Health check',
  error: 'Error',
};

export const STATUS_COLORS = {
  up: '#7fd18b',
  unhealthy: '#f0b35a',
  down: '#ff6b6b',
};

// Acento discreto de cada tipo de equipo
export const DEVICE_ACCENTS = {
  browser: '#8fa8c8',
  dns: '#d9b56c',
  cdn: '#6fc2c9',
  bucket: '#7fbf8a',
  balancer: '#6ea8ff',
  server: '#a9b4c2',
  cache: '#e0716b',
  database: '#7c9be6',
};

export const ZONE_COLORS = {
  internet: '#2a3340',
  edge: '#24393d',
  region: '#2b3247',
  vpc: '#33405c',
};

export const SCENE_COLORS = {
  background: 0x0d1015,
  floor: 0x12161c,
  gridMajor: 0x1b2028,
  gridMinor: 0x151a21,
  cable: 0x3a4554,
};
