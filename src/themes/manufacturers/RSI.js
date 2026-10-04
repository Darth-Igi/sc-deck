// RSI MFD look (reference: design-examples/RSI_Apollo_*.jpg and
// RSI_Aurora_Mk_II_*.jpg - both cockpits match): cool slate, white lines/
// text, orange and red accents, octagonal white-outlined buttons, cut-corner
// « » bars in muted lavender, left-aligned white titles with an orange
// marker, rectangular toggles (white = ON, red = OFF), no glow.
// The Constellation differs and overrides this (ships/RSI_Constellation.js).
export default {
  colors: {
    bg: "#171d20",
    panelBg: "rgba(40, 50, 55, 0.92)",
    line: "#e8edf0",                        // white lines
    lineDim: "rgba(232, 237, 240, 0.26)",
    glow: "rgba(232, 237, 240, 0.08)",
    innerGlow: "rgba(232, 237, 240, 0.02)",
    surface: "#1d2427",                     // opaque (chamfer fills)
    surfaceStrong: "rgba(24, 31, 34, 0.9)",
    text: "#f1f4f6",
    textDim: "rgba(241, 244, 246, 0.55)",
    active: "#f1f4f6",                      // white ON thumb
    activeText: "#171d20",
    danger: "#e6505a",                      // WPN red / OFF thumb
    dangerFill: "rgba(230, 80, 90, 0.4)",
    warn: "#f0a33c",                        // orange (SHLD, markers)
    warnFill: "rgba(240, 163, 60, 0.4)",
    // extra RSI roles
    orange: "#f0a33c",
    lavender: "#c8c6ee",                    // label chips
    navFill: "#65677f",                     // « » buttons (opaque)
  },

  font: {
    family: '"Bahnschrift", "Segoe UI", sans-serif',
  },

  radius: 4,

  panel: {
    radius: 6,
    titleStyle: "header",
    titleAlign: "left",
    titleColor: "text",
    titleSpacing: "0.08em",
    titleMarker: "orange",
    divider: "lineDim",
    dividerCaps: null,
  },

  button: {
    corner: "chamfer",
    cut: 12,
    borderWidth: 2,
    border: "line",
    background: "surface",
    accent: "orange",
  },

  nav: {
    corner: "chamfer",
    cut: 12,
    radius: 0,
    color: "text",
    border: "lavender",
    arrowFill: "navFill",
    titleBackground: "surfaceStrong",
    titleBorder: "transparent",
    titleColor: "text",
  },

  toggle: {
    accent: "active",
    onTrack: "transparent",
    offThumb: "danger",
    offThumbBorder: "transparent",
    trackBorder: "line",
    trackRadius: 6,
    offThumbSize: 30,
    offThumbRadius: 4,
    onThumbSize: 30,
    onThumbRadius: 4,
    glow: false,
  },

  art: {
    background: "linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(0, 0, 0, 0.18))",
  },
};
