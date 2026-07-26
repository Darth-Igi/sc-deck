import { Box, IconButton, Typography } from "@mui/material";
import { useDeckStore } from "../store";
import { hud } from "../theme";
import { HOLD_MS, useLongPress } from "../useLongPress";

// Paging bar styled after the < TITLE > bars in the game
export default function PageNav() {
  const pages = useDeckStore((s) => s.pages);
  const currentPageIndex = useDeckStore((s) => s.currentPageIndex);
  const nextPage = useDeckStore((s) => s.nextPage);
  const prevPage = useDeckStore((s) => s.prevPage);
  const quit = useDeckStore((s) => s.quit);
  const resetToggles = useDeckStore((s) => s.resetToggles);

  // Quit and reset are guarded by a long press (accidental palm touches on
  // the Edge must not quit the app or wipe the assumed toggle states).
  // While holding, the button "charges up" via a linear background fill.
  const resetHold = useLongPress(resetToggles);
  const quitHold = useLongPress(quit);

  const page = pages[currentPageIndex];

  const arrowSx = {
    color: hud.line,
    border: `1px solid ${hud.lineDim}`,
    borderRadius: "8px",
    width: 64,
    height: 56,
    fontSize: "2.6rem",
    fontWeight: 700,
    "&:active": { background: hud.glow },
  };

  // Charging feedback for long-press buttons: background fills over the
  // hold duration, snaps back quickly when released early.
  const holdSx = (holding, color, fill) => ({
    ...arrowSx,
    color,
    borderColor: fill,
    background: holding ? fill : "transparent",
    transition: holding
      ? `background-color ${HOLD_MS}ms linear`
      : "background-color 120ms ease",
    "&:active": {}, // handled by the charging fill instead
  });

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        px: 1,
        pb: 2,
      }}
    >
      {/* Manual reset, mirroring the quit button on the far right:
          resets all toggles to their config "initial" values without
          sending keys (see store.resetToggles). Long press to trigger. */}
      <IconButton
        sx={holdSx(resetHold.holding, hud.warn, "rgba(255,196,0,0.4)")}
        {...resetHold.handlers}
        aria-label="Reset toggles"
      >
        {"⟲"}
      </IconButton>

      <IconButton sx={arrowSx} onPointerDown={prevPage} aria-label="Previous page">
        {"‹"}
      </IconButton>

      <Box
        sx={{
          flex: 1,
          textAlign: "center",
          border: `1px solid ${hud.lineDim}`,
          borderRadius: "8px",
          background: "rgba(87, 217, 255, 0.08)",
          py: 0.5,
        }}
      >
        <Typography
          sx={{
            color: hud.text,
            letterSpacing: "0.25em",
            fontSize: "1.2rem",
            fontWeight: 600,
          }}
        >
          {page.title}
        </Typography>
        <Typography sx={{ color: hud.textDim, fontSize: "0.8rem", letterSpacing: "0.2em" }}>
          {currentPageIndex + 1} / {pages.length}
        </Typography>
      </Box>

      <IconButton sx={arrowSx} onPointerDown={nextPage} aria-label="Next page">
        {"›"}
      </IconButton>

      <IconButton
        sx={holdSx(quitHold.holding, hud.danger, "rgba(255,77,77,0.4)")}
        {...quitHold.handlers}
        aria-label="Quit app"
      >
        {"⏻"}
      </IconButton>
    </Box>
  );
}
