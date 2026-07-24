import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // react-draggable (a react-grid-layout dependency) checks a bare `process.env.DRAGGABLE_DEBUG`
  // in its drag-start handler with no guard around `process` itself. Vite doesn't polyfill a
  // global `process` for the browser (unlike webpack historically did), so every drag/resize
  // attempt threw "process is not defined" and silently aborted mid-handler — confirmed via a
  // full stack trace during implementation, not assumed. Replacing the `process.env` token
  // with `{}` makes any `process.env.X` reference resolve to `undefined` instead of throwing,
  // without needing to enumerate which specific env vars some dependency might check.
  define: {
    "process.env": "{}",
  },
});
