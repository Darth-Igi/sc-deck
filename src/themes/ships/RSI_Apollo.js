// RSI Apollo MFD look (reference: design-examples/RSI_Apollo_*.jpg), on
// top of the RSI colors (manufacturers/RSI.js): octagonal white-outlined
// buttons, cut-corner « » bars in muted lavender, left-aligned white titles
// with an orange marker, rectangular toggles (white = ON, red = OFF),
// no glow. Applies to all Apollo variants (Medivac, Triage).
export default {
  radius: 4,

  panel: {
    radius: 6,
    titleStyle: "header",
    titleAlign: "left",
    titleSpacing: "0.08em",
    titleMarker: "orange",
    divider: "lineDim",
    dividerCaps: null,
  },

  button: {
    corner: "chamfer",
    cut: 12,
    borderWidth: 2,
    background: "surface",
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
