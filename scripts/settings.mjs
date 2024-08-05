import { activate } from "../app/dist/server/sockets.mjs";
import { FindTheCulpritAppV2 } from "./apps/FindTheCulpritAppV2.mjs";
import { MODULE_ID } from "./find-the-culprit.mjs";
const fields = foundry.data.fields;
const ModIDField = () => new fields.SetField(
  new fields.StringField({
    required: true,
    nullable: false,
    blank: false,
    validate: (value) => !!game.modules.get(value),
    validationError: "is not an installed module ID.",
  })
)
class FtCSettingsModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      locks: ModIDField(),
      original: ModIDField(),
      active: ModIDField(),
      chosen: ModIDField(),
      state: new fields.NumberField({ nullable: false, min: 0, initial: 0 }),
      mute: new fields.BooleanField({ initial: false }),
      lockLibraries: new fields.BooleanField({ initial: false }),
      reloadAll: new fields.BooleanField({ initial: false }),
      original: new fields.ObjectField(),
    };
  }
}
export function registerSettings() {
  game.settings.register(MODULE_ID, "data", {
    type: FtCSettingsModel,
    config: false,
    name: "FTC.Setting.Data.Name",
    hint: "FTC.Setting.Data.Hint",
  });
  game.settings.register(MODULE_ID, "locks", {
    default: {},
    type: Object,
    config: false,
  });
  game.settings.register(MODULE_ID, "stepData", {
    default: {
      step: null,
      original: null,
      active: null,
      inactive: null,
    },
    type: Object,
    config: false,
  });
  game.settings.register(MODULE_ID, "lockLibraries", {
    default: true,
    type: Boolean,
    config: false,
  });
  game.settings.register(MODULE_ID, "mute", {
    default: true,
    type: Boolean,
    config: false,
  });
  game.settings.register(MODULE_ID, "reloadAll", {
    default: false,
    type: Boolean,
    config: false,
  });
}
