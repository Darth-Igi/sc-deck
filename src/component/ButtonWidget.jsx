import { Box } from "@mui/material";
import { useDeckStore } from "./../store";
import { useShipTheme } from "../themes/ShipThemeProvider";
import { themeColor } from "../themes/resolve";
import { shapeSx } from "../themes/shape";
import { HOLD_MS, useTapOrHold } from "../useLongPress";

// Momentary button in HUD style: pill shape with cyan border,
// lights up briefly while pressed.
//
// Plain button: fires on pointerDOWN (lowest touch latency).
// Button with "hold" (config): tap/hold like the toggles - TAP fires on
// release, holding HOLD_MS sends the hold combo held down for hold.holdMs
// (SC power +1 on tap, MAX on hold). The border charges amber meanwhile.
export default function ButtonWidget({ widget }) {
  const triggerButton = useDeckStore((s) => s.triggerButton);
  const triggerButtonHold = useDeckStore((s) => s.triggerButtonHold);
  const pressed = useDeckStore((s) => s.pressedId === widget.id);
  const hasError = useDeckStore((s) => s.errorId === widget.id);
  const t = useShipTheme();
  const c = (v) => themeColor(t, v);

  // config "accent": role name (follows the ship theme) or fixed color
  const accent = themeColor(t, widget.accent, t.button.accent);
  const b = t.button;

  const tapOrHold = useTapOrHold(
    () => triggerButton(widget),
    () => triggerButtonHold(widget),
  );
  const withHold = Boolean(widget.hold);
  const holding = withHold && tapOrHold.holding;
  const handlers = withHold
    ? tapOrHold.handlers
    : { onPointerDown: () => triggerButton(widget) };

  // error beats holding beats pressed (same priority as the toggles)
  const border = hasError
    ? t.colors.danger
    : holding
      ? t.colors.warn
      : pressed
        ? accent
        : c(b.border);

  return (
    <Box
      {...handlers}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 56,
        ...shapeSx({
          corner: b.corner,
          radius: b.radius,
          cut: b.cut,
          borderWidth: hasError ? 2 : b.borderWidth,
          border,
          fill: pressed ? accent : c(b.background),
        }),
        color: pressed ? c(b.pressedText) : c(b.text),
        fontSize: "0.85rem",
        fontWeight: 700,
        letterSpacing: b.letterSpacing,
        textTransform: "uppercase",
        userSelect: "none",
        cursor: "pointer",
        transition: holding
          ? `border-color ${HOLD_MS}ms ease-in, box-shadow ${HOLD_MS}ms ease-in`
          : "background 0.08s ease, border-color 0.08s ease",
        boxShadow: holding
          ? `0 0 14px ${t.colors.warn}`
          : pressed
            ? `0 0 14px ${accent}`
            : "none",
        px: 1,
        textAlign: "center",
      }}
    >
      {widget.label}
      {widget.hold?.label && (
        <Box component="span" sx={{ fontSize: "0.6rem", opacity: 0.7 }}>
          HOLD: {widget.hold.label}
        </Box>
      )}
    </Box>
  );
}
