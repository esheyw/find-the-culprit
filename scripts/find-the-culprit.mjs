import { registerSettings } from "./settings.mjs";
import { MODULE, MODULE_ID } from "./constants.mjs";
import { FindTheCulprit } from "./apps/FindTheCulprit.mjs";
import { activeRealGM } from "./helpers.mjs";

Hooks.once("init", () => {
  registerSettings();
  const templates = [
    "binarySearchStep.hbs",
    "errorDialog.hbs",
    "foundTheCulprit.hbs",
    "instructions.hbs",
    "issuePersistsWithOnlyPinned.hbs",
    "main.hbs",
    "onlySelectedActive.hbs",
  ];
  loadTemplates(templates.map((t) => `modules/${MODULE_ID}/templates/${t}`));
  MODULE().debug = MODULE().flags?.debug ?? 0;
});

Hooks.once("ready", () => {
  if (activeRealGM()?.isSelf) new FindTheCulprit();
});
