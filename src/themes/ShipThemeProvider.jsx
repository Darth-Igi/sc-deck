import { useMemo } from "react";
import { CssBaseline, ThemeProvider, createTheme, useTheme } from "@mui/material";
import { useDeckStore } from "../store";
import defaultTheme from "./default";
import { SHIP_THEMES } from "./registry";
import { resolveTheme } from "./resolve";

// Builds the MUI theme from a resolved ship theme. The ship theme itself
// travels along as `theme.ship`, so plain components (useShipTheme) and
// styled() components (({ theme }) => theme.ship) both reach it.
export function buildMuiTheme(ship) {
  const c = ship.colors;
  const f = ship.font;
  // optional font slots only emit CSS when set (default look unchanged)
  const spacing = f.letterSpacing ? { letterSpacing: f.letterSpacing } : {};
  return createTheme({
    palette: {
      mode: "dark",
      background: {
        default: c.bg,
        paper: c.panelBg,
      },
      primary: { main: c.line },
      text: { primary: c.text, secondary: c.textDim },
    },
    shape: {
      borderRadius: ship.radius,
    },
    typography: {
      fontFamily: f.family,
      body1: spacing,
      body2: spacing,
      button: {
        textTransform: "uppercase",
        fontWeight: 600,
        letterSpacing: "0.08em",
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ...(f.scale !== 1 ? { html: { fontSize: `${f.scale * 100}%` } } : {}),
          body: {
            fontStyle: f.style,
            fontStretch: f.stretch,
            ...spacing,
            ...(f.synthesis ? { fontSynthesis: f.synthesis } : {}),
            ...(f.textShadow ? { textShadow: f.textShadow } : {}),
          },
        },
      },
    },
    ship,
  });
}

// Ship theme of the current vehicle (default look without a ship)
export function useShipTheme() {
  return useTheme().ship;
}

// Re-themes the whole app whenever the current ship changes
export default function ShipThemeProvider({ children }) {
  const vehicleClass = useDeckStore((s) => s.themePreview ?? s.currentVehicleClass);
  const muiTheme = useMemo(
    () => buildMuiTheme(resolveTheme(vehicleClass, SHIP_THEMES, defaultTheme)),
    [vehicleClass]
  );
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
