import { Box, Typography } from "@mui/material";
import { useDeckStore } from "../store";
import { hud } from "../theme";

// Toggle im Stil der ON/OFF-Schalter aus dem Cockpit (WPN, HEAT, OVRCLK):
// Pill-Button, der im An-Zustand gefüllt bleibt, darunter ON/OFF-Label.
// Achtung: Zustand ist rein lokal ("vermutet") – das Spiel meldet nichts zurück.
export default function ToggleWidget({ widget }) {
  const triggerToggle = useDeckStore((s) => s.triggerToggle);
  const isOn = useDeckStore((s) => Boolean(s.toggleStates[widget.id]));
  const pressed = useDeckStore((s) => s.pressedId === widget.id);
  const hasError = useDeckStore((s) => s.errorId === widget.id);

  const accent = widget.accent || hud.active;

  return (
    <Box
      onPointerDown={() => triggerToggle(widget)}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.4,
        userSelect: "none",
        cursor: "pointer",
      }}
    >
      <Box
        sx={{
          width: "100%",
          minHeight: 44,
          borderRadius: "22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: hasError
            ? `2px solid ${hud.danger}`
            : `1.5px solid ${isOn ? accent : hud.lineDim}`,
          background: isOn ? accent : "rgba(87, 217, 255, 0.06)",
          color: isOn ? hud.activeText : hud.text,
          fontSize: "0.85rem",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          boxShadow: isOn ? `0 0 14px ${accent}` : "none",
          transform: pressed ? "scale(0.95)" : "scale(1)",
          transition:
            "background 0.1s ease, box-shadow 0.1s ease, transform 0.06s ease",
          px: 1,
          textAlign: "center",
        }}
      >
        {widget.label}
      </Box>
      <Typography
        sx={{
          fontSize: "0.55rem",
          letterSpacing: "0.2em",
          color: isOn ? accent : hud.textDim,
          fontWeight: 600,
        }}
      >
        {isOn ? "ON" : "OFF"}
      </Typography>
    </Box>
  );
}
