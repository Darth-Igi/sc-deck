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
        sendHotkey: async (keys) => {{ window.__lastKeys = keys; return {{ ok: true }}; }},
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
    ovr = page.get_by_text("OVRCLK", exact=True)
    ovr.dispatch_event("pointerdown")
    page.wait_for_timeout(200)
    assert page.evaluate("window.__lastKeys") == ["F7"], "toggle sends wrong keys"

    page.locator('[aria-label="Next page"]').dispatch_event("pointerdown")
    page.wait_for_timeout(300)
    assert page.get_by_text("IFCS").count() > 0, "page switching broken"

    page.locator('[aria-label="Quit app"]').dispatch_event("pointerdown")
    page.wait_for_timeout(200)
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
