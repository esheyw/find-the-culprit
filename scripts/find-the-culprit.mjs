import { FindTheCulpritApp } from "./apps/FindTheCulpritApp.mjs";
import { registerSettings } from "./settings.mjs";
export const MODULE_ID = "find-the-culprit";
export const MODULE = () => game.modules.get(MODULE_ID);
Hooks.once("init", () => {
  registerSettings();
});
Hooks.once("setup", () => {
  MODULE().app = new FindTheCulpritApp();
});
Hooks.once("ready", () => {
  MODULE().app.doStep();
});
