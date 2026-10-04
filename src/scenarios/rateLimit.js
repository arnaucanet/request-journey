// Límite de peticiones: a partir de la sexta en 10 s, 429 Too Many Requests
export default {
  id: 'rate-limit',
  title: 'Límite de peticiones (429)',
  description: 'La API acepta 5 peticiones cada 10 s por cliente. A partir de ahí, 429 y Retry-After.',
  steps: [
    {
      caption: 'La API limita a 5 peticiones cada 10 s por cliente, para protegerse de abusos y de bucles mal hechos.',
      run: async ({ reset, setFlag, focus, wait }) => {
        reset();
        setFlag('rateLimit', true);
        focus('home');
        await wait(2500);
      },
    },
    {
      caption:
        'Alguien pulsa «recargar» sin parar: 8 peticiones seguidas. Las 5 primeras pasan; a partir de la sexta, 429 Too Many Requests.',
      run: async ({ showTab, burst }) => {
        showTab('network');
        await burst(8);
      },
    },
    {
      caption:
        'La respuesta trae Retry-After: los segundos que hay que esperar. Un buen cliente lo respeta y reintenta más tarde en vez de seguir insistiendo.',
      run: async ({ selectRequest, wait }) => {
        selectRequest('products');
        await wait(4500);
      },
    },
    {
      caption: 'Pasan 10 s, empieza una ventana nueva y la API vuelve a responder.',
      run: async ({ passTime, callApi }) => {
        await passTime(10);
        await callApi();
      },
    },
  ],
};
