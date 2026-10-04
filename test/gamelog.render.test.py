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

    # The dev theme picker must not ship in production builds
    assert pg.get_by_text("DEV THEME", exact=False).count() == 0

    # Watcher status: missing log file is surfaced
    pg.evaluate("window.__fire({type:'gamelog-status', state:'missing', path:'X'})")
    pg.wait_for_timeout(200)
    assert pg.get_by_text("GAME.LOG NOT FOUND").count() > 0

    assert not errors, f"JS errors: {errors}"
    print("✓ game events: reset, per-ship restore, destruction, leave/re-board, fresh, status bar, ship themes")
    b.close()
srv.shutdown()
print("GAMELOG RENDER TEST OK")
