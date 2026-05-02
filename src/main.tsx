import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Catch dynamic-import / chunk-load failures BEFORE React mounts.
// On Android with slow connections, a chunk 404/timeout gives a white screen
// with no visible error. We auto-reload once; on second failure show a message.
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
    const loader = document.getElementById("app-loader");
    if (loader) {
      loader.innerHTML =
        '<div style="text-align:center;padding:2rem;font-family:system-ui">' +
        '<p style="font-size:1.1rem;font-weight:600;color:#111827;margin:0 0 .5rem">Ошибка загрузки</p>' +
        '<p style="font-size:.875rem;color:#6b7280;margin:0 0 1.25rem">Проверьте интернет и попробуйте снова</p>' +
        '<button onclick="sessionStorage.clear();location.reload()" style="padding:.625rem 1.5rem;background:#1a56db;color:#fff;border:none;border-radius:8px;font-size:.875rem;cursor:pointer;font-weight:500">Обновить страницу</button>' +
        "</div>";
    }
  }
});

createRoot(document.getElementById("root")!).render(<App />);
