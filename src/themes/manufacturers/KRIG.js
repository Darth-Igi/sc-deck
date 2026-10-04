// Kruger MFD look (reference: design-examples/Kruger_L-21_Wolf_*.jpg; the
// L-22 Alpha Wolf matches): black with teal and warm beige, round buttons
// with a light rim, teal-framed title bar, small pill toggles (teal = ON,
// white = OFF).
export default {
  colors: {
    bg: "#0a0c0b",
    panelBg: "rgba(26, 29, 27, 0.9)",
    line: "#46d6b4",                        // teal
    lineDim: "rgba(70, 214, 180, 0.32)",
    glow: "rgba(70, 214, 180, 0.1)",
    innerGlow: "rgba(70, 214, 180, 0.03)",
    surface: "rgba(42, 44, 40, 0.95)",
    surfaceStrong: "rgba(30, 72, 62, 0.7)",  // title bar (dark teal)
    text: "#ebe8da",                        // warm white
    textDim: "rgba(235, 232, 218, 0.55)",
    active: "#5fe0c0",                      // teal ON thumb
    activeText: "#0a1512",
    danger: "#e0473f",
    dangerFill: "rgba(224, 71, 63, 0.4)",
    warn: "#f0c85a",
    warnFill: "rgba(240, 200, 90, 0.4)",
    // extra KRIG roles
    beige: "#d6d0b8",                       // button rims, power bars
    offTrack: "rgba(105, 115, 110, 0.75)",
  },

  radius: 8,

  panel: {
    radius: 16,
    border: "rgba(235, 232, 218, 0.22)",
    titleStyle: "header",
    titleAlign: "left",
    titleColor: "line",
    titleSpacing: "0.1em",
    divider: "rgba(235, 232, 218, 0.22)",
  },

  button: {
    radius: 28,
    borderWidth: 2,
    border: "beige",
    background: "surface",
    text: "text",
    accent: "line",
  },

  nav: {
    radius: 6,
    color: "text",
    border: "text",
    arrowFill: "rgba(0, 0, 0, 0.6)",
    titleBackground: "surfaceStrong",
    titleBorder: "line",
    titleColor: "line",
    titleSpacing: "0.12em",
  },

  toggle: {
    accent: "active",
    onTrack: "offTrack",
    onTrackBorder: "transparent",
    offThumb: "text",
    offThumbBorder: "transparent",
    trackBorder: "rgba(235, 232, 218, 0.7)",
    trackRadius: 24,
    offThumbSize: 30,
    offThumbRadius: 15,
    onThumbSize: 30,
    onThumbRadius: 15,
    glow: false,
  },
};
