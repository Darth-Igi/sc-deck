import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src",
  base: "./", // important: relative paths, otherwise Electron can't find the assets (file://)
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
