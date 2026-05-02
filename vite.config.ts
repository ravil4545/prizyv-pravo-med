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
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Each chunk loads in parallel via HTTP/2 — max chunk ≈46 kB gzip
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/"))
            return "vendor-react";
          if (id.includes("react-router") || id.includes("@tanstack/react-query"))
            return "vendor-ecosystem";
          if (id.includes("@supabase/"))
            return "vendor-supabase";
          if (id.includes("@radix-ui/"))
            return "vendor-radix";
          // Heavy optional — only fetched when the relevant lazy page opens
          if (id.includes("react-markdown") || id.includes("remark") || id.includes("rehype") ||
              id.includes("unified") || id.includes("mdast") || id.includes("hast") ||
              id.includes("micromark") || id.includes("vfile") || id.includes("is-plain-obj") ||
              id.includes("trough"))
            return "vendor-markdown";
          if (id.includes("pdfjs-dist") || id.includes("jspdf") || id.includes("mammoth") || id.includes("html2canvas"))
            return "vendor-pdf";
          if (id.includes("recharts") || id.includes("d3-") || id.includes("d3/"))
            return "vendor-charts";
          if (id.includes("react-quill") || id.includes("quill"))
            return "vendor-editor";
        },
      },
    },
  },
}));
