import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../ThemeContext";

// Rendered once from App.jsx (fixed position), not per-page — about half the pages have no
// existing header/corner element to slot it into, and the ones that do all shape that corner
// differently. A single fixed element guarantees the same reachable spot on every route.
export default function ThemeToggle() {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === "dark";
  return (
    <button
      onClick={toggleMode}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 1000,
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        border: "1px solid var(--border)",
        background: "var(--panel)",
        color: "var(--ink-soft)",
        cursor: "pointer",
        boxShadow: "var(--shadow-elevated)",
      }}
    >
      {isDark ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
