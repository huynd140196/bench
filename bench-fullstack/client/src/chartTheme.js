// Chart-rendering colors only — every other color in the app runs on the CSS variables in
// styles.css and needs no JS involvement at all. These specifically can't be plain CSS
// variables: `series` is indexed by category position (recharts needs a real JS array to
// cycle through), and each mode needs genuinely different lightness/saturation for the same
// hue (not an inverted/dimmed copy) to stay legible against a dark vs. light panel. One object
// per mode, both here, so light/dark can't drift apart as chart features change.
export const CHART_LIGHT = {
  series: ["#0B6E6E", "#B9791C", "#5C4A7A", "#3D6B8C", "#A8492F", "#5C8A5C", "#8A5C6E"],
  dimColor: "#C7C4B5",
  teal: "#0B6E6E",
  amber: "#B9791C",
  red: "#A8492F",
  tealSoftFill: "#E2EFEC",
  dotStroke: "#FFFFFF",
  tooltipBg: "#FFFFFF",
  tooltipText: "#181B18",
  axisText: "#63685F",
};

export const CHART_DARK = {
  series: ["#3ECFC0", "#E8B04B", "#A78BC9", "#6FA8D0", "#E2694A", "#7FB77E", "#C98CA0"],
  dimColor: "#4A4D45",
  teal: "#3ECFC0",
  amber: "#E8B04B",
  red: "#E2694A",
  tealSoftFill: "#16302E",
  dotStroke: "#23261F",
  tooltipBg: "#23261F",
  tooltipText: "#ECEEE7",
  axisText: "#A7AB9C",
};

export function chartPalette(mode) {
  return mode === "dark" ? CHART_DARK : CHART_LIGHT;
}
