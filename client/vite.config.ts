import { defineConfig } from 'vite';

declare const process: { env: Record<string, string | undefined> }; // Node's, without pulling in its type package

// In development the ASP.NET server runs on 5080; Vite forwards the SignalR hub to it.
// KEEPFALL_SERVER / KEEPFALL_CLIENT_PORT point a second dev setup at other ports (e.g. next to a running Production server).
// The CrazyGames SDK is loaded by a <script> in that build's index.html only (`vite build --mode crazy`), so the other builds never touch it.
const crazySdk = {
  name: 'crazygames-sdk-script',
  transformIndexHtml: { order: 'pre' as const, handler: () => [{ tag: 'script', attrs: { src: 'https://sdk.crazygames.com/crazygames-sdk-v3.js' }, injectTo: 'head-prepend' as const }] },
};

export default defineConfig(({ mode }) => ({
  plugins: mode === 'crazy' ? [crazySdk] : [],
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  server: {
    port: Number(process.env.KEEPFALL_CLIENT_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': { target: process.env.KEEPFALL_SERVER ?? 'http://localhost:5080', changeOrigin: true },
      '/hub': { target: process.env.KEEPFALL_SERVER ?? 'http://localhost:5080', ws: true, changeOrigin: true },
    },
  },
}));
