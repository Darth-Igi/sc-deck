// Anvil MFD look (reference: design-examples/Anvil_F7A_Hornet_Mk_II_*.jpg):
// mint-green CRT with scanlines and phosphor glow, square buttons, widely
// spaced mono type (Share Tech Mono, bundled), rectangular toggles with a
// square thumb.
export default {
  colors: {
    bg: "#08110f",
    panelBg: "rgba(26, 44, 40, 0.85)",
    line: "#8ff5d2",                        // mint
    lineDim: "rgba(143, 245, 210, 0.35)",
    glow: "rgba(143, 245, 210, 0.14)",
    innerGlow: "rgba(143, 245, 210, 0.04)",
    surface: "rgba(60, 104, 92, 0.4)",
    surfaceStrong: "rgba(36, 62, 56, 0.9)",
    text: "#c8fbe7",
    textDim: "rgba(200, 251, 231, 0.55)",
    active: "#a6ffe0",                      // bright ON thumb
    activeText: "#06140f",
    danger: "#ff6a4d",                      // red-orange (shield bar)
    dangerFill: "rgba(255, 106, 77, 0.4)",
    warn: "#f5e36a",                        // yellow chevrons
    warnFill: "rgba(245, 227, 106, 0.4)",
    // extra ANVL roles
    mintDim: "rgba(143, 245, 210, 0.45)",   // OFF thumb
  },

  font: {
    family: '"Share Tech Mono", "Consolas", monospace',
    scale: 1.08,
    letterSpacing: "0.08em",
    synthesis: "none",                      // single weight - no fake bold
    textShadow: "0 0 6px rgba(143, 245, 210, 0.45)",
  },

  radius: 0,

  panel: {
    radius: 2,
    titleStyle: "header",
    titleAlign: "center",
    titleColor: "line",
    titleSpacing: "0.2em",
    divider: "lineDim",
    dividerCaps: "line",
  },

  button: {
    radius: 0,
    borderWidth: 1.5,
    border: "line",
    background: "surface",
    text: "text",
    accent: "line",
    letterSpacing: "0.16em",
  },

  nav: {
    radius: 0,
    color: "line",
    border: "lineDim",
    arrowFill: "surface",
    titleBackground: "transparent",
    titleBorder: "transparent",
    titleColor: "line",
    titleSpacing: "0.35em",
  },

  toggle: {
    accent: "active",
    onTrack: "rgba(143, 245, 210, 0.12)",
    offThumb: "mintDim",
    offThumbBorder: "transparent",
    trackBorder: "line",
    trackRadius: 2,
    offThumbSize: 30,
    offThumbRadius: 0,
    onThumbSize: 30,
    onThumbRadius: 0,
    glow: true,
  },

  art: {
    background: "radial-gradient(ellipse at center, rgba(143, 245, 210, 0.05), transparent 70%)",
    // CRT scanlines over everything
    overlay: "repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.16) 0 1px, transparent 1px 3px)",
  },
};
