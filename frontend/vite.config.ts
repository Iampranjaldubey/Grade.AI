import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code from app code so browsers can keep
        // it cached across deploys.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-data": ["@tanstack/react-query", "axios", "zustand"],
          "vendor-forms": ["react-hook-form", "zod", "@hookform/resolvers/zod"],
        },
      },
    },
  },
});
