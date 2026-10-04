// Drake MFD look (reference: design-examples/Drake_Corsair_*.jpg): amber
// CRT - orange/yellow phosphor on olive brown, pixel mono type (VT323,
// bundled), hardly any frames (lines instead), title bar as a solid yellow
// block with dark type, square toggles, scanlines.
export default {
  colors: {
    bg: "#13110a",
    panelBg: "rgba(58, 52, 28, 0.72)",
    line: "#ffbf4a",                        // amber yellow lines
    lineDim: "rgba(255, 191, 74, 0.38)",
    glow: "rgba(255, 150, 60, 0.12)",
    innerGlow: "rgba(255, 150, 60, 0.04)",
    surface: "rgba(84, 72, 34, 0.6)",
    surfaceStrong: "rgba(64, 56, 28, 0.9)",
    text: "#ff8f42",                        // orange type
    textDim: "rgba(255, 143, 66, 0.6)",
    active: "#ffd36b",                      // yellow ON thumb / title bar
    activeText: "#2a210e",
    danger: "#ff4f36",
    dangerFill: "rgba(255, 79, 54, 0.4)",
    warn: "#ffe08a",
    warnFill: "rgba(255, 224, 138, 0.4)",
  },

  font: {
    family: '"VT323", "Consolas", monospace',
    scale: 1.4,                             // VT323 has a small x-height
    letterSpacing: "0.1em",
    synthesis: "none",                      // single weight - no fake bold
    textShadow: "0 0 5px rgba(255, 140, 50, 0.5)",
  },

  radius: 0,

  panel: {
    radius: 0,
    border: "lineDim",
    titleStyle: "header",
    titleAlign: "center",
    titleColor: "text",
    titleSpacing: "0.25em",
    divider: "line",
  },

  button: {
    radius: 0,
    borderWidth: 1.5,
    border: "lineDim",
    background: "surface",
    text: "line",
    accent: "active",
    pressedText: "activeText",
    letterSpacing: "0.2em",
  },

  nav: {
    radius: 0,
    color: "line",
    border: "transparent",
    titleBackground: "active",
    titleBorder: "transparent",
    titleColor: "activeText",
    counterColor: "rgba(42, 33, 14, 0.65)", // dark on the yellow bar
    titleSpacing: "0.35em",
  },

  toggle: {
    accent: "active",
    onTrack: "rgba(255, 191, 74, 0.16)",
    onTrackBorder: "line",
    offThumb: "transparent",
    offThumbBorder: "line",
    trackBorder: "lineDim",
    trackRadius: 0,
    offThumbSize: 30,
    offThumbRadius: 0,
    onThumbSize: 30,
    onThumbRadius: 0,
    glow: false,
  },

  art: {
    background: "radial-gradient(ellipse at center, rgba(255, 170, 60, 0.06), transparent 70%)",
    overlay: "repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 3px)",
  },
};
