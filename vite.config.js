// vite.config.js
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    base: env.VITE_BASE || '/',
    server: {
      host: true,
      port: 5173,
      // ✅ Proxy tất cả request bắt đầu bằng /api sang server thật
      proxy: {
        '/api': {
          target: 'http://203.209.181.170:2018', // ĐỔI nếu server của anh khác
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    preview: { host: true, port: 4173 },
    publicDir: 'public',
    build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  }
})
