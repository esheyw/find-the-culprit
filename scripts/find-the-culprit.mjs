import { FindTheCulpritAppV2 } from "./apps/FindTheCulpritAppV2.mjs";
import { registerSettings } from "./settings.mjs";
import { MODULE } from "./constants.mjs";
import { helpers } from "./handlebars.mjs";
import { cleanOldSettings } from "./helpers.mjs";

Hooks.once("init", () => {
  registerSettings();
  Handlebars.registerHelper(helpers);
  MODULE().debug = true;
});

Hooks.once("setup", () => {
  if (game.user !== activeRealGM()) return;
  
  // if (!MODULE().debug) cleanOldSettings();
});
Hooks.once("ready", () => {
  if (game.user !== activeRealGM()) return;  
  MODULE().app = new FindTheCulpritAppV2();
  MODULE().app.doStep();
});

function activeRealGM() {
  const activeRealGMs = game.users.filter((u) => u.active && u.role === CONST.USER_ROLES.GAMEMASTER);
  activeRealGMs.sort((a, b) => (a.id > b.id ? 1 : -1));
  return activeRealGMs[0] || null;
}
