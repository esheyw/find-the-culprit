import { MODULE, MODULE_ID } from "./constants.mjs";
import { FindTheCulpritData } from "./data/models.mjs";
export const SETTINGS = {
  data: {
    type: FindTheCulpritData,
    config: false,
    scope: "world",
    default: new FindTheCulpritData().toObject(),
    onChange: () => {
      const app = MODULE().app;
      if (!app || app.currentStep !== null || !app.rendered) return;
      app.render();
    },
  },
  error: {
    type: new foundry.data.fields.StringField({
      nullable: true,
      required: true,
      blank: false,
      initial: null,
    }),
    config: false,
    scope: "world",
  },
  debugLevel: {
    type: new foundry.data.fields.NumberField({
      required: true,
      nullable: false,
      choices: {
        0: "FindTheCulprit.Setting.debugLevel.Choices.None",
        1: "FindTheCulprit.Setting.debugLevel.Choices.Logging",
        2: "FindTheCulprit.Setting.debugLevel.Choices.Debugger",
      },
      initial: 0,
    }),
    config: true,
    name: "FindTheCulprit.Setting.debugLevel.Name",
    hint: "FindTheCulprit.Setting.debugLevel.Hint",
    scope: "client",
    onChange: (value) => (MODULE().debug = value),
  },
};

export function registerSettings() {
  for (const [key, data] of Object.entries(SETTINGS)) {
    game.settings.register(MODULE_ID, key, data);
  }
}
