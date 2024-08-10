import { MODULE_ID } from "./constants.mjs";
const fields = foundry.data.fields;
const ModuleIDField = () =>
  new fields.SetField(
    new fields.StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: () => game.modules.map((m) => m.id),
      validate: (value) => !!game.modules.get(value),
      validationError: "is not an installed module ID.",
    })
  );
class FtCSettingsModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      locks: ModuleIDField(),
      original: ModuleIDField(),
      active: ModuleIDField(),
      inactive: ModuleIDField(),
      selected: ModuleIDField(),
      runState: new fields.NumberField({ choices: [0, 1, 2], initial: 0, integer: true }),
      maxSteps: new fields.NumberField({ nullable: true, required: false, min: 0, integer: true }),
      mute: new fields.BooleanField(),
      lockLibraries: new fields.BooleanField(),
      reloadAll: new fields.BooleanField(),
    };
  }
}
export function registerSettings() {
  game.settings.register(MODULE_ID, "data", {
    type: FtCSettingsModel,
    config: false,
    name: "FTC.Setting.Data.Name",
    hint: "FTC.Setting.Data.Hint",
    scope: "world",
    default: {
      locks: [],
      original: [],
      active: [],
      chosen: [],
      runState: 0,
      toggles: {
        mute: false,
        lockLibraries: false,
        reloadAll: true,
      },
    },
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
