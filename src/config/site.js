// La web de ejemplo: una tienda con su HTML, su JavaScript, su CSS y un endpoint de la API.
// Dominios .example e IPs de documentación (RFC 2606 y RFC 5737): no existen de verdad.

export const SITE_HOST = 'tienda.example';
export const API_HOST = 'api.tienda.example';

export const DNS_RECORDS = {
  [SITE_HOST]: '203.0.113.10', // CloudFront
  [API_HOST]: '198.51.100.20', // balanceador, cuando la API tiene su propio dominio
};

// cacheControl decide qué guarda el navegador; los archivos con hash en el nombre son inmutables
export const RESOURCES = {
  '/': { name: SITE_HOST, type: 'document', size: 9_000, cacheControl: 'no-cache' },
  '/app.js': { name: 'app.js', type: 'script', size: 182_000, cacheControl: 'public, max-age=31536000, immutable' },
  '/styles.css': {
    name: 'styles.css',
    type: 'stylesheet',
    size: 24_000,
    cacheControl: 'public, max-age=31536000, immutable',
  },
  '/api/products': { name: 'products', type: 'fetch', size: 14_000, cacheControl: 'no-store', api: true },
};

export const PRODUCT_COUNT = 50;
