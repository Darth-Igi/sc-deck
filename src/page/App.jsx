import { useEffect } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useDeckStore } from "../store";
import { useShipTheme } from "../themes/ShipThemeProvider";
import Panel from "./../component/Panel";
import PageNav from "./../component/PageNav";
import StatusBar from "./../component/StatusBar";

export default function App() {
  const pages = useDeckStore((s) => s.pages);
  const currentPageIndex = useDeckStore((s) => s.currentPageIndex);
  const loaded = useDeckStore((s) => s.loaded);
  const configError = useDeckStore((s) => s.configError);
  const loadConfig = useDeckStore((s) => s.loadConfig);
  const init = useDeckStore((s) => s.init);
  const quit = useDeckStore((s) => s.quit);
  const ship = useShipTheme();
  const hud = ship.colors;

  const handleGameEvent = useDeckStore((s) => s.handleGameEvent);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    // Config hot reload: reload when config.json changes.
    // onConfigChanged returns a cleanup function (unsubscribes the listener).
    if (window.scDeck.onConfigChanged) {
      return window.scDeck.onConfigChanged(() => loadConfig());
    }
  }, [loadConfig]);

  useEffect(() => {
    // Game.log events (vehicle change, destruction, death, restart) -> may
    // reset/restore toggle states. Optional: only present when the main
    // process has the watcher enabled (config.gamelog.enabled).
    if (window.scDeck.onGameEvent) {
      return window.scDeck.onGameEvent((event) => handleGameEvent(event));
    }
  }, [handleGameEvent]);

  const centered = {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    bgcolor: "background.default",
    gap: 2,
    p: 4,
  };

  if (!loaded) {
    return (
      <Box sx={centered}>
        <CircularProgress />
      </Box>
    );
  }

  // Broken config: show the errors instead of loading forever
  if (configError) {
    return (
      <Box sx={{ ...centered, alignItems: "flex-start", overflow: "auto" }}>
        <Typography sx={{ color: hud.danger, fontSize: "1.4rem", fontWeight: 700 }}>
          CONFIG ERROR
        </Typography>
        <Typography sx={{ color: hud.textDim, fontSize: "0.8rem" }}>
          {configError.path}
        </Typography>
        {configError.errors.map((e, i) => (
          <Typography key={i} sx={{ color: hud.text, fontSize: "0.95rem" }}>
            • {e}
          </Typography>
        ))}
        <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
          <Box
            onPointerDown={() => loadConfig()}
            sx={{
              border: `1px solid ${hud.line}`, borderRadius: "8px",
              color: hud.line, px: 3, py: 1, cursor: "pointer",
              fontWeight: 700, letterSpacing: "0.1em",
            }}
          >
            RELOAD
          </Box>
          <Box
            onPointerDown={quit}
            sx={{
              border: `1px solid ${hud.danger}`, borderRadius: "8px",
              color: hud.danger, px: 3, py: 1, cursor: "pointer",
              fontWeight: 700, letterSpacing: "0.1em",
            }}
          >
            QUIT
          </Box>
        </Box>
      </Box>
    );
  }

  const page = pages[currentPageIndex];
  const { art } = ship;

  return (
    <Box
      sx={{
        position: "relative",
        height: "100vh",
        width: "100vw",
        bgcolor: "background.default",
        // ship theme decoration layered over the deck color
        ...(art.background ? { background: `${art.background}, ${hud.bg}` } : {}),
        transition: `background-color ${ship.transitionMs}ms ease`,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        p: 1.5,
        boxSizing: "border-box",
      }}
    >
      {art.logo && (
        <Box
          component="img"
          src={art.logo}
          alt=""
          sx={{
            position: "absolute",
            right: 24,
            bottom: 28,
            height: 120,
            opacity: art.logoOpacity,
            pointerEvents: "none",
          }}
        />
      )}
      <PageNav />

      {/* Weight panel widths by column count, minimum factor 1 */}
      <Box
        sx={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: page.panels
            .map((p) => `${Math.max(p.columns || 3, 1)}fr`)
            .join(" "),
          gap: 2,
          minHeight: 0,
        }}
      >
        {page.panels.map((panel) => (
          <Panel key={panel.id} panel={panel} />
        ))}
      </Box>

      <StatusBar />

      {art.overlay && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: art.overlay,
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
      )}
    </Box>
  );
}
