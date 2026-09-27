# SC Deck v2.4 - Cockpit panels + Game.log tracking (React + Zustand + MUI)

Custom touch control surface for the CORSAIR XENEON EDGE. Sends key
combinations to the system (e.g. for Star Citizen) from a freely
configurable, ship-HUD-style interface.

## Setup

```bash
npm install
npm run dev     # development with hot reload
npm start       # builds + launches the finished app
npm test        # unit tests for the config validation
```

## Production build (standalone .exe)

```bash
npm run dist            # tests + renderer + installer AND portable .exe
npm run dist:portable   # only the standalone .exe
npm run dist:installer  # only the NSIS setup
npm run dist:dir        # only release/win-unpacked (fast smoke test)
```

Everything lands in `release/`:

| Artifact | Purpose |
| --- | --- |
| `sc-deck-<version>-portable.exe` | standalone, no installation - copy and run |
| `sc-deck-<version>-setup.exe` | installer with start menu/desktop shortcut and uninstaller |
| `win-unpacked/SC Deck.exe` | unpacked build for debugging |

The build pipeline lives in `scripts/build.mjs` (`--skip-tests`,
`--skip-clean`, `--help`), the packaging options in `electron-builder.yml`.
Node/npm are only needed to build - the artifacts ship their own Electron
runtime and the koffi prebuild.

Two details the config takes care of, both silent failures otherwise:
koffi stays outside `app.asar` (a `.node` cannot be loaded from an archive,
so the app would start but never send a key), and everything except koffi
is stripped from `node_modules` - the renderer is already bundled by Vite,
which takes `app.asar` from 50 MB down to ~0.3 MB.

For a custom application icon, drop a 256x256 `build/icon.ico` into the
project - electron-builder picks it up automatically, otherwise the default
Electron icon is used.

## Quitting the app

The window is deliberately non-focusable (so taps never steal focus from
the game), which means Alt+F4 does not work. Instead:

- **Ctrl+Alt+Q** (global shortcut, works even while the game has focus), or
- the red **⏻** button in the top right corner of the touchscreen.

## Where does the config live?

- **Development** (`npm run dev` / `npm start`): the `config.json` **in the
  project folder** is read directly. Nothing is copied to AppData.
- **Packaged app** (.exe): on first launch the bundled config is copied to
  `%APPDATA%/sc-deck/config.json` (Electron `userData`) and read from there
  afterwards - the install directory is read-only after packaging.

**Config hot reload**: the active config file is watched. Just save - the
UI reloads immediately, keeping the current page and all toggle states. If
the file is broken, the error screen appears; it disappears again
automatically once you fix and save.

Note: if an earlier version already created a copy under
`%APPDATA%\Roaming\sc-deck\config.json`, you can delete it - it is no
longer used in development mode.

## Config schema: pages -> panels -> widgets

```json
{
  "pages": [
    {
      "id": "weapons",
      "title": "WEAPONS",
      "panels": [
        {
          "id": "safeties",
          "title": "SAFETIES",
          "columns": 3,
          "widgets": [
            { "type": "toggle", "id": "wpn", "label": "WPN", "keys": ["F5"], "initial": true },
            { "type": "button", "id": "sel", "label": "SEL", "keys": ["G"] }
          ]
        }
      ]
    }
  ]
}
```

- **`button`** - momentary key. **`toggle`** - additionally remembers a
  local on/off state (an assumption only; the game does not report back).
- `accent` (widget): custom accent color, e.g. `"#ff4d4d"`.
- `columns` (panel): columns of the widget grid; also determines the
  relative panel width on the page.

The config is **validated** on load (structure, key names against the
nut.js Key enum, duplicate IDs). Errors appear as an on-screen message with
the file path - not only when a key is pressed in the middle of a game.

## Robustness

- Key dispatch runs through a **queue**: simultaneous taps cannot
  interleave into wrong combinations.
- Monitor hotplug: if the Xeneon Edge is plugged in later, the window
  moves over automatically.
- Key dispatch errors appear in the status bar at the bottom.

## Administrator rights

If Star Citizen / the RSI launcher runs elevated, SC Deck must also be
started as administrator (Windows UIPI), otherwise the key presses will
not arrive.

## Tests

- `npm test` - unit tests for the config validation (Node, no framework).
- `npm run test:ui` - headless render tests (requires Python + Playwright):
  rendering, toggle dispatch, navigation, quit button, config error screen,
  and hot reload (page + toggle state preserved).

## Next steps

- Power triangle / sliders with coupled values as a dedicated widget
- In-app form-based edit mode instead of hand-editing JSON
- Long press on a toggle: correct the state without sending a key

## Game.log tracking (v2.4): automatic toggle reset per ship

Star Citizen has no API to read component states (lights, power, ...), but
it writes events to a local `Game.log`. SC Deck can tail that file and use
it as an **event trigger** to keep the (locally assumed) toggle states from
drifting:

- **Standing up / re-entering the same ship**: no reset - interior zone
  entries carry a unique spawn instance ID, and the same ID means the same
  ship with unchanged state.
- **Boarding a different ship** (also: the same model freshly claimed or
  respawned - it gets a new instance ID): toggles reset to their `initial`
  values, or are restored from what the deck remembers about that instance.
- **Your ship gets destroyed / you die / the game restarts**: reset.
- **Limitation**: powering the ship off while staying inside it is NOT
  logged and cannot be detected - correct such drift manually (the store
  already has `setToggleState` for a future long-press).

Enable it in `config.json`:

```json
"gamelog": {
  "enabled": true,
  "path": "C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Game.log",
  "pollMs": 750,
  "playerName": "YourHandle"
}
```

- `path` may be `null` -> the default install path above is used.
- `playerName` is optional; normally the handle is auto-detected from the
  login line in the log. Setting it makes entity filtering exact from the
  first line on.
- `patterns` (optional object of regex strings) overrides the built-in log
  line patterns. **Log formats change between patches without notice** - if
  tracking silently stops working after an update, compare the current
  `Game.log` lines with the defaults in `gamelog.js` and override the
  affected pattern in the config (hot reload applies it immediately, no
  restart needed).

The status bar shows the tracked ship (`SHIP: AEGS_Gladius`), reset events,
and `GAME.LOG NOT FOUND` if the file is missing (game not running or wrong
path).
