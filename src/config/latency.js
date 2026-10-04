// Tiempos de la simulación en milisegundos. Son valores típicos, no medidos:
// lo que importa es la proporción (la CDN está cerca, la base de datos es lo lento...).
export const LATENCY = {
  browserToDns: 10, // un sentido
  dnsLookup: 8,
  browserToCdn: 12, // el edge de CloudFront está cerca del usuario
  browserToAlb: 35, // sin CDN hay que ir hasta la región de AWS
  cdnToOrigin: 20, // del edge a la región (S3 o balanceador)
  s3Read: 15,
  albToApi: 1,
  apiProcessing: 10,
  apiToCache: 0.5,
  cacheLookup: 0.3,
  apiToDb: 1,
  dbQuery: 6, // una consulta sencilla
  dbJoinQuery: 60, // una consulta con JOIN que trae productos y reseñas de golpe
  bandwidth: 2_500, // bytes por milisegundo (unos 20 Mbit/s)
  diskCache: 1,
};

export const CACHE_TTL_MS = 60_000; // la API guarda los productos 60 s en Redis
export const HEALTH_CHECK = { intervalMs: 10_000, unhealthyThreshold: 2, healthyThreshold: 2 };
export const RATE_LIMIT = { windowMs: 10_000, max: 5 };
