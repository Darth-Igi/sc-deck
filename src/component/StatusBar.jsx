import { Box, Typography } from "@mui/material";
import { useDeckStore } from "./../store";
import { hud } from "./../theme";

// Slim status bar: makes the last error visible - there is no console
// on the Edge while running fullscreen.
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
        SC DECK · QUIT: CTRL+ALT+Q OR ⏻
      </Typography>
      {lastError && (
        <Typography sx={{ fontSize: "0.6rem", letterSpacing: "0.1em", color: hud.danger }}>
          [{lastError.time}] {lastError.message}
        </Typography>
      )}
    </Box>
  );
}
