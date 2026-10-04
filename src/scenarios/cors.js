// Error de CORS: el servidor responde 200, pero el navegador no deja que el JavaScript lo lea
export default {
  id: 'cors',
  title: 'Error de CORS',
  description: 'La API pasa a otro dominio: el servidor responde 200, pero el navegador bloquea la respuesta.',
  steps: [
    {
      caption:
        'El equipo de backend saca la API a su propio dominio, api.tienda.example. Ya no pasa por la CDN: va directa al balanceador.',
      run: async ({ reset, setFlag, focus, wait }) => {
        reset();
        setFlag('crossOriginApi', true);
        focus('home');
        await wait(2500);
      },
    },
    {
      caption:
        'El JavaScript de tienda.example llama a api.tienda.example: otro origen. El navegador añade la cabecera Origin; la petición llega y el servidor responde 200.',
      run: ({ callApi }) => callApi(),
    },
    {
      caption:
        'Pero la respuesta no trae Access-Control-Allow-Origin, así que el navegador la bloquea y el JavaScript no puede leerla. En la consola, el error de siempre.',
      run: async ({ showTab, wait }) => {
        showTab('console');
        await wait(4500);
      },
    },
    {
      caption:
        'El servidor sí respondió (mira los logs). CORS no protege al servidor: protege al usuario, y quien lo aplica es el navegador.',
      run: async ({ showTab, wait }) => {
        showTab('logs');
        await wait(4000);
      },
    },
    {
      caption: 'La solución está en el backend: responder con Access-Control-Allow-Origin: https://tienda.example.',
      run: async ({ setFlag, showTab, callApi, selectRequest }) => {
        setFlag('corsHeader', true);
        showTab('network');
        await callApi();
        selectRequest('products');
      },
    },
  ],
};
