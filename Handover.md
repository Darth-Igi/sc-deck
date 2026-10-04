# SC Deck – Projekt-Handoff

Stand: v2.11 (Ship-Themes für Aegis, Anvil, Crusader, Drake, Kruger,
Origin 400i/M80, RSI Aurora/Constellation; davor v2.10: Schiffserkennung über den Schiffs-Chatkanal + Ship-Themes:
eigenes Styling pro Schiffsmodell mit Hersteller-Fallback). Dieses Dokument
fasst zusammen, was gebaut wurde und warum, damit eine andere KI/Person ohne
Chatverlauf weiterarbeiten kann.

## 1. Ziel

Ein eigenes, frei gestaltbares Touch-Interface für das **CORSAIR XENEON
EDGE** (14,5″ Zusatzdisplay, 2560×720, wird von Windows als normaler
zweiter Monitor erkannt), das beim Antippen von Buttons **Tastenkombinationen
ans System sendet** – primärer Anwendungsfall: **Star Citizen** (Shortcuts,
kein Maus-Makro-Bedarf). Die Oberfläche bildet die Cockpit-Panels des
Spiels nach (gruppierte Panels mit Rahmen/Titel, Toggle-Schalter,
Seitennavigation). Lokal vermutete Toggle-Zustände werden über
**Game.log-Events** automatisch zurückgesetzt bzw. je Schiff
wiederhergestellt (seit v2.4) und können seit v2.9 zusätzlich per
**Long-Press am Widget manuell korrigiert** werden – ohne Tastenversand.
Seit v2.10 passt sich zudem die **komplette Optik dem aktuellen Schiff an**
(Ship-Themes, Abschnitt 7) – z. B. MISC gold/türkis/rund, RSI Apollo
weiß/orange mit abgeschrägten Ecken; ohne Schiff gilt der cyanfarbene
Default-Look.

## 2. Tech-Stack & Architektur

- **Electron** (Main-Prozess: Fenster, Monitor-Erkennung, Tastenversand,
  Config-Handling, Game.log-Watcher) + **React 18 + Vite** (Renderer) +
  **Zustand** (State) + **MUI** (Komponenten/Theme).
- **Tastenversand seit v2.8/v2.9 über eigenen Scancode-Sender**
  (`scancodeSender.js`): direkter `SendInput`-Aufruf mit
  `KEYEVENTF_SCANCODE` per **koffi** (FFI, N-API-Prebuilds, kein Compiler
  nötig). Das frühere `@nut-tree-fork/nut-js` ist **komplett entfernt** –
  Hintergrund in Abschnitt 5.
- Struktur: **`config.json`** → optionaler Abschnitt `gamelog` +
  `pages[]` → `panels[]` → `widgets[]`. Zwei Widget-Typen: `button`
  (Momentan-Taste) und `toggle` (merkt sich lokalen On/Off-Zustand,
  rein optisch/vermutet – das Spiel meldet nichts zurück).
  **Key-Namen im nut-js-Schema** (`LeftControl`, `RightAlt`, `F5`, `Num0`,
  `NumPad0` …) – bewusst beibehalten, damit bestehende Configs beim
  nut.js-Ausbau nicht brechen; per Test gepinnt.

### Dateien
```
sc-deck/
├── main.js                Electron Main-Prozess (siehe Abschnitt 4)
├── preload.js             contextBridge: getConfig, sendHotkey, quitApp,
│                          onConfigChanged, onGameEvent
├── scancodeSender.js      NEU v2.8: Scancode-Tabelle (Set 1) + SendInput
│                          via koffi; pure Teile (Mapping, Event-Sequenz)
│                          Electron-frei und unit-getestet (Abschnitt 5)
├── configValidation.js    Reines Node-Modul, prüft config.json inkl.
│                          gamelog-Abschnitt; Key-Namen werden gegen die
│                          Scancode-Tabelle validiert (injiziert)
├── gamelog.js             Game.log-Parser + Polling-Tailer
│                          (Electron-frei, unit-testbar; siehe Abschnitt 6)
├── config.json            Nutzer-Config (gamelog enabled, echte Binds,
│                          u. a. RightShift/RightControl/RightAlt-Combos)
├── vite.config.js
├── design-examples/       Referenz-Screenshots der Schiffs-MFDs pro Theme
│                          (Namensschema <Klasse>_NN.jpg, vom Nutzer)
├── src/
│   ├── main.jsx           React-Entry, ShipThemeProvider
│   ├── store.js           Zustand-Store: pages, currentPageIndex,
│   │                      toggleStates, currentVehicleId/-Class/-Name,
│   │                      vehicleMemory, gameStatus, gamelogState,
│   │                      themePreview (Dev), handleGameEvent,
│   │                      triggerButton/-Toggle, resetToggles, correctToggle
│   ├── gameEvents.js      pure Logik Event → Toggle-Update
│   ├── useLongPress.js    useLongPress (Guard für Quit/Reset) +
│   │                      useTapOrHold (für Toggles)
│   ├── themes/            NEU v2.10: Ship-Themes (Abschnitt 7)
│   │   ├── default.js     Default-Look (früher theme.js/"hud") + alle Slots
│   │   ├── resolve.js     pure: Präfix-Auflösung, Merge, Farbrollen
│   │   ├── shape.js       pure: round/chamfer-Formen als sx
│   │   ├── registry.js    Präfix → Theme (siehe Tabelle Abschnitt 7)
│   │   ├── ShipThemeProvider.jsx  baut MUI-Theme aus aktuellem Schiff,
│   │   │                  Hook useShipTheme()
│   │   ├── manufacturers/ AEGS, ANVL, CRUS, DRAK, KRIG, MISC, ORIG, RSI
│   │   └── ships/         ORIG_M80.js, RSI_Constellation.js
│   ├── page/App.jsx       Lädt Config, abonniert onConfigChanged +
│   │                      onGameEvent, Loading/Error/Normal-Zustand,
│   │                      Theme-Hintergrund/Logo
│   └── component/
│       ├── PageNav.jsx    ‹ Titel › Leiste, Reset-Button ⟲ (Long-Press),
│       │                  Quit-Button ⏻ (Long-Press)
│       ├── Panel.jsx      Panel; Titel "notch" (im Rahmen) oder "header"
│       ├── ButtonWidget.jsx
│       ├── ToggleWidget.jsx  MUI-Switch; Tap-oder-Hold
│       ├── DeckButton.jsx    (ungenutzt, Altbestand)
│       └── StatusBar.jsx  Letzter Fehler + Game.log-Info (SHIP: …) +
│                          manuelle Korrekturen + Dev-Theme-Wähler
└── test/
    ├── configValidation.test.js  16 Unit-Tests (inkl. gamelog, accent)
    ├── gamelog.test.js           30 Unit-Tests: Parser (Kanal-Pfad mit
    │                             echten Log-Zeilen, Session-Replay,
    │                             Legacy-Zonenpfad) + Tailer
    ├── gameEvents.test.mjs       14 Unit-Tests: Reset-/Restore-/Leave-Logik
    ├── themes.test.mjs           NEU v2.10: 9 Unit-Tests (Präfix-Kette,
    │                             Merge, Farbrollen, Slot-Tippfehler-Check)
    ├── scancode.test.js          9 Unit-Tests (Mapping, Flags,
    │                             Sequenz, Namensstabilität, Struct-Layout)
    ├── render.test.py            Playwright headless: Rendering, Toggle
    │                             (Tap + Long-Press-Korrektur), Nav,
    │                             Reset, Quit, Error-Screen
    ├── hotreload.test.py         Playwright: Hot-Reload behält Seite/Toggle
    ├── gamelog.render.test.py    Game-Events + Theme-Wechsel in der UI
    └── screenshots.py            NEU v2.10: Helfer (nicht in test:ui),
                                  PNGs aller Seiten, optional je Schiff
```

## 3. Umgebung (wichtig für Kontext)

- Zielsystem: **Windows 11**, Node.js **24 LTS** empfohlen.
- Anti-Cheat: Star Citizen nutzt EasyAntiCheat. **Tastatur**-Events per
  `SendInput` sind unproblematisch; EAC blockiert nur synthetische
  **Maus**-Events im relativen Modus. Deshalb bewusst keine Maus-Simulation.
  Der Scancode-Sender nutzt **denselben `SendInput`-Pfad** wie vorher
  nut.js, nur mit korrekten Flags – Risikoprofil unverändert. Das reine
  **Lesen** von Game.log ist unkritisch (lokale Textdatei, von
  Community-Tools etabliert).
- Läuft SC/RSI-Launcher erhöht, muss die App ebenfalls als **Administrator**
  laufen (Windows UIPI blockiert sonst Input-Injection; der Sender erkennt
  das inzwischen am `SendInput`-Rückgabewert und meldet es als Fehler in
  die StatusBar).

## 4. main.js – zentrale Design-Entscheidungen

- **Fenster ist `focusable: false`**: Ein Tap auf das Deck darf dem Spiel
  nicht den OS-Fokus wegnehmen (sonst gehen gesendete Tasten ans eigene,
  unsichtbare Fenster statt ins Spiel – realer Bug, so gefunden und
  gefixt). Nebenwirkung: kein Alt+F4 → globaler Shortcut **Ctrl+Alt+Q**
  sowie Quit-Button in der UI (Long-Press-gesichert).
- **Tastenversand** (seit v2.8): `scancodeSender` wird beim Start
  fail-fast initialisiert (wie früher nut.js); Ladefehler landen als
  Warnung im Config-Ergebnis und pro Tastendruck als Fehler in der
  StatusBar. Auf Nicht-Windows (Dev-Maschine) bleibt der Sender null –
  UI läuft, Versand meldet sauber einen Fehler. `doSendKeys` prüft
  zusätzlich `canSendViaScancodes` gegen rohen IPC-Input (ein
  kompromittierter Renderer könnte beliebige Strings schicken).
- **Hotkey-Queue**: `send-hotkey` läuft durch eine Promise-Queue, damit
  sich press/release zweier gleichzeitiger Taps nicht verschränken.
- **Config-Pfad Dev/Prod-abhängig** (`app.isPackaged`): Dev liest
  `config.json` direkt im Projektordner; gepackt wird beim ersten Start
  nach `app.getPath("userData")` kopiert.
- **Config-Hot-Reload**: `fs.watch` auf dem **Verzeichnis** (nicht der
  Datei – Editoren wie Notepad++ speichern per Rename-Replace, ein
  Datei-Watcher hinge sonst an einem toten Handle), debounced →
  `config-changed` an den Renderer; behält Seite + Toggle-Zustände.
  Derselbe Debounce startet auch den **Game.log-Watcher neu**.
- **Config-Validierung**: Key-Namen werden gegen `SCANCODE_KEY_NAMES`
  geprüft – plattformunabhängig, Config-Editieren auf einer Dev-Maschine
  validiert identisch zum Zielsystem.
- **Game.log-Watcher-Lifecycle**: Start bei **jedem** `did-finish-load`
  (auch Reload), Events als `game-event` per IPC an den Renderer,
  Konsolen-Log `[gamelog] …` fürs Debugging von Pattern-Drift. Stop in
  `will-quit`.
- **Monitor-Hotplug**: `display-added`/`display-removed` → Fenster zieht
  auf den Xeneon Edge (2560×720, sonst Fallback Sekundärmonitor).
- **Sicherheit**: `sandbox: true` (betrifft nur den Renderer – der
  koffi-FFI-Teil läuft im Main-Prozess), IPC-Input-Validierung in
  `send-hotkey`.

## 5. Scancode-Tastenversand (NEU v2.8, nut.js-Ausbau v2.9)

**Auslöser (realer Bug, vom Nutzer im Spiel gefunden):** Binds mit
**RightControl/RightAlt kamen im Spiel als LeftControl/LeftAlt an.**
Ursache: nut.js/libnut sendet `SendInput` mit Virtual-Key-Codes **ohne**
`KEYEVENTF_EXTENDEDKEY`. Auf Scancode-Ebene teilen sich RCtrl/RAlt aber
den Make-Code mit der linken Variante (0x1D/0x38) und unterscheiden sich
**nur** durch das Extended-Flag. SC liest Raw-Input/Scancodes → sieht
zwangsläufig links. (**RightShift war nie betroffen** – eigener Make-Code
0x36.) Mit nut.js allein nicht behebbar.

**Lösung:** `scancodeSender.js` ruft `SendInput` direkt mit
`KEYEVENTF_SCANCODE` + korrektem Extended-Flag auf, via **koffi**
(gewählt statt ffi-napi [unmaintained, bricht auf neuen Electrons] und
statt eigenem Native-Addon [bräuchte Compiler-Toolchain]). **Im Spiel
praxisverifiziert** – RCtrl/RAlt kommen korrekt an. Daraufhin in v2.9
nut.js komplett entfernt (eine native Dependency mit Build-Risiko
weniger).

Wichtige Eigenschaften:
- **Scancode-Tabelle** (`SCANCODES`, Set 1) mit **nut-js-Namen als Keys**
  → Config-Format unverändert. Bewusst nicht gemappt (waren vorher
  nut.js-Fallback, jetzt Validierungsfehler): Pause (E1-Sequenz),
  NumPadEqual, Clear, Fn, einige Media-Keys.
- Scancodes sind **positionsbasiert**: auf DE-Layout drückt Key `"Y"` die
  physische Z-Taste und umgekehrt. Da SC selbst scancode-basiert bindet,
  passt das konsistent zusammen; bei Support-Fragen zu Y/Z daran denken.
- `Return` = Haupt-Enter (0x1C), `Enter` = **NumPad**-Enter (0x1C + E0)
  – nut-js-Namenskonvention, beibehalten.
- Timing: Events einzeln mit ~15 ms Abstand, ~30 ms Hold vor dem
  Release (rückwärts) – Spiele samplen Input pro Frame, Modifier muss
  sicher vor der Haupttaste anliegen.
- Pure Teile (`buildInputSequence`, `canSendViaScancodes`) sind
  Electron-frei und laufen in Unit-Tests auf jeder Plattform; der
  FFI-Teil lädt nur auf win32. Das koffi-Struct-Layout (`INPUT` =
  40 Bytes auf x64, echte Union) ist **per Test gepinnt**, damit ein
  koffi-Update mit Packing-Änderung laut knallt.

## 6. Game.log-Integration (v2.4, Erkennung neu in v2.10) – Konzept & Entscheidungen

Grundlage: Handover "Externer Zugriff auf Star-Citizen-Statusdaten".
Kernaussagen dort: keine offizielle API, Game.log loggt **keine
Komponenten-States** (Lichter, Power, Schilde), Zeilenformate ändern sich
**zwischen Patches ohne Ankündigung**. Konsequenz: Game.log wird als
**Event-Trigger** genutzt, nie als State-Reader.

### Patch-Drift in v2.10: `OnEntityEnterZone` wird nicht mehr geloggt
Die bis v2.9 tragende Zeile (Interior-Zone mit Instanz-ID) kam in einer
echten Game.log vom 2026-09-27 **kein einziges Mal** vor – Schiffserkennung
und Per-Schiff-Memory waren dadurch unbemerkt tot (StatusBar zeigte nie ein
Schiff). Neue Signale (Ansatz übernommen von
[compumark/verselink](https://github.com/compumark/verselink), dort
`telemetry/internal/gamelog/parser.go`), alle mit echten Zeilen getestet:

| Zeile (gekürzt) | Bedeutung | Instanz-ID? |
|---|---|---|
| `Added notification "You have joined channel 'MISC Starlancer TAC : Handle'` | **Schiff betreten** (Schiffs-Chatkanal) | nein |
| `Added notification "You have left the channel '… : Handle'` (sic: „the“) | **Schiff verlassen** | nein |
| `SetVehicleSpawningInformations - VehicleEntityId: [848673759629]` | am ASOP-Terminal ausgeparkt | nur ID |
| `Attempting to stow current vehicle [848673759629]` | wieder eingelagert | nur ID |
| `ClearDriver: … releasing control token for 'MISC_Starlancer_TAC_848673759629'` | Pilotensitz verlassen (**kein** Aussteigen) | ja |
| `requesting control token` (Hinsetzen) | kommt im aktuellen Patch **nicht** vor | – |

- Kanalname = **Anzeigename** + Besitzer. Normalisierung (`parseShipChannel`):
  `@vehicle_Name`-Präfix weg (Form, die verselink sieht), Besitzer
  abtrennen, Hersteller-Anzeigename → Code (`MANUFACTURER_CODES`: Anvil →
  ANVL, Drake → DRAK …; MISC/RSI identisch), Leerzeichen → `_`. Ergebnis
  `vehicleClass` = `MISC_Starlancer_TAC`, `RSI_Apollo_Medivac`. Der
  Modellteil kann vom internen Klassennamen abweichen – egal, Themes sind
  auf diese Form geschlüsselt. **Nur englischer Client** getestet/relevant.
- Nur Kanäle mit ` : Besitzer` (oder `@vehicle_Name`) zählen – andere
  Chat-Kanäle werden ignoriert. Die Folgezeile, die das Spiel direkt nach
  der Notification schreibt, zählt nicht doppelt (Pattern verankert auf
  `Added notification`).
- **Schiffs-Schlüssel** (`vehicleId`) = `<vehicleClass>:<Besitzer>`, da die
  Kanalzeile keine ID enthält. Fremde Schiffe (anderer Besitzer) werden
  normal getrackt und bekommen auch ihr Theme.
- **Frische Instanz**: Ausparken setzt `pendingSpawnId`; der nächste
  Einstieg in ein **eigenes** Schiff bekommt diese ID. Weicht sie von der
  bekannten ID des Schiffs ab → `fresh: true` → Memory verworfen, Toggles
  `initial`. Stow-Zeile verwirft eine Ausparkung, die nie betreten wurde.
  `ClearDriver` liefert die echte ID nach und korrigiert eine falsch
  zugeordnete Ausparkung (die wird wieder pending).
- **Verlassen** = Kanal verlassen (nur wenn es das aktuelle Schiff ist),
  eigener Tod, Zerstörung des eigenen Schiffs, Spielneustart. Laut
  verselink fehlt die „left“-Zeile bei ca. der Hälfte der Ausstiege – ein
  Einstieg in ein anderes Schiff überschreibt ohnehin, Tod/Zerstörung/
  Neustart räumen ebenfalls ab.
- Legacy-Pfad `OnEntityEnterZone` bleibt als Fallback (Schlüssel =
  Instanzname), falls die Zeile zurückkommt.

| Situation | Deck-Verhalten |
|---|---|
| Vom Pilotensitz aufstehen | nichts (ClearDriver lernt nur die ID) |
| Aussteigen (Kanal verlassen) | Toggles gemerkt, Anzeige `initial`, Default-Theme |
| Wiedereinstieg selbes Schiff, kein Ausparken dazwischen | Restore aus `vehicleMemory` + Schiffs-Theme |
| Anderes Schiff betreten | altes gemerkt; neues: Restore oder `initial` |
| Selbes Schiff frisch ausgeparkt und betreten | `fresh` → Reset auf `initial` |
| Eigenes Schiff zerstört | Reset + Memory des Schiffs verworfen |
| Eigener Tod | Reset (Memory bleibt) |
| Spielneustart (Log truncated) | Reset + gesamtes Memory + Instanzwissen geleert |

**Bekannte Lücken:** "Im Schiff sitzen bleiben und ausschalten" ist weiterhin
nicht erkennbar (dafür die manuellen Korrekturen, Abschnitt 8). Wer Schiff X
ausparkt, aber zuerst in ein **anderes, schon draußen stehendes eigenes**
Schiff Y einsteigt, bekommt Y einmal fälschlich als `fresh` zurückgesetzt
(korrigiert sich beim ersten Aufstehen in Y per ClearDriver).

### Architektur der Integration
- **`gamelog.js`** (Main-Prozess-Seite, Electron-frei):
  - `createGameLogParser`: Zeile rein → semantisches Event raus
    (`vehicle-changed` mit `vehicleId`/`vehicleClass`/`manufacturer`/
    `shipName`/`owner`/`instanceId`/`fresh`, `vehicle-left` (NEU v2.10),
    `vehicle-destroyed` mit `isCurrent` und `vehicleId` = Schlüssel oder
    null, `player-killed`, `session-reset`, `player-identified`). Trackt
    intern aktuelles Schiff, Ausparkung, Instanz↔Schlüssel-Zuordnung und
    Spieler-Handle (auto-erkannt aus der Login-Zeile).
  - `createGameLogTailer`: **Polling** statt `fs.watch` (das Spiel hält
    die Datei offen; Polling ist der etablierte Weg der Community-Tools).
    Behandelt: Datei fehlt (wartet, Status "missing"), Partial-Lines,
    CRLF, **Truncation = Spielneustart** → `onTruncate`. Beim App-Start
    wird das bestehende Log von Anfang an **replayt**.
- **`src/gameEvents.js`** (Renderer-Seite, pure): `applyGameEvent`
  entscheidet Reset/Restore; `vehicleMemory` = `{ schiffsSchlüssel:
  toggleStates }`. Restore merged über `initialToggleStates`. Setzt
  `currentVehicleClass` (→ Theme) und `currentVehicleName` (→ StatusBar).
- **Pattern-Drift-Strategie**: Alle Regexes sind Daten
  (`DEFAULT_PATTERNS` in `gamelog.js`) und einzeln per
  `config.gamelog.patterns.<n>` überschreibbar – ohne Code-Änderung,
  greift per Hot-Reload sofort. Validierung prüft Kompilierbarkeit.

### Config-Beispiel
```json
"gamelog": {
  "enabled": true,
  "path": "G:\\Spiele\\...\\LIVE\\Game.log",  // null → Default-Pfad
  "pollMs": 750,
  "playerName": "Handle"   // optional; sonst Auto-Erkennung
}
```
Die ausgelieferte `config.json` ist inzwischen die **echte Nutzer-Config**
(gamelog enabled, reale Binds) – keine Platzhalter mehr.

## 7. Ship-Themes (NEU v2.10)

**Ziel:** Jedes Schiff kann ein eigenes Styling haben (Farben, Formen,
Schrift, Grafik); ohne Schiff gilt der bisherige Default-Look. Themes
liegen **im Code** (bewusste Nutzerentscheidung, nicht in config.json).

### Auflösung: längster Präfix gewinnt
`currentVehicleClass` (aus dem Parser, Abschnitt 6) wird an den
Unterstrichen geschnitten; jeder Präfix mit registriertem Theme wird über
den Default gemergt, kürzester zuerst:
```
RSI_Apollo_Medivac → default ← RSI ← RSI_Apollo (← RSI_Apollo_Medivac, falls vorhanden)
MISC_Starfarer     → default ← MISC
DRAK_Cutlass_Black → default
```
Hersteller-Themes sind damit einfach der kürzeste Präfix – keine
Sonderlogik. Ein Theme listet **nur Abweichungen** (Deep-Merge).
Matching case-insensitive, nur an `_`-Grenzen.

### Aufbau
- `default.js`: alle Slots mit den Werten des v2.9-Looks. Gruppen:
  `colors` (Palette/Rollen), `font` (family/style/stretch), `radius`
  (MUI global), `panel`, `button`, `nav`, `toggle`, `art`
  (Hintergrund-CSS, Logo-Wasserzeichen), `transitionMs`.
- **Farbrollen:** Slots enthalten eine Rolle (`"line"`, `"danger"`,
  `"teal"` …) oder eine CSS-Farbe; `themeColor()` löst auf. Ein Theme,
  das nur `colors.line` ändert, färbt damit alle Slots um, die `"line"`
  nutzen. Themes dürfen eigene Rollen ergänzen (MISC: `teal`, RSI:
  `orange`/`lavender`/`navFill`).
- **Auch `accent` in config.json** akzeptiert Rollen: `"accent": "danger"`
  folgt dem Schiffs-Theme, `"accent": "#ff4d4d"` bleibt fix. Die
  Nutzer-Config nutzt jetzt `"danger"` (SELF DESTRUCT). Validierung prüft
  nur den Typ (Rollen sind Renderer-Wissen).
- **Formen:** `corner: "round" | "chamfer"` für Buttons und Nav-Buttons
  (`shape.js`). Chamfer = `clip-path`-Achteck in zwei Ebenen (Element in
  Rahmenfarbe, `::before` mit Füllung), weil CSS-Rahmen `clip-path` nicht
  folgen. Konsequenzen: **Füllfarbe muss deckend sein**, Glow
  (box-shadow) wird weggeschnitten. `fillSx()` setzt Zustandsfüllungen
  (gedrückt, Long-Press-Aufladen) für beide Formen korrekt.
- **Panel-Titel:** `titleStyle: "notch"` (Default, im Rahmen) oder
  `"header"` (im Panel, `titleAlign`, Trennlinie `divider` mit optionalen
  hellen Endstücken `dividerCaps`, optionaler `titleMarker`-Balken).
- **Toggle:** Schiene (Radius, Rahmen, Füllung wenn an), Knopf aus/an
  (Größe, Radius, Farbe, Rahmen), `glow` abschaltbar.
- **Schrift:** Bahnschrift (Windows-Systemschrift, variable Breite) – MISC
  nutzt `"Bahnschrift SemiBold Condensed"` + `font-stretch: condensed`.
  Keine Schriftdateien nötig; eigene Fonts wären lokal zu bündeln.
- **Technik:** `ShipThemeProvider` baut bei Schiffswechsel das MUI-Theme
  neu und hängt das aufgelöste Ship-Theme als `theme.ship` an. Komponenten
  lesen es per `useShipTheme()`, `styled()`-Komponenten (ToggleSwitch)
  über `({ theme }) => theme.ship`. Farbwechsel blenden über
  `transitionMs` (300 ms) über.

### Weitere Slots (v2.11, alle mit Default = bisheriger Wert, pixelgleich)
- `font.scale` (skaliert alle rem-Größen per `html { font-size }`),
  `font.letterSpacing` (Body + Toggle-Labels), `font.synthesis`
  (`"none"` = kein Fake-Bold bei Ein-Gewicht-Schriften), `font.textShadow`
  (Phosphor-Glow).
- `button.letterSpacing`, `nav.titleSpacing`, `nav.counterColor`
  (Seitenzähler), `nav.titleFill` (CSS-Hintergrund über
  `titleBackground`, z. B. Schraffur), `nav.titleMarker` (Balken links,
  per inset-Shadow → kein Layout-Shift).
- `art.overlay`: CSS-Hintergrund **über** allem (Scanlines),
  `pointer-events: none`.
- **Gebündelte Schriften** (OFL, per `@fontsource/*` in `main.jsx`
  importiert, offline): `VT323` (DRAK), `Share Tech Mono` (ANVL). Theme-
  Dateien selbst importieren nichts (Node-Tests laden sie).

### Vorhandene Themes (Referenz: `design-examples/`)
Grundsatz (Nutzerentscheidung v2.11): Themes gelten pro **Hersteller**,
sobald ein Schiff als repräsentativ bestätigt ist; abweichende Cockpits
bekommen ein Modell-Theme obendrauf.

| Key | Datei | Look |
|---|---|---|
| `AEGS` | manufacturers/AEGS.js | Gladius = Sabre: Navy-Glas, Türkis-Linien, grau-türkise Rechteck-Buttons, Gelb = gewählt, schraffierter Titelbalken mit hellem linken Rand, Pillen-Toggles (grün an, blassblauer Punkt aus) |
| `ANVL` | manufacturers/ANVL.js | Hornet Mk II: mintgrüner CRT, Scanlines + Glow, Share Tech Mono, eckige Buttons, Rechteck-Toggles mit quadratischem Knopf |
| `CRUS` | manufacturers/CRUS.js | A1 Spirit: Blau, Navy-Buttons mit blauem Rand/Text, Gelb = gewählt, grauer Titelbalken. **Bewusst nicht kursiv** (Kursiv in den Screenshots ist Perspektive – Nutzer) |
| `DRAK` | manufacturers/DRAK.js | Corsair: Bernstein-CRT, VT323 (scale 1.4), Orange/Gelb auf Oliv-Braun, Titelbalken gelb mit dunkler Schrift, eckige Toggles, Scanlines |
| `KRIG` | manufacturers/KRIG.js | L-21 Wolf (L-22 laut Nutzer gleich; deren Screenshots sind Kopien): Schwarz/Türkis/Beige, runde Buttons mit hellem Rand, kleine Pillen-Toggles |
| `MISC` | manufacturers/MISC.js | warmes Oliv + Punktraster, Gold (Titel/Linien mit hellen Endstücken, zentriert), Türkis (Buttons/Nav, Toggle-an-Schiene), weißer Knopf an / goldener Punkt aus, condensed, rund, kein Glow. Nutzer hat bestätigt: Starfarer sieht wie Starlancer aus → Hersteller-Theme |
| `ORIG` | manufacturers/ORIG.js | 400i: Formen des Default-Looks (der ursprünglich nach der 400i entstand), auf Nutzerwunsch blauer; blauer Titelbalken |
| `ORIG_M80` | ships/ORIG_M80.js | auf ORIG: blassblau/weiß über rotem Cockpit-Schimmer, abgerundete Rechtecke, violetter Titelmarker, Gelb = gewählt, Pillen-Toggles weiß an |
| `RSI` | manufacturers/RSI.js | Apollo = Aurora Mk II → Formen in v2.11 von `RSI_Apollo` hochgezogen (Datei gelöscht, pixelgleich): achteckige Buttons, abgeschrägte Nav, Titel mit orangem Marker, eckige Toggles (weiß an, rot aus) |
| `RSI_Constellation` | ships/RSI_Constellation.js | Andromeda: setzt RSI-Formen zurück auf rund, Lavendel-Rahmen, `notch`-Titel wie das SCREENS/CARGO-BAY-Seitenpanel, blauer Titelbalken, Toggles orange an |

Klassennamen der neuen Hersteller (ANVL, AEGS, CRUS, DRAK, KRIG, ORIG)
sind aus `MANUFACTURER_CODES` abgeleitet und **noch nicht im echten Log
belegt** – beim ersten Einsteigen die StatusBar (`SHIP: …`) bzw. das
`[gamelog]`-Konsolen-Log prüfen.

### Neues Theme anlegen
1. Datei unter `manufacturers/<CODE>.js` bzw. `ships/<Klasse>.js`, nur
   Abweichungen vom Default (Vorlage: bestehende Themes).
2. In `registry.js` eintragen – Key = Präfix in Parser-Schreibweise
   (Hersteller-Code + Anzeigename mit `_`, z. B. `DRAK_Cutlass`).
3. `npm run dev` → **Dev-Theme-Wähler** in der StatusBar (gestrichelt,
   nur im Dev-Build) antippen, um ohne Spiel durch alle Themes zu
   schalten. Oder `npm run build && python test/screenshots.py <dir>
   DRAK_Cutlass_Black` für PNGs.
4. `npm test` – `themes.test.mjs` prüft alle registrierten Themes auf
   unbekannte Farbrollen (Tippfehler).

## 8. Interaktionsmodell der Widgets (Stand v2.9)

- **Momentan-Buttons**: feuern auf **pointerdown** (minimale Latenz).
- **Toggles** (`useTapOrHold`, geändert in v2.9):
  - **Tap** (loslassen vor 600 ms): Keys senden + vermuteten Zustand
    flippen. Feuert jetzt auf **pointerUP** – bewusster Trade-off, ohne
    den Hold nicht erkennbar wäre; Zustand flippt weiterhin nur bei
    erfolgreichem Versand (kein Drift bei Sende-Fehlern).
  - **Hold** (≥ 600 ms): `correctToggle` – vermuteten Zustand flippen
    **ohne Tastenversand** (Drift-Korrektur pro Widget, z. B. nach
    Ship-Power-Off oder Direkteingabe an der Tastatur). Track lädt sich
    dabei amber auf (Theme-Rolle `warn`, gleiche Farbsprache wie Reset), Meldung
    `MANUAL: <Label> → ON/OFF` in der StatusBar. Loslassen nach dem Hold
    ist ein No-op; Wegziehen vor dem Loslassen bricht ab.
- **Reset-Button ⟲** (Nav-Leiste): Long-Press setzt **alle** Toggles auf
  `initial` zurück, ohne Tastenversand (Rundumschlag-Variante).
- **Quit-Button ⏻**: Long-Press-gesichert (Touch-Fläche, Handballen).
- Fehler-Feedback am Widget (roter Track) hat Vorrang vor dem
  Holding-Feedback.

## 9. Bekannte Einschränkungen / bewusste Trade-offs

- Toggle-Zustand ist weiterhin **lokal geraten** – Game.log liefert nur
  Trigger. Drift ist jetzt aber pro Widget (Long-Press) oder komplett
  (⟲) manuell korrigierbar.
- Toggle-Tap feuert auf pointerup statt pointerdown (siehe Abschnitt 8).
- Exoten-Keys ohne Scancode-Mapping (Pause, Fn, …) sind nicht mehr
  sendbar – für SC-Binds irrelevant; bei Bedarf Scancode in `SCANCODES`
  nachtragen (+ Test).
- Kein Power-Dreieck/Slider-Widget (weiterhin "Could have").
- Kein visueller Editor – Config per Hand, Hot-Reload macht das komfortabel.
- Noch kein `electron-builder`-Setup für eine fertige `.exe`.
- `vehicleMemory` lebt nur im RAM – App-Neustart vergisst die
  Per-Schiff-Zustände (bewusst simpel; Persistenz über userData-JSON
  leicht nachrüstbar). Beim Start wird die Game.log replayt, dadurch sind
  aktuelles Schiff und Instanzwissen sofort wieder da.
- Schiffserkennung hängt am **englischen** Kanal-Text und am
  Anzeigenamen; `MANUFACTURER_CODES` ist ungeprüft für Hersteller, die
  noch nicht im echten Log vorkamen (nur MISC/RSI belegt).
- Chamfer-Formen: nur deckende Füllungen, kein Glow (siehe Abschnitt 7).
- Hersteller-Logos (`art.logo`) vorgesehen, aber noch keine Assets
  (Nutzer liefert nach).

## 10. Testing

```bash
npm test        # 80 Unit-Tests: Config-Validierung (16), Game.log-Parser/
                # Tailer (30), Event→Toggle-Logik (14), Ship-Themes (11),
                # Scancode (9). Reines Node, plattformunabhängig.
npm run test:ui # Headless-Playwright: Rendering/Toggle (Tap +
                # Long-Press-Korrektur)/Nav/Reset/Quit/Error,
                # Config-Hot-Reload, Game-Event-Pfad + Theme-Wechsel in
                # der echten UI (braucht Python + Playwright + npm run build)
python test/screenshots.py <dir> [Klasse ...]
                # kein Test: PNGs aller Seiten (Default + je Schiff), für
                # Pixelvergleiche vor/nach Refactorings und Theme-Design
```
Alle Suiten liefen beim Stand v2.10 grün (Playwright gegen frischen Build).
Auf der Nutzer-Maschine: `python` (nicht `python3` – unter Windows ein
Store-Alias ohne Python dahinter; `test:ui` ist entsprechend umgestellt),
Playwright via `pip install playwright` + `python -m playwright install
chromium` installiert.

**Pixelgleichheit beim Theme-Umbau:** Vor dem Umbau Referenz-PNGs des
Default-Looks aufgenommen; nach jeder Stufe (Infrastruktur, erweiterte
Slots, Themes) byte-identisch verglichen – der Default-Look ist durch
v2.10 unverändert.

**Gelernte Lektion (v2.4, in v2.9 erneut relevant geworden):** Nach
UI-Verhaltensänderungen `dist/` neu bauen **und** die Playwright-Suiten
anfassen, bevor ein Stand als "grün" gilt. Der Wechsel des Toggle-Taps
auf pointerup hat erwartungsgemäß alle Toggle-Interaktionen in den
UI-Tests gebrochen (dispatchten nur `pointerdown`) – Suiten wurden auf
down+up-Taps umgestellt und um Long-Press-Assertions erweitert
(pointerdown allein sendet nichts; Hold flippt ohne Keys; Release nach
Hold ist kein zweites Toggle).

## 11. Offene/nächste Schritte

1. ~~Praxistest Default-Patterns~~ → Game.log-Tracking läuft produktiv
   (Config enabled mit echtem Pfad + Handle). Bei Patch-Drift: echte
   Log-Zeilen mit `DEFAULT_PATTERNS` abgleichen, per Config überschreiben.
2. ~~Long-Press-Korrektur~~ → erledigt in v2.9.
3. Optional: `vehicleMemory` nach userData persistieren.
4. Power-Dreieck / Slider-Widget mit gekoppelten Werten.
5. Formular-basierter Editier-Modus in der App (schreibt config.json).
6. `electron-builder`-Packaging für eine `.exe` (dann greift der
   userData-Config-Pfad produktiv). koffi ist N-API mit Prebuilds und
   sollte problemlos packbar sein; `asarUnpack` für native Teile prüfen.
7. **Praxistest v2.10 im Spiel:** Ein-/Aussteigen, Wiedereinstieg
   (Restore), Ausparken + Einsteigen (fresh), Theme-Wechsel. Konsolen-Log
   `[gamelog] {...}` zeigt jedes Event.
8. Hersteller-Logos/Grafiken einbauen, sobald der Nutzer sie liefert
   (`src/themes/assets/`, per `import` in `art.logo`).
9. ~~Weitere Ship-Themes~~ → v2.11 (AEGS, ANVL, CRUS, DRAK, KRIG, ORIG,
   ORIG_M80, RSI_Constellation). Praxistest im Spiel steht aus (Klassennamen,
   Wirkung auf dem Edge).
10. ~~Eigene Schriften~~ → VT323 + Share Tech Mono gebündelt (v2.11).

## 12. Bisheriger Gesprächsverlauf (Kurzfassung, chronologisch)

1. Ausgangsfrage: eigenes Tastensende-Tool fürs Xeneon Edge, GameGlass-artig.
2. Empfehlung Electron + nut.js statt AutoHotkey/robotjs; Klärung Star
   Citizen + EAC (Keyboard-only ist sicher).
3. Vanilla-JS-Version gebaut, dann auf Wunsch zu React + Zustand + MUI
   migriert.
4. Bug: Tasten kamen nirgends an → Fokus-Diebstahl durchs Electron-Fenster
   → Fix `focusable: false`.
5. Cockpit-Panel-Optik nach Screenshots des Nutzers: Schema
   `pages/panels/widgets`, Toggles, Seitennav; mit Playwright verifiziert.
6. Code-Review (Rolle: kritischer Entwickler) → 14 Punkte, 12 umgesetzt
   inkl. Tests.
7. Bug: Config im Dev-Betrieb nie aktualisiert → Dev/Prod-Pfadtrennung +
   Hot-Reload gebaut und getestet.
8. Gesamter Code auf Englisch übersetzt, alle Tests erneut grün.
9. Separate Recherche: kein API-Zugriff auf SC-Gamestates; Game.log als
   Event-Trigger identifiziert (eigenes Handover-Dokument).
10. **v2.4**: Game.log-Integration für Toggle-Reset/-Restore
    (Instanz-ID-Ansatz, Per-Schiff-Memory, konfigurierbare Patterns).
    Dabei stale `dist/` + gebrochene Alt-Tests gefunden und gefixt.
11. **v2.5–v2.7** (aus dem Code rekonstruiert, Session ohne Handoff-Update):
    Reset-Button ⟲ mit Long-Press-Guard, `useLongPress`-Hook,
    Verzeichnis- statt Datei-Watching für Hot-Reload, Watcher-Neustart
    bei jedem did-finish-load, echte Nutzer-Config statt Platzhalter.
12. **v2.8**: Nutzer meldet: RCtrl/RAlt kommen im Spiel als LCtrl/LAlt an
    → Extended-Flag-Diagnose, `scancodeSender.js` (koffi/SendInput) als
    bevorzugter Pfad mit nut.js-Fallback, 9 neue Unit-Tests,
    Struct-Layout verifiziert. **Vom Nutzer im Spiel bestätigt.**
13. **v2.9**: nut.js komplett entfernt (Validierung gegen
    Scancode-Tabelle, Namensstabilitäts-Test); Long-Press auf Toggles =
    manuelle Zustandskorrektur ohne Tastenversand (`useTapOrHold`,
    `correctToggle`, amber Holding-Feedback, StatusBar-Meldung);
    Toggle-Tap bewusst auf pointerup verlegt; alle drei Playwright-Suiten
    entsprechend angepasst und erweitert. 47 Unit-Tests + 3 UI-Suiten grün.
14. **v2.10**: Nutzerwunsch „Styling je nach aktuellem Schiff“. Erst
    Rückfragen + Vorschläge, dann gemeinsam festgelegt (Themes im Code,
    Modell mit Hersteller-Fallback, Farben + Formen/Schrift + Grafik,
    Default bei allen Verlassen-Events, fremde Schiffe ebenfalls, nur
    englischer Client, Dev-Vorschau). Analyse der echten Game.log ergab:
    `OnEntityEnterZone` fehlt komplett → Schiffserkennung war tot.
    Neue Erkennung über den Schiffs-Chatkanal (Idee aus verselink) +
    Ausparken/Einlagern/ClearDriver für frische Instanzen (Phase 1, mit
    Replay der echten Session getestet). Theme-Infrastruktur ohne
    sichtbare Änderung, pixelgleich verifiziert (Phase 2). Themes MISC
    (Hersteller, Starlancer = Starfarer laut Nutzer), RSI, RSI_Apollo nach
    Referenzbildern + Dev-Theme-Wähler (Phase 3). `accent` in config.json
    akzeptiert Farbrollen. 78 Unit-Tests + 3 UI-Suiten grün.
15. **v2.11**: Nutzer liefert Screenshots weiterer Schiffe. Rückfragen →
    Entscheidungen: Hersteller-Themes ja, CRUS nicht kursiv, 400i blauer,
    L-22 = L-21, Pixel-/Mono-Schriften bündeln. Neue Slots (pixelgleich
    verifiziert), 8 neue Themes, RSI_Apollo in RSI aufgegangen (Aurora
    gleich). 80 Unit-Tests + 3 UI-Suiten grün (UI-Suite prüft zusätzlich
    Modell-Theme RSI_Constellation über RSI).

## 13. Hinweise für den nächsten Agenten

- Nutzer ist **fit in JavaScript**, etwas Erfahrung mit AutoHotkey. Mag
  kurze, klare Erklärungen, testet aktiv selbst (Notepad++, echtes Spiel)
  – der RCtrl→LCtrl-Bug wurde vom Nutzer im Spiel gefunden, der Fix von
  ihm dort verifiziert.
- Nutzer reagiert gut auf **proaktive Vorschläge mit Begründung** ("ich
  würde X tun, weil Y") statt nur Rückfragen; begrüßt Rückfragen aber
  explizit bei mehrdeutigen Architekturentscheidungen.
- Code wurde bei jeder Iteration **tatsächlich gebaut und getestet**
  (npm run build, Node-Unit-Tests, Playwright headless mit gemockter
  `window.scDeck`-Bridge) – dieses Verifikationsniveau beibehalten.
  Grenze des Sandboxings: Electron-Runtime und der koffi/user32-Teil
  laufen nur auf dem Windows-Zielsystem; hier verifizierbar per
  Syntax-Check, Logik-Tests und Struct-Layout-Test.
- Beim Weiterarbeiten das **gesamte Projekt** übernehmen: main.js,
  scancodeSender.js, gamelog.js, store.js, gameEvents.js und
  configValidation.js sind eng verzahnt (Key-Namensschema, Event-Typen,
  Config-Schema, IPC-Kanäle `config-changed` / `game-event`).
- Bei Änderungen am Event-Schema beide Seiten + beide Testebenen anfassen:
  `gamelog.js`/`gamelog.test.js` (Main) und
  `gameEvents.js`/`gameEvents.test.mjs`/`gamelog.render.test.py` (Renderer).
- Bei neuen Keys/Widgets: `SCANCODES` in `scancodeSender.js` ist die
  einzige Quelle gültiger Key-Namen; Ergänzungen immer mit Test in
  `test/scancode.test.js` (und daran denken: nut-js-Namensschema
  beibehalten, `Return` vs. `Enter` beachten).
- Nach UI-Verhaltensänderungen: `dist/` neu bauen und **alle drei**
  Playwright-Suiten laufen lassen – die interagieren mit echten
  Pointer-Events und brechen (gewollt) bei Interaktionsänderungen.
- Nutzer arbeitet gern **in Phasen mit Abstimmung vorher** („erst Fragen,
  dann Vorschläge, dann gemeinsam festlegen“) und will, dass dieses
  Handover nach jeder abgeschlossenen Änderung aktuell ist.
- **Styling nie mehr hart codieren:** Farben/Formen gehören in
  `src/themes/default.js` (als Slot) und werden in Komponenten über
  `useShipTheme()` + `themeColor()` gelesen; `src/theme.js`/`hud` gibt es
  nicht mehr. Neue Slots immer mit Default = bisheriger Wert (Pixelgleichheit
  per `test/screenshots.py` prüfen) und bei Farbslots in
  `COLOR_SLOTS`/`NULLABLE_SLOTS` von `test/themes.test.mjs` eintragen.
- MUI-Falle: in `sx` bedeuten Zahlen ≤ 1 bei width/height **Prozent**
  (`height: 1` = 100 %) – Pixel explizit als String (`"1px"`) angeben.
- Game.log-Patterns sind datengetrieben (`DEFAULT_PATTERNS`); bei neuem
  Patch zuerst eine echte Log-Datei auf die Signale aus Abschnitt 6
  prüfen (grep nach `joined channel`, `ClearDriver`,
  `SetVehicleSpawningInformations`), bevor Code geändert wird.
