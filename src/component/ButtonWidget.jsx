import { Box } from "@mui/material";
import { useDeckStore } from "./../store";
import { hud } from "./../theme";

// Momentary button in HUD style: pill shape with cyan border,
// lights up briefly while pressed
export default function ButtonWidget({ widget }) {
  const triggerButton = useDeckStore((s) => s.triggerButton);
  const pressed = useDeckStore((s) => s.pressedId === widget.id);
  const hasError = useDeckStore((s) => s.errorId === widget.id);

  const accent = widget.accent || hud.line;

  return (
    <Box
      onPointerDown={() => triggerButton(widget)}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 56,
        borderRadius: "28px",
        border: hasError
          ? `2px solid ${hud.danger}`
          : `1.5px solid ${pressed ? accent : hud.lineDim}`,
        background: pressed ? accent : "rgba(87, 217, 255, 0.06)",
        color: pressed ? hud.activeText : hud.text,
        fontSize: "0.85rem",
        fontWeight: 700,
        letterSpacing: "0.12em",
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
