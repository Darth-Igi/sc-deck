// Default "ship HUD" look (cyan) - used when no ship is known and as the
// base every ship/manufacturer theme is merged over (see resolve.js).
// Ship themes only list what differs from this file.
//
// Slots in the component sections accept either a color ROLE (a key of
// `colors`, e.g. "line") or a literal CSS color. Roles keep a theme short:
// a ship theme that only changes colors.line recolors every slot using it.
export default {
  colors: {
    bg: "#06090f",            // near-black background
    panelBg: "rgba(10, 20, 32, 0.55)",
    line: "#57d9ff",          // cyan of the panel borders
    lineDim: "rgba(87, 217, 255, 0.35)",
    glow: "rgba(87, 217, 255, 0.25)",
    innerGlow: "rgba(87, 217, 255, 0.05)",  // inset glow of panels/tracks
    surface: "rgba(87, 217, 255, 0.06)",    // resting fill of buttons
    surfaceStrong: "rgba(87, 217, 255, 0.08)", // page title bar fill
    text: "#cfefff",
    textDim: "rgba(207, 239, 255, 0.55)",
    active: "#57d9ff",        // filled state (toggle on)
    activeText: "#04121c",
    danger: "#ff4d4d",
    dangerFill: "rgba(255, 77, 77, 0.4)",   // quit button charging
    warn: "#ffc400",          // amber accent (reset button, hold feedback)
    warnFill: "rgba(255, 196, 0, 0.4)",     // reset button charging
  },

  font: {
    // Angular, technical typeface shipped with Windows 10/11
    family: '"Bahnschrift", "Segoe UI", sans-serif',
    style: "normal",          // "italic" for slanted cockpit fonts
    stretch: "normal",        // "condensed" / "semi-condensed" (Bahnschrift has a width axis)
    // Bundled fonts (VT323, Share Tech Mono) are imported in main.jsx.
    scale: 1,                 // scales all rem font sizes (small x-height fonts like VT323)
    letterSpacing: null,      // body text + toggle labels; null = MUI default
    synthesis: null,          // "none": no fake bold for single-weight fonts
    textShadow: null,         // e.g. phosphor glow of CRT screens
  },

  // MUI's global corner radius (e.g. CircularProgress, dialogs)
  radius: 12,

  panel: {
    radius: 14,
    border: "lineDim",
    background: "panelBg",
    // "notch":  title sits in a gap of the top border (titleBackground
    //           must match the deck background)
    // "header": title inside the panel, divider line below it
    titleStyle: "notch",
    titleAlign: "left",       // header only: "left" | "center"
    titleColor: "line",
    titleBackground: "bg",
    titleSpacing: "0.25em",
    titleMarker: null,        // color: short bar in front of the title
    divider: "lineDim",       // header only: line below the title
    dividerCaps: null,        // header only: brighter end pieces of the line
  },

  button: {
    corner: "round",          // "round" | "chamfer" (cut corners)
    radius: 28,               // round: pill
    cut: 10,                  // chamfer: corner cut in px
    borderWidth: 1.5,
    border: "lineDim",
    background: "surface",    // chamfer: must be opaque (see shape.js)
    text: "text",
    accent: "line",           // pressed fill; per widget via config "accent"
    pressedText: "activeText",
    letterSpacing: "0.12em",
  },

  nav: {
    corner: "round",          // arrows + reset/quit buttons
    radius: 8,
    cut: 10,
    color: "line",            // arrow glyphs
    border: "lineDim",
    arrowFill: null,          // arrow button fill (chamfer: opaque color)
    titleBackground: "surfaceStrong",
    titleBorder: null,        // null = same as border
    titleColor: "text",
    counterColor: "textDim",  // "1 / 3" below the title
    titleSpacing: "0.25em",
    titleFill: null,          // CSS background layered over titleBackground (e.g. hatching)
    titleMarker: null,        // color: bar at the left edge of the title
  },

  toggle: {
    accent: "active",         // thumb when ON; per widget via config "accent"
    onTrack: "transparent",   // track fill when ON
    onTrackBorder: null,      // null = trackBorder
    offThumb: "glow",         // thumb fill when OFF
    offThumbBorder: null,     // null = accent
    trackBorder: "line",
    trackRadius: 24,
    offThumbSize: 44,         // track is 96 x 48
    offThumbRadius: 22,
    onThumbSize: 40,
    onThumbRadius: 20,
    glow: true,               // glow around ON thumb and track
  },

  // Decorative extras: CSS background layered over the deck background
  // (pattern/gradient/url(...)), an overlay drawn ABOVE everything (e.g.
  // CRT scanlines; never catches pointer events) and an optional logo
  // watermark (imported asset URL, e.g. `import logo from "./assets/rsi.svg"`).
  art: {
    background: null,
    overlay: null,
    logo: null,
    logoOpacity: 0.12,
  },

  transitionMs: 300,          // color fade when the ship theme changes
};
