// La infraestructura como datos: qué equipos hay, qué hacen y cómo se conectan.
// Ni el simulador ni la escena tienen equipos escritos a mano; todo sale de aquí.

export const NODES = [
  {
    id: 'browser',
    kind: 'browser',
    label: 'Navegador',
    service: 'Chrome · tu portátil',
    role: 'Pide la página, guarda en caché lo que puede y aplica las reglas de seguridad (CORS).',
    canFail: false,
  },
  {
    id: 'dns',
    kind: 'dns',
    label: 'DNS',
    service: 'Amazon Route 53',
    role: 'Traduce el nombre (tienda.example) a la IP a la que hay que conectarse.',
    canFail: true,
  },
  {
    id: 'cdn',
    kind: 'cdn',
    label: 'CDN',
    service: 'Amazon CloudFront',
    role: 'Servidor cercano al usuario. Guarda copias de los archivos estáticos y reenvía /api/* al balanceador.',
    canFail: true,
  },
  {
    id: 's3',
    kind: 'bucket',
    label: 'Estáticos',
    service: 'Amazon S3',
    role: 'Almacena el HTML, el JavaScript y el CSS. La CDN los pide aquí cuando no los tiene.',
    canFail: true,
  },
  {
    id: 'alb',
    kind: 'balancer',
    label: 'Balanceador',
    service: 'Application Load Balancer',
    role: 'Reparte las peticiones entre los servidores sanos y deja de enviar a los que fallan el health check.',
    canFail: true,
  },
  {
    id: 'api1',
    kind: 'server',
    label: 'API 1',
    service: 'Amazon EC2 · Node.js',
    role: 'Una instancia EC2 (una máquina virtual en AWS) con el backend en Node.js. Consulta la caché y, si no está ahí, la base de datos.',
    canFail: true,
  },
  {
    id: 'api2',
    kind: 'server',
    label: 'API 2',
    service: 'Amazon EC2 · Node.js',
    role: 'Segunda instancia EC2 con la misma API, en otra zona de disponibilidad: reparte la carga y aguanta si cae la otra.',
    canFail: true,
  },
  {
    id: 'cache',
    kind: 'cache',
    label: 'Caché',
    service: 'Amazon ElastiCache · Redis',
    role: 'Memoria rápida: guarda la respuesta de la API 60 s para no consultar la base de datos cada vez.',
    canFail: true,
  },
  {
    id: 'db',
    kind: 'database',
    label: 'Base de datos',
    service: 'Amazon RDS · PostgreSQL',
    role: 'Donde viven los productos y las reseñas. Es lo más lento de todo el recorrido.',
    canFail: true,
  },
];

// Conexiones (cables) entre equipos. El orden de cada par no importa
export const LINKS = [
  ['browser', 'dns'],
  ['browser', 'cdn'],
  ['browser', 'alb'], // solo se usa cuando la API tiene su propio dominio
  ['cdn', 's3'],
  ['cdn', 'alb'],
  ['alb', 'api1'],
  ['alb', 'api2'],
  ['api1', 'cache'],
  ['api2', 'cache'],
  ['api1', 'db'],
  ['api2', 'db'],
];

export const API_SERVERS = ['api1', 'api2'];

export const nodeById = (id) => NODES.find((node) => node.id === id);
