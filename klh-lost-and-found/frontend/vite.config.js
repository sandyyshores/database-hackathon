import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const fastapiTarget = process.env.FASTAPI_UPSTREAM || "http://127.0.0.1:8001";
const expressTarget = process.env.EXPRESS_UPSTREAM || "http://127.0.0.1:8002";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: fastapiTarget,
        changeOrigin: true
      },
      "/notify-api": {
        target: expressTarget,
        changeOrigin: true
      }
    }
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true
  }
});
