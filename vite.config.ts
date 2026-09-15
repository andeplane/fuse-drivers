import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** The party server writes the port it actually got (it skips busy ones); start it before `npm run dev`. */
const partyPort = () => { try { return readFileSync('node_modules/.fuse-party-port', 'utf8').trim(); } catch { return process.env.PORT ?? '8790'; } };

export default defineConfig({
  build: { target: 'es2022', rollupOptions: { input: { main: 'index.html', pad: 'pad.html' } } },
  server: { host: '0.0.0.0', proxy: { '/ws': { target: `ws://localhost:${partyPort()}`, ws: true } } },
});
