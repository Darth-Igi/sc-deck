"""UI render test (headless): python3 test/render.test.py
Expects a finished build in dist/ (npm run build)."""
import json, http.server, threading, functools, os

os.chdir(os.path.join(os.path.dirname(__file__), ".."))
from playwright.sync_api import sync_playwright

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory="dist")
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8123), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

config = json.load(open("config.json"))

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
