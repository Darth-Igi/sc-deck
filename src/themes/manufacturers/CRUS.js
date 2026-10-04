// Crusader MFD look (reference: design-examples/Crusader_A1_Spirit_*.jpg):
// deep blue, navy buttons with blue outline and blue type, yellow for
// "selected", grey title bar, pill toggles (white = ON, small cyan dot =
// OFF). Upright type on purpose - the italic look in the screenshots is
// camera perspective (user decision).
export default {
  colors: {
    bg: "#060c17",
    panelBg: "rgba(16, 30, 50, 0.82)",
    line: "#4aa8ff",
    lineDim: "rgba(74, 168, 255, 0.32)",
    glow: "rgba(74, 168, 255, 0.14)",
    innerGlow: "rgba(74, 168, 255, 0.04)",
    surface: "rgba(14, 28, 66, 0.9)",       // navy button fill
    surfaceStrong: "rgba(20, 38, 62, 0.9)",
    text: "#e4f0ff",
    textDim: "rgba(228, 240, 255, 0.55)",
    active: "#f2f6ff",                      // white ON thumb
    activeText: "#14160a",
    danger: "#ff4a4a",
    dangerFill: "rgba(255, 74, 74, 0.4)",
    warn: "#f5d000",
    warnFill: "rgba(245, 208, 0, 0.4)",
    // extra CRUS roles
    yellow: "#f5d000",                      // selected (WPN)
    blue: "#2f5fe0",                        // button outline
    blueText: "#6a9bff",
    cyan: "#62d0ff",
    grey: "rgba(150, 160, 172, 0.55)",      // title bar
  },

  radius: 8,

  panel: {
    radius: 10,
    titleStyle: "header",
    titleAlign: "left",
    titleColor: "line",
    titleSpacing: "0.12em",
    titleMarker: "cyan",
    divider: "lineDim",
  },

  button: {
    radius: 8,
    borderWidth: 1.5,
    border: "blue",
    background: "surface",
    text: "blueText",
    accent: "yellow",
    pressedText: "activeText",
  },

  nav: {
    radius: 8,
    color: "text",
    border: "rgba(200, 220, 255, 0.55)",
    arrowFill: "surfaceStrong",
    titleBackground: "grey",
    titleBorder: "rgba(220, 230, 255, 0.6)",
    titleColor: "text",
    titleSpacing: "0.12em",
  },

  toggle: {
    accent: "active",
    onTrack: "rgba(140, 165, 215, 0.6)",
    onTrackBorder: "rgba(190, 210, 245, 0.8)",
    offThumb: "cyan",
    offThumbBorder: "transparent",
    trackBorder: "lineDim",
    trackRadius: 24,
    offThumbSize: 22,
    offThumbRadius: 11,
    onThumbSize: 32,
    onThumbRadius: 16,
    glow: false,
  },

  art: {
    background: "radial-gradient(ellipse at 80% 0%, rgba(74, 168, 255, 0.12), transparent 60%)",
  },
};
