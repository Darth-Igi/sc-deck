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
      fontFamily: ship.font.family,
      button: {
        textTransform: "uppercase",
        fontWeight: 600,
        letterSpacing: "0.08em",
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { fontStyle: ship.font.style, fontStretch: ship.font.stretch },
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
