import { Box, Typography } from "@mui/material";
import { useDeckStore } from "../store";
import { hud } from "../theme";

// Schmale Statuszeile (Fix #8): letzter Fehler sichtbar machen –
// auf dem Edge gibt es im Vollbild keine Konsole.
export default function StatusBar() {
  const lastError = useDeckStore((s) => s.lastError);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 1,
        minHeight: 20,
      }}
    >
      <Typography sx={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: hud.textDim }}>
        SC DECK · BEENDEN: CTRL+ALT+Q ODER ⏻
      </Typography>
      {lastError && (
        <Typography sx={{ fontSize: "0.6rem", letterSpacing: "0.1em", color: hud.danger }}>
          [{lastError.time}] {lastError.message}
        </Typography>
      )}
    </Box>
  );
}
