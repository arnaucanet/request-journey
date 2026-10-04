import { defineConfig } from 'vite';

// base relativa: el build funciona igual en GitHub Pages (/request-journey/) que en local
export default defineConfig({
  base: './',
  server: { port: 5192, open: false },
  // Three.js por sí solo ocupa ~600 kB; el aviso por defecto (500 kB) no aporta aquí
  build: { chunkSizeWarningLimit: 900 },
});
