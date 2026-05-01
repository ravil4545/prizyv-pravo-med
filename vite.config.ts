import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Heavy PDF/document processing — only needed in dashboard
          if (id.includes("pdfjs-dist") || id.includes("jspdf") || id.includes("mammoth")) {
            return "pdf-chunk";
          }
          // Charts — only needed in admin analytics
          if (id.includes("recharts") || id.includes("d3-") || id.includes("d3/")) {
            return "charts-chunk";
          }
          // Rich text editor — only needed in forum/blog forms
          if (id.includes("react-quill") || id.includes("quill")) {
            return "editor-chunk";
          }
          // Radix UI primitives — shared across many pages, cache separately
          if (id.includes("@radix-ui")) {
            return "ui-vendor";
          }
          // Supabase client
          if (id.includes("@supabase")) {
            return "supabase-vendor";
          }
          // React Query
          if (id.includes("@tanstack")) {
            return "query-vendor";
          }
          // React core — most stable, longest cache
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "react-vendor";
          }
          // React Router
          if (id.includes("react-router")) {
            return "router-vendor";
          }
        },
      },
    },
  },
}));
