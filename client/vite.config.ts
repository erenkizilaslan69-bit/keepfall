import { defineConfig } from 'vite';

// In development the ASP.NET server runs on 5080; Vite forwards the SignalR hub to it.
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/hub': { target: 'http://localhost:5080', ws: true, changeOrigin: true },
    },
  },
});
