import { FindTheCulpritApp } from "./apps/FindTheCulpritApp.mjs";
import { registerSettings } from "./settings.mjs";
export const MODULE_ID = "find-the-culprit";
export const MODULE = () => game.modules.get(MODULE_ID);
Hooks.once("init", () => {
  registerSettings();
});
Hooks.once("setup", () => {
  if (game.user !== activeRealGM()) return;
  MODULE().app = new FindTheCulpritApp();
});
Hooks.once("ready", () => {
  if (game.user !== activeRealGM()) return;
  MODULE().app.doStep();
});

function activeRealGM() {
  const activeRealGMs = game.users.filter((u) => u.active && u.role === CONST.USER_ROLES.GAMEMASTER);
  activeRealGMs.sort((a, b) => (a.id > b.id ? 1 : -1));
  return activeRealGMs[0] || null;
}
