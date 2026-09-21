import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = process.env.VITE_BACKEND_PORT || process.env.BACKEND_PORT || env.VITE_BACKEND_PORT || '8000';
  const frontendPort = parseInt(process.env.VITE_PORT || process.env.PORT || env.VITE_PORT || '5173', 10);

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: frontendPort,
      strictPort: false,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
        '/health': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
  };
})

