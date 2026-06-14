import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import seoPrerender from "./vite-plugin-seo-prerender";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Cloudflare (Lovable CDN) doesn't send CORS headers for same-origin assets,
    // but Vite adds crossorigin to the stylesheet link which can confuse some mobile
    // browsers. Strip it since SRI (integrity) isn't used here.
    {
      name: "remove-stylesheet-crossorigin",
      transformIndexHtml(html: string) {
        return html.replace(
          /(<link rel="stylesheet")[^>]* crossorigin([^>]*>)/g,
          "$1$2"
        );
      },
    },
    // SEO-подложка: впекает per-route <head>/canonical/og/JSON-LD в исходный
    // HTML важных страниц после сборки (см. vite-plugin-seo-prerender.ts).
    seoPrerender(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Only group deps that are STATICALLY imported by the entry. Grouping
        // lazy-only deps (pdfjs/recharts/markdown) traps Vite's __vite_preload
        // helper inside them, which forces the entry to statically pull the
        // whole 1.5 MB chunk on every page load — see MOBILE_DEBUG.md.
        // For lazy deps, let Rollup auto-create shared chunks per page.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/"))
            return "vendor-react";
          if (id.includes("react-router") || id.includes("@tanstack/react-query"))
            return "vendor-ecosystem";
          if (id.includes("@supabase/"))
            return "vendor-supabase";
          if (id.includes("@radix-ui/"))
            return "vendor-radix";
        },
      },
    },
  },
}));
