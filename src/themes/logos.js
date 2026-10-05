// Logo watermarks: src/themes/assets/<KEY>.svg, KEY = vehicle class prefix
// in parser notation like the theme keys ("ORIG", "ORIG_M80"). Works for
// manufacturers without a theme too (Argo logo on the default look).
//
// The folder is gitignored (manufacturer trademarks), hence a glob instead of
// imports: a checkout without the files still builds, just without logos.
// Renderer-only (Vite) - theme files stay importable by the Node tests.
import { svgDataUrl } from "./resolve";

const files = import.meta.glob("./assets/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
});

export const LOGOS = Object.fromEntries(
  Object.entries(files).map(([file, svg]) => [
    file.slice(file.lastIndexOf("/") + 1, -".svg".length),
    svgDataUrl(svg),
  ])
);
