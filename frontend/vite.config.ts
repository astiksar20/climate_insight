import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    port: 8080,
    // climate API in /backend (npm run dev there); the app falls back to in-browser fetching if it's not running
    proxy: {
      "/api": { target: process.env.BACKEND_URL ?? "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});
