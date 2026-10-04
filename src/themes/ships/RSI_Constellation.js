// RSI Constellation look (reference: design-examples/
// RSI_Constellation_Andromeda_*.jpg), on top of RSI: lavender rims instead
// of white, rounded purple-grey buttons, titles notched into the frame like
// the SCREENS / CARGO BAY / TRANSPONDER side panel, blue title bar, pill
// toggles (orange = ON, small lavender dot = OFF). Overrides the RSI
// chamfer shapes.
export default {
  colors: {
    bg: "#15161b",
    panelBg: "rgba(32, 32, 38, 0.92)",
    line: "#cfc8ee",                        // lavender rims
    lineDim: "rgba(207, 200, 238, 0.4)",
    surface: "#2c2a37",                     // purple-grey buttons
    surfaceStrong: "#4f5fa8",               // blue title bar
    text: "#f3f1fb",
    textDim: "rgba(243, 241, 251, 0.55)",
    active: "#f5a524",                      // orange ON thumb
    activeText: "#1a1206",
    orange: "#f5a524",
    navFill: "#2a2a31",
  },

  radius: 10,

  panel: {
    radius: 14,
    border: "line",
    titleStyle: "notch",
    titleColor: "text",
    titleBackground: "bg",
    titleSpacing: "0.12em",
    titleMarker: null,
  },

  button: {
    corner: "round",
    radius: 10,
    borderWidth: 1.5,
    border: "line",
    background: "surface",
    accent: "orange",
  },

  nav: {
    corner: "round",
    radius: 6,
    color: "text",
    border: "transparent",
    arrowFill: "navFill",
    titleBackground: "surfaceStrong",
    titleBorder: "transparent",
    titleSpacing: "0.12em",
  },

  toggle: {
    accent: "active",
    onTrack: "transparent",
    offThumb: "line",
    offThumbBorder: "transparent",
    trackBorder: "line",
    trackRadius: 24,
    offThumbSize: 22,
    offThumbRadius: 11,
    onThumbSize: 34,
    onThumbRadius: 17,
    glow: false,
  },

  art: {
    background: null,
  },
};
