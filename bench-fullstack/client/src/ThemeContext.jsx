import React, { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "bench_theme";
const ThemeContext = createContext(null);

// Mirrors the inline script in index.html's <head> (which sets data-theme on <html> before
// React mounts, to avoid a flash of the wrong theme) — this just brings that same value into
// React state so components can read/toggle it. localStorage is the single source of truth;
// both places read/write the same key.
export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => (localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light"));

  useEffect(() => {
    if (mode === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggleMode = () => setMode((m) => (m === "dark" ? "light" : "dark"));

  return <ThemeContext.Provider value={{ mode, toggleMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
