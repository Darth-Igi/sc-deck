// Origin M80 look (reference: design-examples/Origin_M80_*.jpg), on top of
// ORIG: pale blue/white glass over the red racing cockpit, rounded
// rectangles, bold left-aligned titles, violet selection, yellow for
// "selected" buttons, pill toggles (white = ON on a grey track, small blue
// dot = OFF), no glow.
export default {
  colors: {
    bg: "#0e0709",
    panelBg: "rgba(44, 22, 32, 0.62)",
    line: "#a9c8ff",                        // pale blue
    lineDim: "rgba(169, 200, 255, 0.36)",
    glow: "rgba(169, 200, 255, 0.1)",
    innerGlow: "rgba(169, 200, 255, 0.03)",
    surface: "rgba(34, 44, 76, 0.6)",
    surfaceStrong: "rgba(140, 160, 210, 0.32)",
    text: "#f2f6ff",
    textDim: "rgba(242, 246, 255, 0.55)",
    active: "#f4f6ff",                      // white ON thumb
    activeText: "#1a1608",
    // extra M80 roles
    yellow: "#f2e65a",
    violet: "#6b6fd8",
    blueDot: "#8fb3ff",
  },

  radius: 6,

  panel: {
    radius: 8,
    titleStyle: "header",
    titleAlign: "left",
    titleColor: "text",
    titleSpacing: "0.1em",
    titleMarker: "violet",
    divider: "lineDim",
  },

  button: {
    radius: 6,
    borderWidth: 1.5,
    border: "line",
    background: "surface",
    text: "line",
    accent: "yellow",
  },

  nav: {
    radius: 6,
    color: "text",
    border: "line",
    titleBackground: "surfaceStrong",
    titleBorder: "transparent",
    titleColor: "text",
    titleSpacing: "0.1em",
  },

  toggle: {
    accent: "active",
    onTrack: "rgba(110, 120, 150, 0.7)",
    onTrackBorder: "transparent",
    offThumb: "blueDot",
    offThumbBorder: "transparent",
    trackBorder: "lineDim",
    trackRadius: 24,
    offThumbSize: 24,
    offThumbRadius: 12,
    onThumbSize: 30,
    onThumbRadius: 15,
    glow: false,
  },

  art: {
    // red cockpit shell glowing through the glass
    background: "radial-gradient(ellipse at 15% 130%, rgba(170, 20, 45, 0.4), transparent 60%), radial-gradient(ellipse at 95% -30%, rgba(170, 20, 45, 0.25), transparent 55%)",
  },
};
