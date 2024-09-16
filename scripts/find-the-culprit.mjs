import { registerSettings } from "./settings.mjs";
import { MODULE } from "./constants.mjs";
import { FindTheCulpritApp } from "./apps/FindTheCulpritAppV3.mjs";

Hooks.once("init", () => {
  registerSettings();
  MODULE().debug = true;
});

Hooks.once("setup", () => {
  if (game.user !== activeRealGM()) return;

  // if (!MODULE().debug) cleanOldSettings();
});
Hooks.once("ready", () => {
  if (game.user !== activeRealGM()) return;
  MODULE().app = new FindTheCulpritApp();
  MODULE().app.doStep();
  if (MODULE().debug) globalThis.ftc = MODULE().app;
});

function activeRealGM() {
  const activeRealGMs = game.users.filter((u) => u.active && u.role === CONST.USER_ROLES.GAMEMASTER);
  activeRealGMs.sort((a, b) => (a.id > b.id ? 1 : -1));
  return activeRealGMs[0] || null;
}
