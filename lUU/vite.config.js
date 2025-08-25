// vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5175,
    proxy: {
      "/api": {
        target: "http://203.209.181.170:2018",
        changeOrigin: true,
        rewrite: p => p.replace(/^\/api/, "")
      }
    }
  }
});
