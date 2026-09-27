import { Box, Typography } from "@mui/material";
import { useShipTheme } from "../themes/ShipThemeProvider";
import { themeColor } from "../themes/resolve";
import ButtonWidget from "./ButtonWidget";
import ToggleWidget from "./ToggleWidget";

const WIDGETS = {
  button: ButtonWidget,
  toggle: ToggleWidget,
};

// Grouped panel with cyan border and title, like SAFETIES /
// COUNTERMEASURES / TARGETING in the cockpit screenshots
export default function Panel({ panel }) {
  const t = useShipTheme();
  const c = (v) => themeColor(t, v);
  const p = t.panel;
  const header = p.titleStyle === "header";
  const fade = `${t.transitionMs}ms ease`;

  const titleSx = {
    color: c(p.titleColor),
    fontSize: "0.95rem",
    fontWeight: 700,
    letterSpacing: p.titleSpacing,
    whiteSpace: "nowrap",
    transition: `color ${fade}`,
  };

  const title = (
    <>
      {p.titleMarker && (
        <Box
          component="span"
          sx={{
            display: "inline-block",
            width: 4,
            height: "0.9em",
            mr: 1,
            verticalAlign: "-0.1em",
            background: c(p.titleMarker),
          }}
        />
      )}
      {panel.title}
    </>
  );

  // Divider below a header title; optional brighter caps at both ends
  // (MISC style: gold line with light end pieces)
  const caps = p.dividerCaps ? c(p.dividerCaps) : null;
  const line = c(p.divider);
  const solid = (col) => `linear-gradient(${col}, ${col})`;
  const dividerBg = caps
    ? `${solid(caps)} left center / 18px 3px no-repeat, ${solid(caps)} right center / 18px 3px no-repeat, ${solid(line)} center / 100% 1px no-repeat`
    : line;

  return (
    <Box
      sx={{
        position: "relative",
        border: `1px solid ${c(p.border)}`,
        borderRadius: `${p.radius}px`,
        background: c(p.background),
        boxShadow: `0 0 12px ${t.colors.glow}, inset 0 0 24px ${t.colors.innerGlow}`,
        p: 1.5,
        pt: header ? 1 : 3,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        transition: `background ${fade}, border-color ${fade}, box-shadow ${fade}`,
      }}
    >
      {header ? (
        <Box sx={{ mb: 1.5 }}>
          <Typography sx={{ ...titleSx, textAlign: p.titleAlign, pb: 0.75 }}>{title}</Typography>
          {/* explicit px: MUI's sx reads height 1 as 100% */}
          <Box sx={{ height: caps ? "3px" : "1px", background: dividerBg }} />
        </Box>
      ) : (
        <Typography
          sx={{
            ...titleSx,
            position: "absolute",
            top: -10,
            left: 14,
            px: 1,
            background: c(p.titleBackground),
          }}
        >
          {title}
        </Typography>
      )}

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
            console.warn(`Unknown widget type: ${widget.type}`);
            return null;
          }
          return <Widget key={widget.id} widget={widget} />;
        })}
      </Box>
    </Box>
  );
}
