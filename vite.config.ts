import { defineConfig } from 'vite';
export default defineConfig({
  build: { target: 'es2022', rollupOptions: { input: { main: 'index.html', pad: 'pad.html' } } },
  // `npm run server` runs the party server on 8787; the dev server forwards the socket to it.
  server: { host: '0.0.0.0', proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
});
