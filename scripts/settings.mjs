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
    scope: "world"
  }
};
export function registerSettings() {
  for (const [key, data] of Object.entries(SETTINGS)) {
    game.settings.register(MODULE_ID, key, data);
  }
}
