// Aegis MFD look (reference: design-examples/Aegis_Gladius_*.jpg and
// Aegis_Sabre_*.jpg - identical): dark navy glass, teal lines, grey-teal
// rounded buttons, yellow for "selected", hatched teal title bar with a
// bright left edge, pill toggles (green = ON, pale blue dot = OFF).
export default {
  colors: {
    bg: "#091017",
    panelBg: "rgba(24, 38, 48, 0.82)",
    line: "#5fd0dc",                        // teal lines
    lineDim: "rgba(95, 208, 220, 0.32)",
    glow: "rgba(95, 208, 220, 0.12)",
    innerGlow: "rgba(95, 208, 220, 0.03)",
    surface: "rgba(62, 92, 104, 0.45)",     // grey-teal button fill
    surfaceStrong: "rgba(40, 62, 72, 0.85)",
    text: "#d3e7eb",
    textDim: "rgba(211, 231, 235, 0.55)",
    active: "#5ee04b",                      // green ON thumb
    activeText: "#1c2410",
    danger: "#e0434e",                      // REPAIR ALL red
    dangerFill: "rgba(224, 67, 78, 0.4)",
    warn: "#f2e65c",
    warnFill: "rgba(242, 230, 92, 0.4)",
    // extra AEGS roles
    yellow: "#f2e65c",                      // selected tab (WPN)
    paleBlue: "#7fc0d4",                    // OFF thumb
  },

  radius: 6,

  panel: {
    radius: 8,
    border: "lineDim",
    titleStyle: "header",
    titleAlign: "center",
    titleColor: "text",
    titleSpacing: "0.1em",
    divider: "lineDim",
  },

  button: {
    radius: 6,
    borderWidth: 1.5,
    border: "lineDim",
    background: "surface",
    text: "line",
    accent: "yellow",
    pressedText: "activeText",
  },

  nav: {
    radius: 6,
    color: "text",
    border: "transparent",
    arrowFill: "surface",
    titleBackground: "rgba(60, 150, 160, 0.38)",
    titleBorder: "transparent",
    titleColor: "text",
    titleSpacing: "0.3em",
    titleFill: "repeating-linear-gradient(135deg, rgba(140, 230, 240, 0.16) 0 2px, transparent 2px 12px)",
    titleMarker: "line",
  },

  toggle: {
    accent: "active",
    onTrack: "transparent",
    onTrackBorder: "active",
    offThumb: "paleBlue",
    offThumbBorder: "transparent",
    trackBorder: "lineDim",
    trackRadius: 24,
    offThumbSize: 30,
    offThumbRadius: 15,
    onThumbSize: 30,
    onThumbRadius: 15,
    glow: false,
  },

  art: {
    background: "linear-gradient(180deg, rgba(95, 208, 220, 0.04), rgba(0, 0, 0, 0.2))",
  },
};
