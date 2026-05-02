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
    // Raise warning threshold — we know about pdf/charts, they're lazy
    chunkSizeWarningLimit: 700,
    // Minify with esbuild (default, fast + good compression)
    minify: "esbuild",
    // Target modern browsers for better tree-shaking on mobile
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── React core — tiny, always needed, maximally cacheable ──────────
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "vendor-react";
          }

          // ── Routing + server state ────────────────────────────────────────
          if (
            id.includes("react-router") ||
            id.includes("@tanstack/react-query")
          ) {
            return "vendor-ecosystem";
          }

          // ── Supabase client ───────────────────────────────────────────────
          if (id.includes("@supabase/")) {
            return "vendor-supabase";
          }

          // ── Radix UI primitives (shared by all shadcn/ui components) ──────
          if (id.includes("@radix-ui/")) {
            return "vendor-radix";
          }

          // ── Markdown rendering — only for chat/blog features ──────────────
          if (
            id.includes("react-markdown") ||
            id.includes("remark") ||
            id.includes("rehype") ||
            id.includes("unified") ||
            id.includes("mdast") ||
            id.includes("hast") ||
            id.includes("micromark") ||
            id.includes("vfile") ||
            id.includes("is-plain-obj") ||
            id.includes("trough")
          ) {
            return "markdown-chunk";
          }

          // ── Heavy PDF / document processing ──────────────────────────────
          if (
            id.includes("pdfjs-dist") ||
            id.includes("jspdf") ||
            id.includes("mammoth") ||
            id.includes("html2canvas")
          ) {
            return "pdf-chunk";
          }

          // ── Charts — admin analytics only ─────────────────────────────────
          if (
            id.includes("recharts") ||
            id.includes("d3-") ||
            id.includes("d3/")
          ) {
            return "charts-chunk";
          }

          // ── Rich text editor ──────────────────────────────────────────────
          if (id.includes("react-quill") || id.includes("quill")) {
            return "editor-chunk";
          }
        },
      },
    },
  },
}));
