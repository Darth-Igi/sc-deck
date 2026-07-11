"""UI-Render-Test (headless): python3 test/render.test.py
Erwartet einen fertigen Build in dist/ (npm run build)."""
import json, http.server, threading, functools, sys, os

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

    # --- Happy Path ---
    page = browser.new_page(viewport={"width": 2560, "height": 720})
    mock(page, {"ok": True, "path": "/mock/config.json", "config": config, "warnings": []})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("http://127.0.0.1:8123/")
    page.wait_for_timeout(1200)

    assert page.get_by_text("SAFETIES").count() > 0, "Panel SAFETIES fehlt"
    ovr = page.get_by_text("OVRCLK", exact=True)
    ovr.dispatch_event("pointerdown")
    page.wait_for_timeout(200)
    assert page.evaluate("window.__lastKeys") == ["F7"], "Toggle sendet falsche Tasten"

    page.locator('[aria-label="Nächste Seite"]').dispatch_event("pointerdown")
    page.wait_for_timeout(300)
    assert page.get_by_text("IFCS").count() > 0, "Seitenwechsel kaputt"

    page.locator('[aria-label="App beenden"]').dispatch_event("pointerdown")
    page.wait_for_timeout(200)
    assert page.evaluate("window.__quit") == True, "Exit-Button ruft quit nicht"
    assert not errors, f"JS-Fehler: {errors}"
    page.screenshot(path="/tmp/render_ok.png")
    print("✓ Happy Path ok (Panels, Toggle, Navigation, Exit-Button)")

    # --- Fehlerfall: kaputte Config ---
    page2 = browser.new_page(viewport={"width": 2560, "height": 720})
    mock(page2, {"ok": False, "path": "C:/Users/x/AppData/sc-deck/config.json",
                 "errors": ["JSON-Fehler: Unexpected token } in JSON at position 123"]})
    page2.goto("http://127.0.0.1:8123/")
    page2.wait_for_timeout(1200)
    assert page2.get_by_text("CONFIG-FEHLER").count() > 0, "Fehlerscreen fehlt"
    assert page2.get_by_text("JSON-Fehler", exact=False).count() > 0, "Fehlermeldung fehlt"
    assert page2.get_by_text("NEU LADEN").count() > 0, "Reload-Button fehlt"
    page2.screenshot(path="/tmp/render_error.png")
    print("✓ Fehlerscreen ok (Meldung, Pfad, Neu-Laden-Button)")

    browser.close()
srv.shutdown()
print("ALLE RENDER-TESTS OK")
