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
          // Heavy PDF/document processing — lazy-loaded only when user opens medical docs
          if (id.includes("pdfjs-dist") || id.includes("jspdf") || id.includes("mammoth")) {
            return "pdf-chunk";
          }
          // Charts — lazy-loaded only in admin analytics
          if (id.includes("recharts") || id.includes("d3-") || id.includes("d3/")) {
            return "charts-chunk";
          }
          // Rich text editor — lazy-loaded only in forum/blog forms
          if (id.includes("react-quill") || id.includes("quill")) {
            return "editor-chunk";
          }
        },
      },
    },
  },
}));
