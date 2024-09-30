import { MODULE_ID } from "./constants.mjs";
import { FtCSettings } from "./data/models.mjs";
export const SETTINGS = {
  data: {
    type: FtCSettings,
    config: false,
    name: "FTC.Setting.Data.Name",
    hint: "FTC.Setting.Data.Hint",
    scope: "world",
    default: new FtCSettings().toObject(),
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
        0: "FindTheCulprit.Setting.degbugLevel.Choices.None",
        1: "FindTheCulprit.Setting.degbugLevel.Choices.Logging",
        2: "FindTheCulprit.Setting.degbugLevel.Choices.Debugger",
      },
      initial: 0,
    }),
    config: true,
    name: "FindTheCulprit.Setting.degbugLevel.Name",
    hint: "FindTheCulprit.Setting.degbugLevel.Hint",
    scope: "client",
  },
};
export function registerSettings() {
  for (const [key, data] of Object.entries(SETTINGS)) {
    game.settings.register(MODULE_ID, key, data);
  }
}
