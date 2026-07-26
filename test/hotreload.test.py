"""Tests the config hot-reload path in the renderer:
config-changed event -> UI loads the new config, keeps page + toggle state."""
import json, http.server, threading, functools, os

os.chdir(os.path.join(os.path.dirname(__file__), ".."))
from playwright.sync_api import sync_playwright

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory="dist")
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8125), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

config = json.load(open("config.json"))
# Second version: new widget in SAFETIES, rest unchanged
config2 = json.loads(json.dumps(config))
config2["pages"][0]["panels"][0]["widgets"].append(
    {"type": "button", "id": "new-btn", "label": "NEW", "keys": ["K"]}
)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 2560, "height": 720})
    pg.add_init_script(f"""
      window.__configs = [{json.dumps(config)}, {json.dumps(config2)}];
      window.__configIdx = 0;
      window.__listeners = [];
      window.scDeck = {{
        getConfig: async () => ({{ ok: true, path: "/mock", config: window.__configs[window.__configIdx], warnings: [] }}),
        sendHotkey: async (k) => ({{ ok: true }}),
        quitApp: async () => {{}},
        onConfigChanged: (cb) => {{ window.__listeners.push(cb); return () => {{}}; }}
      }};
    """)
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto("http://127.0.0.1:8125/")
    pg.wait_for_timeout(1200)

    # Turn on the OVRCLK toggle (initially false) and go to page 2
    pg.locator('label:has-text("OVRCLK")').dispatch_event("pointerdown")
    pg.wait_for_timeout(80)
    pg.locator('label:has-text("OVRCLK")').dispatch_event("pointerup")
    pg.wait_for_timeout(200)
    pg.locator('[aria-label="Next page"]').dispatch_event("pointerdown")
    pg.wait_for_timeout(300)
    assert pg.get_by_text("IFCS").count() > 0

    # Simulate a config change
    pg.evaluate("window.__configIdx = 1; window.__listeners.forEach(cb => cb());")
    pg.wait_for_timeout(500)

    # Expectation: still on page 2 (no reset)
    assert pg.get_by_text("IFCS").count() > 0, "hot reload reset the page"

    # Back to page 1: new widget present, OVRCLK state preserved (ON)
    pg.locator('[aria-label="Previous page"]').dispatch_event("pointerdown")
    pg.wait_for_timeout(300)
    assert pg.get_by_text("NEW", exact=True).count() > 0, "new widget missing after hot reload"
    # ToggleWidget is a MUI Switch now: assert the checked state directly
    assert pg.locator('label:has-text("OVRCLK") input[type=checkbox]').is_checked(), \
        "OVRCLK toggle state lost during hot reload"

    assert not errors, f"JS errors: {errors}"
    print("✓ hot reload: config applied, page and toggle state preserved")
    b.close()
srv.shutdown()
print("HOT RELOAD TEST OK")
