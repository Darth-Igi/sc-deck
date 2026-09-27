// Shape helpers for themed boxes (sx objects, pure).
//
// corner "round":   plain CSS border + border-radius.
// corner "chamfer": cut corners (RSI style). CSS borders do not follow
//   clip-path, so the box is drawn in two layers: the element itself is
//   filled with the BORDER color and clipped, a ::before inset by the border
//   width carries the FILL with the same (slightly smaller) cut. The fill
//   therefore has to be opaque - a translucent fill would show the border
//   color through. Glow (box-shadow) is clipped away on chamfered boxes.

function chamferPolygon(cut) {
  const c = `${cut}px`;
  const r = `calc(100% - ${cut}px)`;
  return `polygon(${c} 0, ${r} 0, 100% ${c}, 100% ${r}, ${r} 100%, ${c} 100%, 0 ${r}, 0 ${c})`;
}

/**
 * @param {object} o
 * @param {"round"|"chamfer"} [o.corner]
 * @param {number} [o.radius]      round: border radius (px)
 * @param {number} [o.cut]         chamfer: corner cut (px)
 * @param {number} [o.borderWidth]
 * @param {string} o.border        CSS color
 * @param {string} [o.fill]        CSS color / background
 */
export function shapeSx({ corner = "round", radius = 0, cut = 10, borderWidth = 1, border, fill }) {
  if (corner !== "chamfer") {
    return {
      border: `${borderWidth}px solid ${border}`,
      borderRadius: `${radius}px`,
      ...(fill !== undefined ? { background: fill } : {}),
    };
  }
  // inner cut is smaller by the border width * tan(22.5°) so the diagonal
  // border keeps roughly the same thickness as the straight edges
  const innerCut = Math.max(cut - borderWidth * 0.41, 0);
  return {
    position: "relative",
    isolation: "isolate", // keeps the ::before (z-index -1) inside the box
    border: "none",
    borderRadius: 0,
    background: border,
    clipPath: chamferPolygon(cut),
    "&::before": {
      content: '""',
      position: "absolute",
      inset: `${borderWidth}px`,
      background: fill ?? "transparent",
      clipPath: chamferPolygon(innerCut),
      zIndex: -1,
    },
  };
}

// Fill override for state styles (pressed, charging ...) that works for
// both corner styles: round -> background, chamfer -> the ::before layer.
export function fillSx(corner, fill, transition) {
  const style = { background: fill, ...(transition ? { transition } : {}) };
  return corner === "chamfer" ? { "&::before": style } : style;
}
