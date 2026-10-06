// Joystick buttons via the Chromium Gamepad API (Phase B of power
// tracking: prototype, debug display only).
//
// Polled, because the Gamepad API has no button events. Button numbers are
// reported 1-based (index + 1) - the numbering SC uses in actionmaps.xml
// ("js3_button13"), which Phase C has to match against.
//
// Known limits of the API (to verify on the target machine):
// - a device only shows up after one of its buttons was pressed once
//   (Chromium privacy rule)
// - Chromium exposes at most 4 devices
// - unclear whether data flows while the deck window is unfocused
//   (focusable: false) and the game is in the foreground - the main
//   question of this prototype

// "VKBsim Gladiator EVO  R  (Vendor: 231d Product: 0200)" -> parts. The
// vendor/product pair matches the GUID in actionmaps.xml
// ({0200231D-...} = product 0200, vendor 231D).
export function parseGamepadId(id) {
  const m = /^(.*?)\s*\(.*?Vendor:\s*([0-9a-f]{4})\s+Product:\s*([0-9a-f]{4})\)/i.exec(id);
  if (!m) return { name: id.trim(), vendor: null, product: null };
  return { name: m[1].trim(), vendor: m[2].toLowerCase(), product: m[3].toLowerCase() };
}

/**
 * Pure: compares the pressed buttons of the previous poll with the current
 * gamepads and returns the transitions.
 * @param {Map<string, boolean[]>} prev  key -> pressed flags (mutated to the new state)
 * @param {Array<{ index, id, buttons: { pressed }[] } | null>} pads
 */
export function diffGamepadButtons(prev, pads) {
  const events = [];
  const seen = new Set();
  for (const pad of pads) {
    if (!pad) continue;
    const key = `${pad.index}:${pad.id}`;
    seen.add(key);
    const before = prev.get(key) ?? [];
    const now = pad.buttons.map((b) => Boolean(b.pressed));
    const device = parseGamepadId(pad.id);
    now.forEach((down, i) => {
      if (down !== Boolean(before[i])) {
        events.push({ source: "joystick", ...device, slot: pad.index, button: i + 1, down });
      }
    });
    prev.set(key, now);
  }
  // unplugged: forget its state (no synthetic releases - the game will not
  // see them either)
  for (const key of [...prev.keys()]) if (!seen.has(key)) prev.delete(key);
  return events;
}

/**
 * Starts polling. Returns a stop function.
 * @param {(ev) => void} onEvent       button transitions
 * @param {(devices) => void} onDevices list of { slot, name, vendor, product, buttons } on change
 */
export function startJoystickPolling(onEvent, onDevices, intervalMs = 16) {
  const prev = new Map();
  let deviceKey = "";
  const timer = setInterval(() => {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const devices = pads.filter(Boolean).map((p) => ({
      slot: p.index,
      ...parseGamepadId(p.id),
      buttons: p.buttons.length,
    }));
    const key = JSON.stringify(devices);
    if (key !== deviceKey) {
      deviceKey = key;
      onDevices(devices);
    }
    for (const ev of diffGamepadButtons(prev, pads)) onEvent(ev);
  }, intervalMs);
  return () => clearInterval(timer);
}
