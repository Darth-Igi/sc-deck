// MISC MFD look (reference: design-examples/MISC_Starlancer_TAC_*.jpg,
// identical on the Starfarer): warm dark olive panels with a fine dot
// raster, gold titles/lines with bright end caps, teal action buttons,
// pink-red chevrons, condensed bold type, soft rounded corners.
export default {
  colors: {
    bg: "#100f0a",
    panelBg: "rgba(38, 35, 24, 0.88)",
    line: "#e9cf6f",                        // gold: titles, dividers
    lineDim: "rgba(233, 207, 111, 0.28)",
    glow: "rgba(233, 207, 111, 0.10)",
    innerGlow: "rgba(233, 207, 111, 0.03)",
    surface: "rgba(62, 56, 36, 0.92)",      // button / bar fill
    surfaceStrong: "rgba(52, 47, 30, 0.95)",
    text: "#f4ecd0",                        // warm white
    textDim: "rgba(244, 236, 208, 0.55)",
    active: "#f4f4f0",                      // ON thumb (white)
    activeText: "#0c1a17",
    danger: "#ff4f6d",                      // chevron pink-red
    dangerFill: "rgba(255, 79, 109, 0.4)",
    warn: "#ffd54a",
    warnFill: "rgba(255, 213, 74, 0.4)",
    // extra MISC roles
    teal: "#3fe3c9",
    tealDim: "rgba(63, 227, 201, 0.55)",
    tealTrack: "rgba(40, 150, 132, 0.75)",
  },

  font: {
    family: '"Bahnschrift SemiBold Condensed", "Bahnschrift Condensed", "Bahnschrift", sans-serif',
    stretch: "condensed",
  },

  radius: 10,

  panel: {
    radius: 12,
    border: "lineDim",
    titleStyle: "header",
    titleAlign: "center",
    titleColor: "line",
    titleSpacing: "0.12em",
    divider: "lineDim",
    dividerCaps: "line",
  },

  button: {
    radius: 10,
    borderWidth: 2,
    border: "teal",
    background: "surface",
    text: "text",
    accent: "teal",
    pressedText: "activeText",
  },

  nav: {
    radius: 12,
    color: "teal",
    border: "teal",
    titleBackground: "surface",
    titleBorder: "line",
    titleColor: "line",
  },

  toggle: {
    accent: "active",
    onTrack: "tealTrack",
    onTrackBorder: "teal",
    offThumb: "line",          // small gold dot when OFF
    offThumbBorder: "transparent",
    trackBorder: "lineDim",
    trackRadius: 24,
    offThumbSize: 26,
    offThumbRadius: 13,
    onThumbSize: 34,
    onThumbRadius: 17,
    glow: false,
  },

  art: {
    // fine warm dot raster like the MFD background
    background: "radial-gradient(rgba(233, 207, 111, 0.07) 1px, transparent 1.3px) 0 0 / 7px 7px",
  },
};
