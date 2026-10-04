// Origin glass-HUD look (reference: design-examples/Origin_400i_*.jpg):
// the default look's shapes (notched titles, pill buttons, glow) in a
// bluer palette, blue filled title bar. The M80 differs and overrides this
// (ships/ORIG_M80.js).
export default {
  colors: {
    bg: "#050a14",
    panelBg: "rgba(12, 26, 48, 0.58)",
    line: "#66b6ff",                        // light blue
    lineDim: "rgba(102, 182, 255, 0.36)",
    glow: "rgba(102, 182, 255, 0.24)",
    innerGlow: "rgba(102, 182, 255, 0.05)",
    surface: "rgba(102, 182, 255, 0.08)",
    surfaceStrong: "rgba(70, 140, 235, 0.38)", // blue title bar
    text: "#d8eaff",
    textDim: "rgba(216, 234, 255, 0.55)",
    active: "#7cc4ff",
    activeText: "#04101f",
  },
};
