// Ship theme registry: key = vehicle class PREFIX (see resolve.js).
//   manufacturer themes: src/themes/manufacturers/<CODE>.js  (e.g. "MISC")
//   model themes:        src/themes/ships/<Class>.js         (e.g. "ORIG_M80")
// Keys follow the parser's vehicleClass form: manufacturer code + display
// name with underscores ("MISC_Starlancer_TAC", "RSI_Apollo_Medivac").
import AEGS from "./manufacturers/AEGS.js";
import ANVL from "./manufacturers/ANVL.js";
import CRUS from "./manufacturers/CRUS.js";
import DRAK from "./manufacturers/DRAK.js";
import KRIG from "./manufacturers/KRIG.js";
import MISC from "./manufacturers/MISC.js";
import ORIG from "./manufacturers/ORIG.js";
import RSI from "./manufacturers/RSI.js";
import ORIG_M80 from "./ships/ORIG_M80.js";
import RSI_Constellation from "./ships/RSI_Constellation.js";

export const SHIP_THEMES = {
  AEGS,
  ANVL,
  CRUS,
  DRAK,
  KRIG,
  MISC,
  ORIG,
  ORIG_M80,
  RSI,
  RSI_Constellation,
};
