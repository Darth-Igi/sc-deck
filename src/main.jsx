import React from "react";
import ReactDOM from "react-dom/client";
// Bundled OFL fonts for the CRT-style ship themes (DRAK, ANVL)
import "@fontsource/vt323";
import "@fontsource/share-tech-mono";
import ShipThemeProvider from "./themes/ShipThemeProvider";
import App from "./page/App";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ShipThemeProvider>
      <App />
    </ShipThemeProvider>
  </React.StrictMode>
);
