// Ship theme registry: key = vehicle class PREFIX (see resolve.js).
//   manufacturer themes: src/themes/manufacturers/<CODE>.js  (e.g. "MISC")
//   model themes:        src/themes/ships/<Class>.js         (e.g. "RSI_Apollo")
// Keys follow the parser's vehicleClass form: manufacturer code + display
// name with underscores ("MISC_Starlancer_TAC", "RSI_Apollo_Medivac").
import MISC from "./manufacturers/MISC.js";
import RSI from "./manufacturers/RSI.js";
import RSI_Apollo from "./ships/RSI_Apollo.js";

export const SHIP_THEMES = {
  MISC,
  RSI,
  RSI_Apollo,
};
