import { Box, Typography } from "@mui/material";
import { hud } from "../theme";
import ButtonWidget from "./ButtonWidget";
import ToggleWidget from "./ToggleWidget";

const WIDGETS = {
  button: ButtonWidget,
  toggle: ToggleWidget,
};

// Gruppiertes Panel mit Cyan-Rahmen und Titel, wie SAFETIES /
// COUNTERMEASURES / TARGETING in den Cockpit-Screenshots
export default function Panel({ panel }) {
  return (
    <Box
      sx={{
        position: "relative",
        border: `1px solid ${hud.lineDim}`,
        borderRadius: "14px",
        background: hud.panelBg,
        boxShadow: `0 0 12px ${hud.glow}, inset 0 0 24px rgba(87,217,255,0.05)`,
        p: 1.5,
        pt: 3,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <Typography
        sx={{
          position: "absolute",
          top: -10,
          left: 14,
          px: 1,
          background: hud.bg,
          color: hud.line,
          fontSize: "0.95rem",
          fontWeight: 700,
          letterSpacing: "0.25em",
          whiteSpace: "nowrap",
        }}
      >
        {panel.title}
      </Typography>

      <Box
        sx={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${panel.columns || 3}, 1fr)`,
          gap: 2,
          alignContent: "start",
        }}
      >
        {panel.widgets.map((widget) => {
          const Widget = WIDGETS[widget.type];
          if (!Widget) {
            console.warn(`Unbekannter Widget-Typ: ${widget.type}`);
            return null;
          }
          return <Widget key={widget.id} widget={widget} />;
        })}
      </Box>
    </Box>
  );
}
