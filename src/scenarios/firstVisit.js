import { ms } from '../ui/format.js';

// Primera visita: todas las cachés vacías, así que la petición hace el recorrido completo
export default {
  id: 'primera-visita',
  title: 'Primera visita',
  description: 'Cachés vacías: DNS, conexión segura, la CDN va a S3 y la API a la base de datos.',
  steps: [
    {
      caption:
        'Abres tienda.example por primera vez. El navegador no conoce su IP: pregunta al DNS (Route 53) y abre una conexión segura (TCP + TLS) con la CDN.',
      run: async ({ reset, newPage, fetch, focus }) => {
        reset();
        focus('home');
        newPage();
        await fetch(['/']);
      },
    },
    {
      caption:
        'La CDN no tenía el HTML (MISS): se lo pidió a S3 y se queda una copia. El HTML enlaza app.js y styles.css, que se descargan a la vez.',
      run: ({ fetch }) => fetch(['/app.js', '/styles.css']),
    },
    {
      caption:
        'El JavaScript llama a /api/products. La CDN no guarda la API: la pasa al balanceador, que elige un servidor. Redis está vacío (MISS), así que toca ir a la base de datos.',
      run: ({ fetch }) => fetch(['/api/products']),
    },
    {
      caption: ({ pageTime }) =>
        `Abajo, la cascada de DevTools: DNS, conexión, espera del servidor (TTFB) y descarga. La página ha tardado ${ms(pageTime())} en total.`,
      run: async ({ showTab, selectRequest, wait }) => {
        showTab('network');
        selectRequest('tienda.example');
        await wait(4000);
      },
    },
  ],
};
