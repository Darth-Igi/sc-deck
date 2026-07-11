import { Box, IconButton, Typography } from "@mui/material";
import { useDeckStore } from "./../store";
import { hud } from "./../theme";

// Paging bar styled after the < TITLE > bars in the game
export default function PageNav() {
  const pages = useDeckStore((s) => s.pages);
  const currentPageIndex = useDeckStore((s) => s.currentPageIndex);
  const nextPage = useDeckStore((s) => s.nextPage);
  const prevPage = useDeckStore((s) => s.prevPage);
  const quit = useDeckStore((s) => s.quit);

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
        sx={{ ...arrowSx, height: 56, width: 64, borderColor: "rgba(255,77,77,0.4)", color: hud.danger }}
        onPointerDown={quit}
        aria-label="Quit app"
      >
        {"⏻"}
      </IconButton>
    </Box>
  );
}
