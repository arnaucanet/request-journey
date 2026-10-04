import { ms } from '../ui/format.js';

let firstVisit = 0;

// Segunda visita: las cachés del navegador, de la CDN y de Redis ya tienen copia de todo
export default {
  id: 'segunda-visita',
  title: 'Segunda visita',
  description: 'Con las cachés llenas casi nada sale del navegador y la página carga mucho más rápido.',
  steps: [
    {
      caption: 'Partimos de una visita anterior: el navegador, la CDN y Redis ya tienen copia de todo.',
      run: async ({ reset, warmUp, focus, wait }) => {
        reset();
        focus('home');
        firstVisit = warmUp();
        await wait(2500);
      },
    },
    {
      caption:
        'Recargas la página. La IP y la conexión ya las tiene el navegador, y la CDN tiene el HTML (HIT): no hace falta ir a S3.',
      run: async ({ newPage, fetch }) => {
        newPage();
        await fetch(['/']);
      },
    },
    {
      caption:
        'app.js y styles.css ni siquiera salen del portátil: son archivos inmutables y se sirven desde la caché de disco.',
      run: ({ fetch }) => fetch(['/app.js', '/styles.css']),
    },
    {
      caption: 'La API sí llega al servidor, pero Redis tiene los productos (HIT) y la base de datos no se entera.',
      run: ({ fetch }) => fetch(['/api/products']),
    },
    {
      caption: ({ pageTime }) =>
        `Resultado: ${ms(pageTime())} frente a ${ms(firstVisit)} de la primera visita. Las cachés son la forma más barata de hacer rápida una web.`,
      run: async ({ showTab, wait }) => {
        showTab('network');
        await wait(4000);
      },
    },
  ],
};
