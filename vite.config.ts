import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mcpPlugin(),
    VitePWA({
      // Registration happens only through src/lib/pwa.ts (guarded: never in dev/preview/iframe).
      injectRegister: null,
      registerType: "autoUpdate",
      filename: "sw.js",
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "icons/*.png"],
      manifest: {
        name: "LUMATEK — Stations-service",
        short_name: "LUMATEK",
        description: "Saisie des index, stocks et réceptions, même sans réseau.",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#0b0f19",
        theme_color: "#0b0f19",
        icons: [
          { src: "/icons/app-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/app-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Hashed build assets are precached; HTML is never served cache-first (index.html is only an offline fallback).
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
            handler: "NetworkFirst",
            // Network first; the precached shell is used only when the network fails (offline).
            options: { cacheName: "pages", networkTimeoutSeconds: 4, expiration: { maxEntries: 10 }, precacheFallback: { fallbackURL: "/index.html" } },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "fonts", expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
