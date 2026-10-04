// Se cae Redis: la web sigue funcionando, pero toda la carga va a la base de datos
export default {
  id: 'redis-caido',
  title: 'Se cae Redis',
  description: 'La API sigue respondiendo, pero cada petición va a la base de datos y todo se vuelve más lento.',
  steps: [
    {
      caption: 'Con la caché caliente, las peticiones a la API salen de Redis (HIT) sin tocar la base de datos.',
      run: async ({ reset, warmUp, focus, callApi }) => {
        reset();
        warmUp({ page: false });
        focus('home');
        await callApi();
      },
    },
    {
      caption: 'Se cae el nodo de ElastiCache.',
      run: async ({ setDown, note, focus, wait }) => {
        focus('cache');
        setDown('cache', true);
        note('cache', 'Redis caído', 'error');
        await wait(2000);
      },
    },
    {
      caption:
        'La API no se cae: captura el error (ECONNREFUSED) y va a la base de datos. Funciona, pero cada petición tarda más.',
      run: async ({ focus, callApi }) => {
        focus('home');
        await callApi();
      },
    },
    {
      caption:
        'Con muchos usuarios a la vez, cada petición es una consulta: 8 peticiones, 8 consultas. Así es como un pico de tráfico tumba una base de datos.',
      run: ({ burst }) => burst(8),
    },
    {
      caption: 'Vuelve Redis. La primera petición lo rellena (MISS) y las siguientes vuelven a ser HIT.',
      run: async ({ setDown, note, callApi }) => {
        setDown('cache', false);
        note('cache', 'Redis de vuelta', 'success');
        await callApi();
        await callApi();
      },
    },
  ],
};
