// RSI base look (derived from the Apollo MFDs, see ships/RSI_Apollo.js):
// cool slate, white lines/text, orange and red accents. Deliberately only
// colors + type - the distinctive shapes (cut corners, square toggles) live
// in the Apollo theme until other RSI cockpits are confirmed to match.
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

  panel: {
    titleColor: "text",
  },

  button: {
    border: "line",
    accent: "orange",
  },

  nav: {
    color: "text",
    border: "lineDim",
    titleColor: "text",
  },
};
