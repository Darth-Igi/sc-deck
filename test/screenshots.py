"""Screenshot helper (not part of test:ui): renders every page of config.json
from dist/ with a mocked window.scDeck bridge and saves PNGs.

  python test/screenshots.py <outdir> [vehicleClass ...]

Without vehicleClass: default look only. Each given vehicleClass (e.g.
MISC_Starlancer_TAC, RSI_Apollo_Medivac) is boarded via a fake
vehicle-changed event and captured as well. Used for pixel comparisons
before/after refactorings and for designing ship themes.
Requires a fresh `npm run build`."""
import json, http.server, threading, functools, os, sys

os.chdir(os.path.join(os.path.dirname(__file__), ".."))
from playwright.sync_api import sync_playwright

outdir = sys.argv[1] if len(sys.argv) > 1 else "screenshots"
ships = sys.argv[2:]
os.makedirs(outdir, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory="dist")
handler.log_message = lambda *a, **k: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8127), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

config = json.load(open("config.json", encoding="utf-8"))
EXEC = os.environ.get("SCDECK_CHROMIUM")


def tap(pg, label):
    loc = pg.locator(f'label:has-text("{label}")').first
    loc.dispatch_event("pointerdown")
    pg.wait_for_timeout(60)
    loc.dispatch_event("pointerup")
    pg.wait_for_timeout(250)


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
    pg.goto("http://127.0.0.1:8127/")
    pg.wait_for_timeout(1200)

    first_toggle = next(
        w["label"] for pn in config["pages"][0]["panels"] for w in pn["widgets"]
        if w["type"] == "toggle"
    )

    def capture(prefix):
        # cycles through all pages via "next" and ends up on page 1 again
        for i in range(len(config["pages"])):
            pg.wait_for_timeout(450)  # theme transitions settle
            pg.screenshot(path=os.path.join(outdir, f"{prefix}_page{i + 1}.png"))
            pg.locator('[aria-label="Next page"]').dispatch_event("pointerdown")
            pg.wait_for_timeout(250)
        # page 1 again with the first toggle flipped (both toggle looks)
        tap(pg, first_toggle)
        pg.wait_for_timeout(450)
        pg.screenshot(path=os.path.join(outdir, f"{prefix}_page1_toggled.png"))
        tap(pg, first_toggle)

    capture("default")
    for cls in ships:
        name = cls.replace("_", " ")
        pg.evaluate(
            "window.__fire({type:'vehicle-changed', vehicleId:%s, vehicleClass:%s, shipName:%s, fresh:true})"
            % (json.dumps(cls + ":P"), json.dumps(cls), json.dumps(name))
        )
        pg.wait_for_timeout(600)
        capture(cls)
        pg.evaluate("window.__fire({type:'vehicle-left', vehicleId:%s})" % json.dumps(cls + ":P"))
        pg.wait_for_timeout(300)

    b.close()
srv.shutdown()
print(f"screenshots written to {outdir}")
