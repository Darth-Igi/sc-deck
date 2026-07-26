import { createTheme } from "@mui/material/styles";

// Central design tokens for the "ship HUD" look.
// For other manufacturer looks (Origin, Aegis, RSI ...) simply create a
// variant of this object and switch it in main.jsx.
export const hud = {
  bg: "#06090f",            // near-black background
  panelBg: "rgba(10, 20, 32, 0.55)",
  line: "#57d9ff",          // cyan of the panel borders
  lineDim: "rgba(87, 217, 255, 0.35)",
  glow: "rgba(87, 217, 255, 0.25)",
  text: "#cfefff",
  textDim: "rgba(207, 239, 255, 0.55)",
  active: "#57d9ff",        // filled state (toggle on)
  activeText: "#04121c",
  danger: "#ff4d4d",
  warn: "#ffc400",         // amber accent (reset button)
};

export const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: hud.bg,
      paper: hud.panelBg,
    },
    primary: { main: hud.line },
    text: { primary: hud.text, secondary: hud.textDim },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    // Angular, technical typeface; Orbitron/Michroma would fit even better -
    // that would require bundling the font file locally (no CDN needed)
    fontFamily: '"Bahnschrift", "Segoe UI", sans-serif',
    button: {
      textTransform: "uppercase",
      fontWeight: 600,
      letterSpacing: "0.08em",
    },
  },
});
