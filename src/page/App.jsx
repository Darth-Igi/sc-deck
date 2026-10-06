import { useEffect } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useDeckStore } from "../store";
import { useShipTheme } from "../themes/ShipThemeProvider";
import Panel from "./../component/Panel";
import PageNav from "./../component/PageNav";
import StatusBar from "./../component/StatusBar";
import { startJoystickPolling } from "../joystick";

// Columns a panel occupies: column-flow panels ("rows") get one column per
// `rows` widgets, grid panels their "columns" (default 3)
const panelColumns = (p) =>
  p.rows ? Math.ceil(p.widgets.length / p.rows) : p.columns || 3;

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
  const handleInputEvent = useDeckStore((s) => s.handleInputEvent);
  const setJoystickDevices = useDeckStore((s) => s.setJoystickDevices);
  const joystickEnabled = useDeckStore((s) => Boolean(s.inputConfig.joystick));

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

  useEffect(() => {
    // Physical keyboard (main process hook, config.input.keyboard)
    if (window.scDeck.onInputEvent) {
      return window.scDeck.onInputEvent((event) => handleInputEvent(event));
    }
  }, [handleInputEvent]);

  useEffect(() => {
    // Joystick buttons (Gamepad API, config.input.joystick)
    if (!joystickEnabled) return;
    const stop = startJoystickPolling(
      (event) => handleInputEvent({ type: "input", ...event }),
      setJoystickDevices,
    );
    return () => {
      stop();
      setJoystickDevices([]);
    };
  }, [joystickEnabled, handleInputEvent, setJoystickDevices]);

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
      <PageNav />

      {/* Weight panel widths by column count, minimum factor 1 */}
      <Box
        sx={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: page.panels
            .map((p) => `${Math.max(panelColumns(p), 1)}fr`)
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
