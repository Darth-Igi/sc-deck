import { useEffect } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useDeckStore } from "../store";
import { hud } from "../theme";
import Panel from "../component/Panel";
import PageNav from "../component/PageNav";
import StatusBar from "../component/StatusBar";

export default function App() {
  const pages = useDeckStore((s) => s.pages);
  const currentPageIndex = useDeckStore((s) => s.currentPageIndex);
  const loaded = useDeckStore((s) => s.loaded);
  const configError = useDeckStore((s) => s.configError);
  const loadConfig = useDeckStore((s) => s.loadConfig);
  const quit = useDeckStore((s) => s.quit);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const centered = {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    bgcolor: "background.default",
    gap: 2,
    p: 4,
  };

  if (!loaded) {
    return (
      <Box sx={centered}>
        <CircularProgress />
      </Box>
    );
  }

  // Kaputte Config: Fehler sichtbar machen statt ewig zu laden (Fix #3)
  if (configError) {
    return (
      <Box sx={{ ...centered, alignItems: "flex-start", overflow: "auto" }}>
        <Typography sx={{ color: hud.danger, fontSize: "1.4rem", fontWeight: 700 }}>
          CONFIG-FEHLER
        </Typography>
        <Typography sx={{ color: hud.textDim, fontSize: "0.8rem" }}>
          {configError.path}
        </Typography>
        {configError.errors.map((e, i) => (
          <Typography key={i} sx={{ color: hud.text, fontSize: "0.95rem" }}>
            • {e}
          </Typography>
        ))}
        <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
          <Box
            onPointerDown={() => loadConfig()}
            sx={{
              border: `1px solid ${hud.line}`, borderRadius: "8px",
              color: hud.line, px: 3, py: 1, cursor: "pointer",
              fontWeight: 700, letterSpacing: "0.1em",
            }}
          >
            NEU LADEN
          </Box>
          <Box
            onPointerDown={quit}
            sx={{
              border: `1px solid ${hud.danger}`, borderRadius: "8px",
              color: hud.danger, px: 3, py: 1, cursor: "pointer",
              fontWeight: 700, letterSpacing: "0.1em",
            }}
          >
            BEENDEN
          </Box>
        </Box>
      </Box>
    );
  }

  const page = pages[currentPageIndex];

  return (
    <Box
      sx={{
        height: "100vh",
        width: "100vw",
        bgcolor: "background.default",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        p: 1.5,
        boxSizing: "border-box",
      }}
    >
      <PageNav />

      {/* Panelbreite an Spaltenzahl gewichten (Fix #9), min. Faktor 1 */}
      <Box
        sx={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: page.panels
            .map((p) => `${Math.max(p.columns || 3, 1)}fr`)
            .join(" "),
          gap: 2,
          minHeight: 0,
        }}
      >
        {page.panels.map((panel) => (
          <Panel key={panel.id} panel={panel} />
        ))}
      </Box>

      <StatusBar />
    </Box>
  );
}
