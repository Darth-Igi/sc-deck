import { Box } from "@mui/material";
import { useDeckStore } from "./../store";
import { useShipTheme } from "../themes/ShipThemeProvider";
import { themeColor } from "../themes/resolve";
import { shapeSx } from "../themes/shape";

// Momentary button in HUD style: pill shape with cyan border,
// lights up briefly while pressed
export default function ButtonWidget({ widget }) {
  const triggerButton = useDeckStore((s) => s.triggerButton);
  const pressed = useDeckStore((s) => s.pressedId === widget.id);
  const hasError = useDeckStore((s) => s.errorId === widget.id);
  const t = useShipTheme();
  const c = (v) => themeColor(t, v);

  // config "accent": role name (follows the ship theme) or fixed color
  const accent = themeColor(t, widget.accent, t.button.accent);
  const b = t.button;

  return (
    <Box
      onPointerDown={() => triggerButton(widget)}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 56,
        ...shapeSx({
          corner: b.corner,
          radius: b.radius,
          cut: b.cut,
          borderWidth: hasError ? 2 : b.borderWidth,
          border: hasError ? t.colors.danger : pressed ? accent : c(b.border),
          fill: pressed ? accent : c(b.background),
        }),
        color: pressed ? c(b.pressedText) : c(b.text),
        fontSize: "0.85rem",
        fontWeight: 700,
        letterSpacing: b.letterSpacing,
        textTransform: "uppercase",
        userSelect: "none",
        cursor: "pointer",
        transition: "background 0.08s ease, border-color 0.08s ease",
        boxShadow: pressed ? `0 0 14px ${accent}` : "none",
        px: 1,
        textAlign: "center",
      }}
    >
      {widget.label}
    </Box>
  );
}
