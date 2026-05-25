import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: "index.js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.names.includes("index.css")) return "index.css";
          return "assets/[name][extname]";
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/ws": {
        target: "http://localhost:8787",
        ws: true
      }
    }
  }
});
