import { defineConfig } from 'vite';

declare const process: { env: Record<string, string | undefined> }; // Node's, without pulling in its type package

// In development the ASP.NET server runs on 5080; Vite forwards the SignalR hub to it.
// KEEPFALL_SERVER / KEEPFALL_CLIENT_PORT point a second dev setup at other ports (e.g. next to a running Production server).
export default defineConfig({
  server: {
    port: Number(process.env.KEEPFALL_CLIENT_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/hub': { target: process.env.KEEPFALL_SERVER ?? 'http://localhost:5080', ws: true, changeOrigin: true },
    },
  },
});
