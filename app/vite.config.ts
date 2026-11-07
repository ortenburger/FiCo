import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /v1/* to the FiCo API so the browser stays same-origin.
    // This keeps the ElevenLabs client tools free of CORS preflights.
    //
    // The target must be pinned to 127.0.0.1: "localhost" resolves to the
    // IPv6 loopback first, while the API only listens on the IPv4 stack, and
    // the proxy then answers 404 instead of forwarding the request.
    proxy: {
      "/v1": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/health": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
