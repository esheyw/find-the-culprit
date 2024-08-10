import { FindTheCulpritApp } from "./apps/FindTheCulpritApp.mjs";
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
  MODULE().app = new FindTheCulpritApp();  
  if (!MODULE().debug) cleanOldSettings();
});
Hooks.once("ready", () => {
  if (game.user !== activeRealGM()) return;
  MODULE().app2 = new FindTheCulpritAppV2();
  MODULE().app.doStep();
  MODULE().app2.doStep();
  globalThis.ftc2 = MODULE().app2;
});

function activeRealGM() {
  const activeRealGMs = game.users.filter((u) => u.active && u.role === CONST.USER_ROLES.GAMEMASTER);
  activeRealGMs.sort((a, b) => (a.id > b.id ? 1 : -1));
  return activeRealGMs[0] || null;
}
