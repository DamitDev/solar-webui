import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const controlUrl = process.env.SOLAR_CONTROL_URL || 'http://localhost:8000';
const controlApiKey = process.env.SOLAR_CONTROL_API_KEY || '';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api/control': {
        target: controlUrl,
        changeOrigin: true,
        ws: true,
        rewrite: (pathname) => pathname.replace(/^\/api\/control/, ''),
        configure: (proxy) => {
          const applyHeaders = (proxyReq: any) => {
            if (!controlApiKey) return;
            proxyReq.setHeader('X-API-Key', controlApiKey);
            if (!proxyReq.getHeader('authorization')) {
              proxyReq.setHeader('Authorization', `Bearer ${controlApiKey}`);
            }
          };

          proxy.on('proxyReq', applyHeaders);
          proxy.on('proxyReqWs', applyHeaders);
        },
      },
    },
  },
});

