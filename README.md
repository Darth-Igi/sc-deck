# SC Deck v2.1 – Cockpit-Panels (React + Zustand + MUI)

## Setup

```bash
npm install
npm run dev     # Entwicklung mit Hot Reload
npm start       # baut + startet die fertige App
npm test        # Unit-Tests der Config-Validierung
```

## App beenden

Da das Fenster bewusst nicht fokussierbar ist (kein Fokus-Diebstahl vom
Spiel), funktioniert Alt+F4 nicht. Stattdessen:

- **Ctrl+Alt+Q** (globaler Shortcut, funktioniert auch wenn das Spiel den
  Fokus hat), oder
- der rote **⏻**-Button oben rechts auf dem Touchscreen.

## Wo liegt die Config?

Beim ersten Start wird die mitgelieferte `config.json` nach
`%APPDATA%/sc-deck/config.json` (Electron `userData`) kopiert – **dort**
wird ab dann editiert. Grund: Nach einem Packaging als .exe ist das
Programmverzeichnis read-only; die Nutzer-Config muss davon getrennt leben.
Der genaue Pfad steht im Fehlerbildschirm bzw. lässt sich per
`Ctrl+Alt+Q`-Neustart nach Änderungen neu laden (oder Button „NEU LADEN").

## Config-Schema: Pages → Panels → Widgets

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

- **`button`** – Momentan-Taste. **`toggle`** – merkt sich lokalen
  An/Aus-Zustand (nur Vermutung, das Spiel meldet nichts zurück).
- `accent` (Widget): eigene Akzentfarbe, z.B. `"#ff4d4d"`.
- `columns` (Panel): Spalten des Widget-Rasters; bestimmt zugleich die
  relative Panelbreite auf der Seite.

Die Config wird beim Laden **validiert** (Struktur, Tastennamen gegen das
nut.js-Key-Enum, doppelte IDs). Fehler erscheinen als Bildschirmmeldung mit
Dateipfad – nicht erst beim Tastendruck im Spiel.

## Robustheit

- Tastenversand läuft durch eine **Queue**: gleichzeitige Taps können sich
  nicht zu falschen Kombinationen verschränken (z.B. Ctrl+T + Alt+C ≠ Ctrl+Alt+T).
- Monitor-Hotplug: wird das Xeneon Edge nachträglich angesteckt, zieht das
  Fenster automatisch um.
- Fehler beim Tastenversand erscheinen in der Statuszeile unten (auf dem
  Edge gibt es im Vollbild keine Konsole).

## Administratorrechte

Läuft Star Citizen/Launcher erhöht, muss SC Deck ebenfalls als Administrator
gestartet werden (Windows UIPI), sonst kommen die Tasten nicht an.

## Tests

- `npm test` – Unit-Tests der Config-Validierung (Node, kein Framework).
- `npm run test:ui` – Headless-Render-Test (benötigt Python + Playwright):
  prüft Rendering, Toggle-Versand, Seitennavigation, Exit-Button und den
  Config-Fehlerbildschirm.

## Nächste Ausbaustufen

- Power-Dreieck / Slider mit gekoppelten Werten als eigenes Widget
- Formular-Editiermodus in der App statt JSON-Handbearbeitung
- Long-Press auf Toggle: Zustand korrigieren ohne Taste zu senden
