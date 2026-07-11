import { createTheme } from "@mui/material/styles";

// Zentrale Design-Tokens für den "Ship HUD"-Look.
// Für andere Hersteller-Looks (Origin, Aegis, RSI ...) einfach
// eine Variante dieser Datei anlegen und in main.jsx umschalten.
export const hud = {
  bg: "#06090f",            // fast schwarzer Hintergrund
  panelBg: "rgba(10, 20, 32, 0.55)",
  line: "#57d9ff",          // Cyan der Panel-Rahmen
  lineDim: "rgba(87, 217, 255, 0.35)",
  glow: "rgba(87, 217, 255, 0.25)",
  text: "#cfefff",
  textDim: "rgba(207, 239, 255, 0.55)",
  active: "#57d9ff",        // gefüllter Zustand (Toggle an)
  activeText: "#04121c",
  danger: "#ff4d4d",
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
    // Eckige, technische Schrift; Orbitron/Michroma wären noch passender,
    // dazu müsste man die Fontdatei lokal ins Projekt legen (kein CDN nötig)
    fontFamily: '"Bahnschrift", "Segoe UI", sans-serif',
    button: {
      textTransform: "uppercase",
      fontWeight: 600,
      letterSpacing: "0.08em",
    },
  },
});
