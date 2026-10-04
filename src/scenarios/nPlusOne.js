import { ms } from '../ui/format.js';

// La web va lenta: el backend hace una consulta por producto (N+1) en vez de un JOIN
export default {
  id: 'n-mas-1',
  title: 'La web va lenta (N+1)',
  description: 'Una petición genera 51 consultas a la base de datos. Redis lo esconde; un JOIN lo arregla.',
  steps: [
    {
      caption:
        'Nueva versión del backend: /api/products devuelve cada producto con sus reseñas. Acaba de desplegarse, así que Redis está vacío.',
      run: async ({ reset, setFlag, focus, wait }) => {
        reset();
        setFlag('nPlusOne', true);
        focus('db');
        await wait(2000);
      },
    },
    {
      caption:
        'El código pide los 50 productos y luego, en un bucle, las reseñas de cada uno: 1 + 50 = 51 consultas a la base de datos.',
      run: ({ callApi }) => callApi(),
    },
    {
      caption: ({ last }) =>
        `En los logs del servidor se ve el patrón: la misma consulta 50 veces con otro id. El servidor ha tardado ${ms(last()[0].timing.wait)} en responder.`,
      run: async ({ showTab, wait }) => {
        showTab('logs');
        await wait(4000);
      },
    },
    {
      caption:
        'La segunda petición sale de Redis y va rápida: la caché esconde el problema. Por eso el N+1 se descubre tarde, cuando caduca la caché o llega mucho tráfico.',
      run: async ({ focus, callApi }) => {
        focus('home');
        await callApi();
      },
    },
    {
      caption: 'La solución: una sola consulta con JOIN. Se vacía Redis para comparar en las mismas condiciones.',
      run: async ({ setFlag, clearCaches, callApi, showTab }) => {
        setFlag('nPlusOne', false);
        clearCaches();
        showTab('network');
        await callApi();
      },
    },
    {
      caption: ({ last }) =>
        `1 consulta y ${ms(last()[0].timing.wait)} de espera. Mismo resultado, una fracción del tiempo y de la carga de la base de datos.`,
      run: ({ wait }) => wait(3500),
    },
  ],
};
