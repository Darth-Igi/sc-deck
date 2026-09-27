import { Box, IconButton, Typography } from "@mui/material";
import { useDeckStore } from "../store";
import { useShipTheme } from "../themes/ShipThemeProvider";
import { themeColor } from "../themes/resolve";
import { fillSx, shapeSx } from "../themes/shape";
import { HOLD_MS, useLongPress } from "../useLongPress";

// Paging bar styled after the < TITLE > bars in the game
export default function PageNav() {
  const pages = useDeckStore((s) => s.pages);
  const currentPageIndex = useDeckStore((s) => s.currentPageIndex);
  const nextPage = useDeckStore((s) => s.nextPage);
  const prevPage = useDeckStore((s) => s.prevPage);
  const quit = useDeckStore((s) => s.quit);
  const resetToggles = useDeckStore((s) => s.resetToggles);
  const t = useShipTheme();
  const c = (v) => themeColor(t, v);
  const hud = t.colors;

  // Quit and reset are guarded by a long press (accidental palm touches on
  // the Edge must not quit the app or wipe the assumed toggle states).
  // While holding, the button "charges up" via a linear background fill.
  const resetHold = useLongPress(resetToggles);
  const quitHold = useLongPress(quit);

  const page = pages[currentPageIndex];

  const n = t.nav;
  const arrowFill = n.arrowFill ? c(n.arrowFill) : undefined;
  const navShape = (border, fill) =>
    shapeSx({ corner: n.corner, radius: n.radius, cut: n.cut, borderWidth: 1, border, fill });

  const arrowSx = {
    color: c(n.color),
    ...navShape(c(n.border), arrowFill),
    width: 64,
    height: 56,
    fontSize: "2.6rem",
    fontWeight: 700,
    "&:active": fillSx(n.corner, hud.glow),
  };

  // Charging feedback for long-press buttons: background fills over the
  // hold duration, snaps back quickly when released early.
  const holdSx = (holding, color, fill) => {
    const transition = holding
      ? `background-color ${HOLD_MS}ms linear`
      : "background-color 120ms ease";
    const shape = navShape(fill, holding ? fill : arrowFill ?? "transparent");
    if (n.corner === "chamfer") {
      shape["&::before"] = { ...shape["&::before"], transition };
    } else {
      shape.transition = transition;
    }
    return {
      ...arrowSx,
      ...shape,
      color,
      "&:active": {}, // handled by the charging fill instead
    };
  };

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
        sx={holdSx(resetHold.holding, hud.warn, hud.warnFill)}
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
          border: `1px solid ${c(n.titleBorder ?? n.border)}`,
          borderRadius: `${n.radius}px`,
          background: c(n.titleBackground),
          py: 0.5,
          transition: `background ${t.transitionMs}ms ease, border-color ${t.transitionMs}ms ease`,
        }}
      >
        <Typography
          sx={{
            color: c(n.titleColor),
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
        sx={holdSx(quitHold.holding, hud.danger, hud.dangerFill)}
        {...quitHold.handlers}
        aria-label="Quit app"
      >
        {"⏻"}
      </IconButton>
    </Box>
  );
}
