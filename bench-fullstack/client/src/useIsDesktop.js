import { useEffect, useState } from "react";

// The dashboard grid's own breakpoint: free-form drag/resize (react-grid-layout) above this
// width, a plain stacked single-column list below it — a deliberate component swap (see
// DashboardCharts.jsx), not react-grid-layout's own responsive/breakpoint system, since the
// two are meant to be genuinely different UX (interactive vs. static single column), not a
// reflowed version of the same grid.
const QUERY = "(min-width: 768px)";

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handler = (e) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}
