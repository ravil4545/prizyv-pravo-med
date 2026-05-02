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
          // Heavy optional deps — only loaded when the relevant lazy page opens
          if (id.includes("pdfjs-dist") || id.includes("jspdf") || id.includes("mammoth") || id.includes("html2canvas"))
            return "vendor-pdf";
          if (id.includes("recharts") || id.includes("d3-") || id.includes("d3/"))
            return "vendor-charts";
          if (id.includes("react-quill") || id.includes("quill"))
            return "vendor-editor";
          if (
            id.includes("react-markdown") || id.includes("remark") ||
            id.includes("rehype") || id.includes("unified") ||
            id.includes("micromark") || id.includes("mdast") ||
            id.includes("hast") || id.includes("vfile")
          )
            return "vendor-markdown";
          // Everything else (React, router, Supabase, Radix, etc.) — one stable vendor chunk
          return "vendor";
        },
      },
    },
  },
}));
