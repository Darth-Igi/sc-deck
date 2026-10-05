"""Tests the Game.log event path in the renderer:
game-event -> toggle states reset / preserved / restored per ship instance,
status bar shows the current ship."""
import json, http.server, threading, functools, os

os.chdir(os.path.join(os.path.dirname(__file__), ".."))
from playwright.sync_api import sync_playwright

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory="dist")
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8126), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

config = json.load(open("config.json"))

EXEC = os.environ.get("SCDECK_CHROMIUM")  # optional explicit browser path

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXEC) if EXEC else p.chromium.launch()
    pg = b.new_page(viewport={"width": 2560, "height": 720})
    pg.add_init_script(f"""
      window.__gameListeners = [];
      window.scDeck = {{
        getConfig: async () => ({{ ok: true, path: "/mock", config: {json.dumps(config)}, warnings: [] }}),
        sendHotkey: async (k) => ({{ ok: true }}),
        quitApp: async () => {{}},
        onConfigChanged: (cb) => () => {{}},
        onGameEvent: (cb) => {{ window.__gameListeners.push(cb); return () => {{}}; }}
      }};
      window.__fire = (e) => window.__gameListeners.forEach(cb => cb(e));
    """)
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto("http://127.0.0.1:8126/")
    pg.wait_for_timeout(1200)

    def ovrclk_on():
        return pg.locator('label:has-text("OVRCLK") input[type=checkbox]').is_checked()

    # OVRCLK starts OFF (initial: false); flip it ON
    assert not ovrclk_on()
    pg.locator('label:has-text("OVRCLK")').dispatch_event("pointerdown")
    pg.wait_for_timeout(80)
    pg.locator('label:has-text("OVRCLK")').dispatch_event("pointerup")
    pg.wait_for_timeout(200)
    assert ovrclk_on()

    # Board ship A -> reset to initial (OFF), status bar shows the ship
    pg.evaluate("window.__fire({type:'vehicle-changed', vehicleId:'AEGS_Gladius_1', vehicleClass:'AEGS_Gladius', previousVehicleId:null})")
    pg.wait_for_timeout(200)
    assert not ovrclk_on(), "boarding a ship must reset toggles to initial"
    assert pg.get_by_text("SHIP: AEGS_Gladius").count() > 0, "status bar must show current ship"

    # Flip ON again; the SAME instance again (sat down after standing up in
    # the same ship would not even fire, but a repeated event must not reset
    # either since the parser filters it - simulate no event at all here)
    pg.locator('label:has-text("OVRCLK")').dispatch_event("pointerdown")
    pg.wait_for_timeout(80)
    pg.locator('label:has-text("OVRCLK")').dispatch_event("pointerup")
    pg.wait_for_timeout(200)
    assert ovrclk_on()

    # Switch to ship B -> reset again
    pg.evaluate("window.__fire({type:'vehicle-changed', vehicleId:'ANVL_Carrack_2', vehicleClass:'ANVL_Carrack', previousVehicleId:'AEGS_Gladius_1'})")
    pg.wait_for_timeout(200)
    assert not ovrclk_on(), "switching ships must reset toggles"

    # Back to ship A -> remembered state (ON) restored
    pg.evaluate("window.__fire({type:'vehicle-changed', vehicleId:'AEGS_Gladius_1', vehicleClass:'AEGS_Gladius', previousVehicleId:'ANVL_Carrack_2'})")
    pg.wait_for_timeout(200)
    assert ovrclk_on(), "returning to a known ship must restore its state"

    # Destruction of the current ship -> reset + memory dropped
    pg.evaluate("window.__fire({type:'vehicle-destroyed', vehicleId:'AEGS_Gladius_1', vehicleClass:'AEGS_Gladius', isCurrent:true})")
    pg.wait_for_timeout(200)
    assert not ovrclk_on(), "destruction must reset toggles"
    pg.evaluate("window.__fire({type:'vehicle-changed', vehicleId:'AEGS_Gladius_1', vehicleClass:'AEGS_Gladius', previousVehicleId:null})")
    pg.wait_for_timeout(200)
    assert not ovrclk_on(), "destroyed ship's memory must be forgotten"

    # Ship channel path (current patches): key "<class>:<owner>", display
    # name in the status bar, leave -> remember, re-board -> restore,
    # fresh retrieval -> reset.
    apollo = "{type:'vehicle-changed', vehicleId:'RSI_Apollo_Medivac:P', vehicleClass:'RSI_Apollo_Medivac', shipName:'RSI Apollo Medivac', owner:'P', fresh:%s}"
    pg.evaluate(f"window.__fire({apollo % 'true'})")
    pg.wait_for_timeout(200)
    assert pg.get_by_text("SHIP: RSI Apollo Medivac").count() > 0, "status bar must show the display name"
    pg.locator('label:has-text("OVRCLK")').dispatch_event("pointerdown")
    pg.wait_for_timeout(80)
    pg.locator('label:has-text("OVRCLK")').dispatch_event("pointerup")
    pg.wait_for_timeout(200)
    assert ovrclk_on()

    pg.evaluate("window.__fire({type:'vehicle-left', vehicleId:'RSI_Apollo_Medivac:P', vehicleClass:'RSI_Apollo_Medivac'})")
    pg.wait_for_timeout(200)
    assert not ovrclk_on(), "leaving the ship falls back to initial"
    assert pg.get_by_text("SHIP: RSI Apollo Medivac").count() == 0, "no ship after leaving"
    assert pg.get_by_text("LEFT SHIP").count() > 0

    pg.evaluate(f"window.__fire({apollo % 'false'})")
    pg.wait_for_timeout(200)
    assert ovrclk_on(), "re-boarding the same ship restores its state"

    pg.evaluate("window.__fire({type:'vehicle-left', vehicleId:'RSI_Apollo_Medivac:P'})")
    pg.evaluate(f"window.__fire({apollo % 'true'})")
    pg.wait_for_timeout(200)
    assert not ovrclk_on(), "a freshly retrieved instance starts from initial"

    # Ship themes: boarding switches the look (manufacturer fallback and
    # model theme), leaving returns to the default look.
    def body_bg():
        return pg.evaluate("getComputedStyle(document.body).backgroundColor")

    def button_radius(label):
        return pg.evaluate(
            "(l) => { const el = [...document.querySelectorAll('div')].find(d => d.textContent === l && d.children.length === 0); return getComputedStyle(el).clipPath + '|' + getComputedStyle(el).borderTopLeftRadius }",
            label,
        )

    pg.evaluate("window.__fire({type:'vehicle-left', vehicleId:'RSI_Apollo_Medivac:P'})")
    pg.wait_for_timeout(500)
    default_bg = body_bg()
    default_btn = button_radius("SELF DESTRUCT")
    assert default_bg == "rgb(6, 9, 15)", f"default deck background expected, got {default_bg}"

    pg.evaluate("window.__fire({type:'vehicle-changed', vehicleId:'MISC_Starfarer:P', vehicleClass:'MISC_Starfarer', shipName:'MISC Starfarer', fresh:false})")
    pg.wait_for_timeout(500)
    assert body_bg() == "rgb(16, 15, 10)", "MISC manufacturer theme must apply to any MISC ship"
    assert pg.get_by_text("SHIP: MISC Starfarer").count() > 0

    pg.evaluate("window.__fire({type:'vehicle-changed', vehicleId:'RSI_Apollo_Triage:P', vehicleClass:'RSI_Apollo_Triage', shipName:'RSI Apollo Triage', fresh:false})")
    pg.wait_for_timeout(500)
    assert body_bg() == "rgb(23, 29, 32)", "RSI colors must apply"
    assert "polygon" in button_radius("SELF DESTRUCT"), "RSI manufacturer theme: chamfered buttons"

    # model theme on top of the manufacturer: Constellation is round again
    pg.evaluate("window.__fire({type:'vehicle-changed', vehicleId:'RSI_Constellation_Andromeda:P', vehicleClass:'RSI_Constellation_Andromeda', shipName:'RSI Constellation Andromeda', fresh:false})")
    pg.wait_for_timeout(500)
    assert body_bg() == "rgb(21, 22, 27)", "RSI_Constellation colors must apply"
    assert "polygon" not in button_radius("SELF DESTRUCT"), "RSI_Constellation model theme: round buttons"
    pg.evaluate("window.__fire({type:'vehicle-left', vehicleId:'RSI_Constellation_Andromeda:P'})")
    pg.wait_for_timeout(300)
    pg.evaluate("window.__fire({type:'vehicle-changed', vehicleId:'RSI_Apollo_Triage:P', vehicleClass:'RSI_Apollo_Triage', shipName:'RSI Apollo Triage', fresh:false})")
    pg.wait_for_timeout(500)

    pg.evaluate("window.__fire({type:'vehicle-left', vehicleId:'RSI_Apollo_Triage:P'})")
    pg.wait_for_timeout(500)
    assert body_bg() == default_bg, "leaving the ship must restore the default look"
    assert button_radius("SELF DESTRUCT") == default_btn

    # Logo watermark: only with a ship, picked by prefix from
    # src/themes/assets (gitignored - without the files: no logo, no crash)
    assert pg.locator("[data-logo]").count() == 0, "default look has no logo"
    pg.evaluate("window.__fire({type:'vehicle-changed', vehicleId:'ORIG_400i:P', vehicleClass:'ORIG_400i', shipName:'Origin 400i', fresh:false})")
    pg.wait_for_timeout(300)
    if os.path.exists("src/themes/assets/ORIG.svg"):
        mask = pg.evaluate("getComputedStyle(document.querySelector('[data-logo]')).maskImage")
        assert mask.startswith('url("data:image/svg+xml'), f"logo must be an inlined mask, got {mask[:60]}"
        # one logo per panel, centered in it
        offsets = pg.evaluate("""[...document.querySelectorAll('[data-logo]')].map(l => {
            const a = l.getBoundingClientRect(), b = l.parentElement.getBoundingClientRect();
            return [Math.abs((a.left + a.right) - (b.left + b.right)) / 2,
                    Math.abs((a.top + a.bottom) - (b.top + b.bottom)) / 2];
        })""")
        panels = pg.evaluate("document.querySelector('[data-logo]').parentElement.parentElement.children.length")
        assert len(offsets) == panels, f"expected one logo per panel, got {len(offsets)} for {panels}"
        assert all(dx < 1 and dy < 1 for dx, dy in offsets), f"logos must be centered: {offsets}"
    else:
        assert pg.locator("[data-logo]").count() == 0
    pg.evaluate("window.__fire({type:'vehicle-left', vehicleId:'ORIG_400i:P'})")
    pg.wait_for_timeout(300)
    assert pg.locator("[data-logo]").count() == 0, "logo disappears with the ship"

    # The dev theme picker must not ship in production builds
    assert pg.get_by_text("DEV THEME", exact=False).count() == 0

    # Watcher status: missing log file is surfaced
    pg.evaluate("window.__fire({type:'gamelog-status', state:'missing', path:'X'})")
    pg.wait_for_timeout(200)
    assert pg.get_by_text("GAME.LOG NOT FOUND").count() > 0

    assert not errors, f"JS errors: {errors}"
    print("✓ game events: reset, per-ship restore, destruction, leave/re-board, fresh, status bar, ship themes")

    # ---- Persistence: snapshot restore after an app restart ----
    # The mock replays the log the moment the renderer subscribes, while
    # getDeckState is still pending -> events must be queued, the snapshot
    # applied first, and replayed events up to its cursor skipped.
    S = "2026-09-28T18:29:21.844Z"
    snapshot = {
        "version": 1,
        "cursor": {"session": S, "line": 42},
        "currentVehicleId": "ORIG_M80:P",
        "currentVehicleClass": "ORIG_M80",
        "currentVehicleName": "Origin M80",
        "toggleStates": {"ovrclk": True},
        "vehicleMemory": {"AEGS_Sabre:P": {"ovrclk": True}},
    }
    m80 = "{type:'vehicle-changed', vehicleId:'ORIG_M80:P', vehicleClass:'ORIG_M80', shipName:'Origin M80', fresh:%s, session:'%s', line:%d}"

    def restart_app(session_of_log):
        page = b.new_page(viewport={"width": 2560, "height": 720})
        page.add_init_script(f"""
          window.__gameListeners = [];
          window.__saved = [];
          window.scDeck = {{
            getConfig: async () => ({{ ok: true, path: "/mock", config: {json.dumps(config)}, warnings: [] }}),
            sendHotkey: async (k) => ({{ ok: true }}),
            quitApp: async () => {{}},
            onConfigChanged: (cb) => () => {{}},
            getDeckState: () => new Promise(r => setTimeout(() => r({json.dumps(snapshot)}), 300)),
            saveDeckState: async (s) => {{ window.__saved.push(s); return {{ ok: true }}; }},
            onGameEvent: (cb) => {{
              window.__gameListeners.push(cb);
              [{(m80 % ("true", session_of_log, 5))}].forEach(cb);
              return () => {{}};
            }}
          }};
          window.__fire = (e) => window.__gameListeners.forEach(cb => cb(e));
        """)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto("http://127.0.0.1:8126/")
        page.wait_for_timeout(1200)
        return page

    pg2 = restart_app(S)
    on2 = lambda: pg2.locator('label:has-text("OVRCLK") input[type=checkbox]').is_checked()
    assert on2(), "snapshot toggles restored; replayed fresh boarding (before cursor) skipped"
    assert pg2.evaluate("getComputedStyle(document.body).backgroundColor") != "rgb(6, 9, 15)", \
        "restored ship must select its theme"

    # new events after the cursor apply normally: leave -> initial, re-board -> restore
    pg2.evaluate(f"window.__fire({{type:'vehicle-left', vehicleId:'ORIG_M80:P', session:'{S}', line:50}})")
    pg2.wait_for_timeout(200)
    assert not on2(), "leaving after the cursor falls back to initial"
    pg2.evaluate(f"window.__fire({m80 % ('false', S, 51)})")
    pg2.wait_for_timeout(200)
    assert on2(), "re-boarding restores the remembered M80 state"

    # a second replay (watcher restart on config reload) changes nothing
    pg2.evaluate(f"window.__fire({m80 % ('true', S, 5)})")
    pg2.evaluate(f"window.__fire({{type:'vehicle-left', vehicleId:'ORIG_M80:P', session:'{S}', line:50}})")
    pg2.wait_for_timeout(200)
    assert on2(), "replayed events of the same session must be skipped"

    # debounced save carries the new cursor and the remembered memory
    pg2.wait_for_timeout(600)
    saved = pg2.evaluate("window.__saved[window.__saved.length - 1]")
    assert saved["cursor"] == {"session": S, "line": 51}, saved["cursor"]
    assert saved["currentVehicleId"] == "ORIG_M80:P"
    assert saved["toggleStates"]["ovrclk"] is True
    assert saved["vehicleMemory"]["AEGS_Sabre:P"] == {"ovrclk": True}
    pg2.close()

    # Snapshot of an older game session (game restarted meanwhile): ignored
    pg3 = restart_app("2026-09-29T09:00:00.000Z")
    assert not pg3.locator('label:has-text("OVRCLK") input[type=checkbox]').is_checked(), \
        "a snapshot from another session must not be restored"
    pg3.close()

    assert not errors, f"JS errors: {errors}"
    print("✓ persistence: queued replay, snapshot restore, cursor skip, debounced save, stale session")
    b.close()
srv.shutdown()
print("GAMELOG RENDER TEST OK")
