import { MODULE_ID } from "./constants.mjs";
import { FtCSettingsModel, FtCSettingsModel2 } from "./data/models.mjs";
export const SETTINGS = {
  data: {
    type: FtCSettingsModel,
    config: false,
    name: "FTC.Setting.Data.Name",
    hint: "FTC.Setting.Data.Hint",
    scope: "world",
    default: new FtCSettingsModel2().toObject(),
  },
  data2: {
    type: FtCSettingsModel2,
    config: false,
    name: "FTC.Setting.Data.Name",
    hint: "FTC.Setting.Data.Hint",
    scope: "world",
    default: new FtCSettingsModel2().toObject(),
  },
};
export function registerSettings() {
  for (const [key, data] of Object.entries(SETTINGS)) {
    game.settings.register(MODULE_ID, key, data);
  }
}
