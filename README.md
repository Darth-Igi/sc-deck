# SC Deck v2.3 - Cockpit panels (React + Zustand + MUI)

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
