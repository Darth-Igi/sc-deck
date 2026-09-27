import React from "react";
import ReactDOM from "react-dom/client";
import ShipThemeProvider from "./themes/ShipThemeProvider";
import App from "./page/App";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ShipThemeProvider>
      <App />
    </ShipThemeProvider>
  </React.StrictMode>
);
