import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Catch dynamic-import / chunk-load failures BEFORE React mounts.
window.addEventListener("unhandledrejection", (event) => {
  const msg = String(event.reason?.message ?? event.reason ?? "");
  const isChunkError =
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading") ||
    msg.includes("Loading chunk");
  if (!isChunkError) return;
  event.preventDefault();
  if (!sessionStorage.getItem("chunk_reload")) {
    sessionStorage.setItem("chunk_reload", "1");
    window.location.reload();
  } else {
    // Second failure — show error (window._showAppError defined in index.html)
    (window as unknown as Record<string, (msg: string) => void>)._showAppError?.(
      "Ошибка загрузки модулей. Проверьте интернет и попробуйте снова."
    );
  }
});

// Catch synchronous errors thrown during React bootstrap (not in ErrorBoundary yet).
try {
  createRoot(document.getElementById("root")!).render(<App />);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  (window as unknown as Record<string, (msg: string) => void>)._showAppError?.(msg);
}
