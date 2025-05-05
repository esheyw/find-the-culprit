import { registerSettings } from "./settings.mjs";
import { MODULE, MODULE_ID } from "./constants.mjs";
import { FindTheCulprit } from "./apps/FindTheCulprit.mjs";

Hooks.once("init", () => {
  registerSettings();
  const templates = [
    "binarySearchStep.hbs",
    "missingDependencies.hbs",
    "errorDialog.hbs",
    "foundTheCulprit.hbs",
    "instructions.hbs",
    "issuePersistsWithOnlyPinned.hbs",
    "main.hbs",
    "onlyPinnedActive.hbs",
  ];
  foundry.applications.handlebars.loadTemplates(templates.map((t) => `modules/${MODULE_ID}/templates/${t}`));
  MODULE().debug = game.settings.get(MODULE_ID, "debugLevel");
  CONFIG.ui.ftc = FindTheCulprit;
});
