import { Box, Typography } from "@mui/material";
import { useDeckStore } from "../store";
import { useShipTheme } from "../themes/ShipThemeProvider";
import { SHIP_THEMES } from "../themes/registry";

// Dev-only (`npm run dev`, stripped from production builds): tap cycles
// the theme preview through DEFAULT and every registered ship theme, so
// themes can be designed without the game. The window is not focusable,
// hence a touch control instead of a keyboard shortcut.
const PREVIEW_CYCLE = [null, ...Object.keys(SHIP_THEMES)];

function DevThemePicker() {
  const themePreview = useDeckStore((s) => s.themePreview);
  const setThemePreview = useDeckStore((s) => s.setThemePreview);
  const hud = useShipTheme().colors;
  const next = () => {
    const i = PREVIEW_CYCLE.indexOf(themePreview);
    setThemePreview(PREVIEW_CYCLE[(i + 1) % PREVIEW_CYCLE.length]);
  };
  return (
    <Box
      onPointerDown={next}
      sx={{
        border: `1px dashed ${hud.warn}`,
        color: hud.warn,
        fontSize: "0.6rem",
        letterSpacing: "0.15em",
        px: 1.5,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      DEV THEME: {themePreview ?? "SHIP / DEFAULT"} ▸
    </Box>
  );
}

// Debug line (config.input.debug): hook/device/bindings status + the last
// physical inputs with the SC action they matched, to verify on the target
// machine that keys and joystick buttons arrive and map correctly.
function describeInput(ev) {
  const arrow = ev.down ? "↓" : "↑";
  const action = ev.actions?.length ? ` → ${ev.actions.join("+")}` : "";
  if (ev.source === "keyboard") {
    return `KB ${ev.key}${arrow}${ev.injected ? " (INJ)" : ""}${action}`;
  }
  return `JS${ev.slot} ${ev.name} B${ev.button}${arrow}${action}`;
}

function InputDebug() {
  const cfg = useDeckStore((s) => s.inputConfig);
  const hookState = useDeckStore((s) => s.keyboardHookState);
  const devices = useDeckStore((s) => s.joystickDevices);
  const lastInputs = useDeckStore((s) => s.lastInputs);
  const bindings = useDeckStore((s) => s.inputBindings);
  const hud = useShipTheme().colors;
  const parts = [];
  if (cfg.keyboard) parts.push(`KB: ${(hookState ?? "starting").toUpperCase()}`);
  if (cfg.joystick) {
    parts.push(
      devices.length
        ? `JS: ${devices.map((d) => `${d.slot}=${d.name} [${d.buttons}]`).join(", ")}`
        : "JS: NONE (PRESS A BUTTON)"
    );
  }
  // "loaded" = actionmaps.xml read, "missing" = SC keyboard defaults only
  if (bindings) parts.push(`MAP: ${bindings.state.toUpperCase()}`);
  parts.push(lastInputs.length ? lastInputs.map(describeInput).join(" · ") : "NO INPUT YET");
  return (
    <Typography
      data-input-debug
      sx={{ fontSize: "0.6rem", letterSpacing: "0.1em", color: hud.warn, whiteSpace: "nowrap" }}
    >
      INPUT · {parts.join(" | ")}
    </Typography>
  );
}

// Slim status bar: makes the last error visible - there is no console
// on the Edge while running fullscreen.
export default function StatusBar() {
  const lastError = useDeckStore((s) => s.lastError);
  const gameStatus = useDeckStore((s) => s.gameStatus);
  const currentVehicleName = useDeckStore((s) => s.currentVehicleName);
  const gamelogState = useDeckStore((s) => s.gamelogState);
  const inputDebug = useDeckStore((s) => Boolean(s.inputConfig.debug));
  const hud = useShipTheme().colors;

  // Game.log info: current ship if known, otherwise the last event;
  // "missing" warns that the log file was not found (wrong path / game off).
  let gameInfo = null;
  if (gamelogState === "missing") {
    gameInfo = "GAME.LOG NOT FOUND";
  } else if (currentVehicleName) {
    gameInfo = `SHIP: ${currentVehicleName}`;
  } else if (gameStatus) {
    gameInfo = gameStatus.message;
  }

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
        {gameInfo ? ` · ${gameInfo}` : ""}
      </Typography>
      {inputDebug && <InputDebug />}
      {import.meta.env.DEV && <DevThemePicker />}
      {lastError && (
        <Typography sx={{ fontSize: "0.6rem", letterSpacing: "0.1em", color: hud.danger }}>
          [{lastError.time}] {lastError.message}
        </Typography>
      )}
    </Box>
  );
}
