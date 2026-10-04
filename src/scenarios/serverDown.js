// Se cae un servidor: 502 hasta que el health check del balanceador lo saca del reparto
export default {
  id: 'servidor-caido',
  title: 'Se cae un servidor',
  description: 'El balanceador sigue enviando tráfico a API 2 (502) hasta que el health check la saca.',
  steps: [
    {
      caption: 'El balanceador reparte las peticiones por turnos (round robin) entre API 1 y API 2.',
      run: async ({ reset, warmUp, focus, burst }) => {
        reset();
        warmUp({ page: false });
        focus('alb');
        await burst(2);
      },
    },
    {
      caption: 'API 2 se cae de golpe.',
      run: async ({ setDown, note, wait }) => {
        setDown('api2', true);
        note('api2', 'Caída', 'error');
        await wait(1800);
      },
    },
    {
      caption:
        'El balanceador todavía no lo sabe: le sigue mandando una de cada dos peticiones, y esas fallan con 502 Bad Gateway.',
      run: ({ burst }) => burst(4),
    },
    {
      caption:
        'Cada 10 s el balanceador hace un health check (GET /health) a cada servidor. Con 2 fallos seguidos, saca a API 2 del reparto.',
      run: ({ passTime }) => passTime(20),
    },
    {
      caption: 'Ahora todo el tráfico va a API 1 y no hay errores, aunque con la mitad de capacidad.',
      run: ({ burst }) => burst(4),
    },
    {
      caption: 'Vuelve API 2. Tras 2 health checks correctos, el balanceador la mete otra vez en el reparto.',
      run: async ({ setDown, passTime, burst }) => {
        setDown('api2', false);
        await passTime(20);
        await burst(2);
      },
    },
  ],
};
