"""UI render test (headless): python3 test/render.test.py
Expects a finished build in dist/ (npm run build)."""
import json, http.server, threading, functools, os

os.chdir(os.path.join(os.path.dirname(__file__), ".."))
from playwright.sync_api import sync_playwright

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory="dist")
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8123), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

config = json.load(open("config.json"))
# the user's config may have input listening on (testing) - the happy path
# runs without it; the input tests below set their own
config.pop("input", None)

def mock(page, result):
    page.add_init_script(f"""
      window.scDeck = {{
        getConfig: async () => ({json.dumps(result)}),
        sendHotkey: async (keys, holdMs) => {{ window.__lastKeys = keys; window.__lastHold = holdMs; return {{ ok: true }}; }},
        quitApp: async () => {{ window.__quit = true; }}
      }};
    """)

with sync_playwright() as p:
    browser = p.chromium.launch()

    # --- Happy path ---
    page = browser.new_page(viewport={"width": 2560, "height": 720})
    mock(page, {"ok": True, "path": "/mock/config.json", "config": config, "warnings": []})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("http://127.0.0.1:8123/")
    page.wait_for_timeout(1200)

    assert page.get_by_text("SAFETIES").count() > 0, "panel SAFETIES missing"
    # Toggles fire on RELEASE (tap) since the long-press correction was
    # added - a bare pointerdown must NOT trigger anymore.
    ovr_label = page.locator('label:has-text("OVRCLK")')
    ovr_label.dispatch_event("pointerdown")
    page.wait_for_timeout(150)
    assert page.evaluate("window.__lastKeys") is None, "pointerdown alone must not send"
    ovr_label.dispatch_event("pointerup")
    page.wait_for_timeout(200)
    assert page.evaluate("window.__lastKeys") == ["F7"], "toggle sends wrong keys"

    # Long press on the toggle = manual state correction: flips the local
    # assumed state WITHOUT sending keys (drift correction, e.g. after a
    # ship power-off). OVRCLK is ON after the tap above -> hold flips OFF.
    ovrclk = page.locator('label:has-text("OVRCLK") input[type=checkbox]')
    assert ovrclk.is_checked(), "OVRCLK should be on after the tap above"
    page.evaluate("window.__lastKeys = null")
    ovr_label.dispatch_event("pointerdown")
    page.wait_for_timeout(800)  # held past the 600ms threshold
    assert not ovrclk.is_checked(), "long press did not flip the state"
    assert page.evaluate("window.__lastKeys") is None, "correction must not send keys"
    ovr_label.dispatch_event("pointerup")  # release after hold = no-op
    page.wait_for_timeout(200)
    assert not ovrclk.is_checked(), "release after hold must not tap-toggle"
    assert page.evaluate("window.__lastKeys") is None, "release after hold must not send"
    assert page.get_by_text("MANUAL: OVRCLK").count() > 0, "status bar misses manual correction"
    # Flip it back ON via long press so the reset test below still starts
    # from the same state as before this feature existed.
    ovr_label.dispatch_event("pointerdown")
    page.wait_for_timeout(800)
    ovr_label.dispatch_event("pointerup")
    print("✓ toggle ok (tap on release, long press corrects without keys)")

    # Reset button (far left): OVRCLK was just toggled on (initial: false).
    # Guarded by LONG PRESS: a short tap must do nothing; holding >600ms
    # resets to the initial state WITHOUT sending keys.
    ovrclk = page.locator('label:has-text("OVRCLK") input[type=checkbox]')
    assert ovrclk.is_checked(), "OVRCLK should be on after the toggle above"
    page.evaluate("window.__lastKeys = null")
    reset_btn = page.locator('[aria-label="Reset toggles"]')
    reset_btn.dispatch_event("pointerdown")
    page.wait_for_timeout(200)
    reset_btn.dispatch_event("pointerup")  # released too early
    page.wait_for_timeout(600)
    assert ovrclk.is_checked(), "short tap must NOT reset"
    reset_btn.dispatch_event("pointerdown")
    page.wait_for_timeout(800)  # held past the 600ms threshold
    assert not ovrclk.is_checked(), "long press did not restore initial state"
    assert page.evaluate("window.__lastKeys") is None, "reset must not send keys"
    print("✓ reset button ok (long press resets, short tap ignored, no keys sent)")

    page.locator('[aria-label="Next page"]').dispatch_event("pointerdown")
    page.wait_for_timeout(300)
    assert page.get_by_text("IFCS").count() > 0, "page switching broken"

    # POWER page (last): column layout + buttons with "hold".
    # Tap = +1 (normal short press, sent on release), hold = MAX (same key,
    # held down long so SC's hold activation fires).
    for _ in range(len(config["pages"]) - 2):
        page.locator('[aria-label="Next page"]').dispatch_event("pointerdown")
        page.wait_for_timeout(300)
    assert page.get_by_text("POWER MANAGEMENT").count() > 0, "power page missing"
    wpn_up = page.get_by_text("HOLD: MAX").first.locator("..")
    page.evaluate("window.__lastKeys = null")
    wpn_up.dispatch_event("pointerdown")
    page.wait_for_timeout(150)
    assert page.evaluate("window.__lastKeys") is None, "hold button must not fire on pointerdown"
    wpn_up.dispatch_event("pointerup")
    page.wait_for_timeout(200)
    assert page.evaluate("window.__lastKeys") == ["F5"], "tap sends wrong keys"
    assert page.evaluate("window.__lastHold") is None, "tap must use the default hold"
    page.evaluate("window.__lastKeys = null")
    wpn_up.dispatch_event("pointerdown")
    page.wait_for_timeout(800)  # past the 600ms deck threshold
    assert page.evaluate("window.__lastKeys") == ["F5"], "hold sends wrong keys"
    assert page.evaluate("window.__lastHold") == 800, "hold must send the long key hold"
    page.evaluate("window.__lastKeys = null")
    wpn_up.dispatch_event("pointerup")  # release after hold = no-op
    page.wait_for_timeout(200)
    assert page.evaluate("window.__lastKeys") is None, "release after hold must not tap"
    # columns: +1 above -1 above the WPN toggle, same x
    boxes = [page.get_by_text(t).first.bounding_box() for t in ("HOLD: MAX", "HOLD: MIN")]
    boxes.append(page.locator('label:has-text("WPN")').first.bounding_box())
    cx = [b["x"] + b["width"] / 2 for b in boxes]
    assert max(cx) - min(cx) < 2 and boxes[0]["y"] < boxes[1]["y"] < boxes[2]["y"], f"power column layout broken: {boxes}"
    print("✓ power page ok (column layout, tap = +1, hold = long key hold)")

    # Quit is long-press guarded too: short tap must not quit
    quit_btn = page.locator('[aria-label="Quit app"]')
    quit_btn.dispatch_event("pointerdown")
    page.wait_for_timeout(200)
    quit_btn.dispatch_event("pointerup")
    page.wait_for_timeout(600)
    assert page.evaluate("window.__quit") is None, "short tap must NOT quit"
    quit_btn.dispatch_event("pointerdown")
    page.wait_for_timeout(800)
    assert page.evaluate("window.__quit") == True, "quit button does not call quit"
    assert not errors, f"JS errors: {errors}"
    print("✓ happy path ok (panels, toggle, navigation, quit button)")

    # --- Input debug line (Phase B): keyboard hook events via the bridge,
    # joystick buttons via a mocked Gamepad API ---
    page3 = browser.new_page(viewport={"width": 2560, "height": 720})
    cfg3 = dict(config, input={"keyboard": True, "joystick": True, "debug": True})
    page3.add_init_script(f"""
      window.__inputListeners = [];
      window.__pads = [null, null, null, null];
      navigator.getGamepads = () => window.__pads;
      window.scDeck = {{
        getConfig: async () => ({json.dumps({"ok": True, "path": "/mock", "config": cfg3, "warnings": []})}),
        sendHotkey: async () => ({{ ok: true }}),
        quitApp: async () => {{}},
        onInputEvent: (cb) => {{ window.__inputListeners.push(cb); return () => {{}}; }}
      }};
      window.__input = (e) => window.__inputListeners.forEach(cb => cb(e));
      window.__pad = (pressed) => {{ window.__pads[1] = {{ index: 1,
        id: "VKBsim Gladiator EVO  R  (Vendor: 231d Product: 0200)",
        buttons: pressed.map(p => ({{ pressed: p }})) }}; }};
    """)
    page3.goto("http://127.0.0.1:8123/")
    page3.wait_for_timeout(1200)
    dbg = page3.locator("[data-input-debug]")
    assert "JS: NONE" in dbg.inner_text(), dbg.inner_text()
    page3.evaluate("window.__input({type:'input-status', source:'keyboard', state:'running'})")
    page3.evaluate("window.__input({type:'input', source:'keyboard', key:'F5', down:true, injected:false})")
    page3.evaluate("window.__pad(Array.from({length: 16}, (_, i) => i === 12))")
    page3.wait_for_timeout(200)
    text = dbg.inner_text()
    assert "KB: RUNNING" in text, text
    assert "1=VKBsim Gladiator EVO R [16]" in text, text  # inner_text collapses spaces
    assert "JS1 VKBsim Gladiator EVO R B13↓" in text, text  # 1-based like SC's js_button13
    assert "KB F5↓" in text, text
    # without "debug" the line stays hidden (main page above)
    assert page.locator("[data-input-debug]").count() == 0, "debug line must be opt-in"
    print("✓ input debug ok (hook status, key + joystick button events, opt-in)")

    # --- Phase C: physical inputs -> SC actions -> power toggles ---
    # Bindings as main sends them (resolved from the real actionmaps.xml in
    # test/actionmaps.test.js); no Game.log in this mock = inputs always count.
    js2 = lambda b: {"kind": "js", "product": "3201", "vendor": "231d", "button": b}
    bindings = {"type": "input-bindings", "path": "/mock/actionmaps.xml", "state": "loaded", "warnings": [],
                "bindings": {
                    "v_power_toggle": [{"kind": "kb", "keys": ["U"]}, js2(11)],
                    "v_power_toggle_weapons": [{"kind": "kb", "keys": ["P"]}, js2(14)],
                    "v_power_toggle_thrusters": [{"kind": "kb", "keys": ["I"]}, js2(13)],
                    "v_power_toggle_shields": [{"kind": "kb", "keys": ["O"]}, js2(12)],
                    "v_flightready": [{"kind": "kb", "keys": ["RightAlt", "R"]}, js2(28)]}}
    page3.evaluate(f"window.__input({json.dumps(bindings)})")
    page3.locator('[aria-label="Previous page"]').dispatch_event("pointerdown")  # wraps to POWER
    page3.wait_for_timeout(300)
    assert page3.get_by_text("POWER MANAGEMENT").count() > 0, "power page missing"
    sw = lambda label: page3.locator(f'label:has-text("{label}") input[type=checkbox]').first
    power = ["POWER", "WPN", "THR", "SHLD"]
    assert not any(sw(l).is_checked() for l in power), "power must start OFF (parked ship)"
    assert "MAP: LOADED" in dbg.inner_text(), dbg.inner_text()

    key = lambda k, down=True: page3.evaluate(
        f"window.__input({{type:'input', source:'keyboard', key:'{k}', down:{str(down).lower()}, injected:false}})")
    key("P"); key("P", False)
    page3.wait_for_timeout(150)
    assert sw("WPN").is_checked(), "physical P must flip WPN"
    assert "→ v_power_toggle_weapons" in dbg.inner_text(), dbg.inner_text()
    assert page3.get_by_text("INPUT: WPN → ON").count() > 0, "status bar misses the input change"
    key("LeftAlt"); key("P"); key("P", False); key("LeftAlt", False)
    page3.wait_for_timeout(150)
    assert sw("WPN").is_checked(), "LeftAlt+P is not the WPN bind"

    # flight ready on the left stick (js2_button28): everything on
    page3.evaluate("""window.__pads[0] = { index: 0, id: "VKBsim Gladiator EVO OT L (Vendor: 231d Product: 3201)",
      buttons: Array.from({length: 32}, (_, i) => ({ pressed: i === 27 })) }""")
    page3.wait_for_timeout(150)
    assert all(sw(l).is_checked() for l in power), "flight ready must switch all power on"
    # deck tap on POWER (v_power_toggle): only the master switch flips
    page3.locator('label:has-text("POWER")').first.dispatch_event("pointerdown")
    page3.locator('label:has-text("POWER")').first.dispatch_event("pointerup")
    page3.wait_for_timeout(200)
    assert not sw("POWER").is_checked() and all(sw(l).is_checked() for l in power[1:]), \
        "master power must leave the subsystems alone"
    print("✓ input actions ok (keyboard + joystick binds, exact modifiers, flight ready, start OFF)")

    # With Game.log tracking: inputs only count while in a ship (P on foot
    # must not flip WPN)
    page4 = browser.new_page(viewport={"width": 2560, "height": 720})
    page4.add_init_script(f"""
      window.__in = []; window.__game = [];
      window.scDeck = {{
        getConfig: async () => ({json.dumps({"ok": True, "path": "/mock", "config": cfg3, "warnings": []})}),
        getInputBindings: async () => ({json.dumps(bindings)}),
        sendHotkey: async () => ({{ ok: true }}),
        quitApp: async () => {{}},
        onInputEvent: (cb) => {{ window.__in.push(cb); return () => {{}}; }},
        onGameEvent: (cb) => {{ window.__game.push(cb); return () => {{}}; }}
      }};
      window.__input = (e) => window.__in.forEach(cb => cb(e));
      window.__fire = (e) => window.__game.forEach(cb => cb(e));
    """)
    page4.goto("http://127.0.0.1:8123/")
    page4.wait_for_timeout(1200)
    page4.locator('[aria-label="Previous page"]').dispatch_event("pointerdown")
    page4.wait_for_timeout(300)
    wpn4 = page4.locator('label:has-text("WPN") input[type=checkbox]').first
    press_p = "window.__input({type:'input', source:'keyboard', key:'P', down:true}); window.__input({type:'input', source:'keyboard', key:'P', down:false})"
    page4.evaluate("window.__fire({type:'gamelog-status', state:'watching'})")
    page4.evaluate(press_p)
    page4.wait_for_timeout(150)
    assert not wpn4.is_checked(), "on foot (Game.log active, no ship) P must not flip WPN"
    assert "MAP: LOADED" in page4.locator("[data-input-debug]").inner_text(), "bindings via getInputBindings"
    page4.evaluate("window.__fire({type:'vehicle-changed', vehicleId:'AEGS_Gladius:me', vehicleClass:'AEGS_Gladius'})")
    page4.evaluate(press_p)
    page4.wait_for_timeout(150)
    assert wpn4.is_checked(), "in a ship P must flip WPN"
    print("✓ input actions only count in a ship when Game.log is tracked")

    # --- Error case: broken config ---
    page2 = browser.new_page(viewport={"width": 2560, "height": 720})
    mock(page2, {"ok": False, "path": "C:/Users/x/AppData/sc-deck/config.json",
                 "errors": ["JSON error: Unexpected token } in JSON at position 123"]})
    page2.goto("http://127.0.0.1:8123/")
    page2.wait_for_timeout(1200)
    assert page2.get_by_text("CONFIG ERROR").count() > 0, "error screen missing"
    assert page2.get_by_text("JSON error", exact=False).count() > 0, "error message missing"
    assert page2.get_by_text("RELOAD").count() > 0, "reload button missing"
    print("✓ error screen ok (message, path, reload button)")

    browser.close()
srv.shutdown()
print("ALL RENDER TESTS OK")
