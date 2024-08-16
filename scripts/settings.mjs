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
      currentStep: new fields.NumberField({ nullable: true, required: false, integer: true }),
      maxSteps: new fields.NumberField({ nullable: true, required: false, min: 0, integer: true }),
      mute: new fields.BooleanField(),
      lockLibraries: new fields.BooleanField(),
      reloadAll: new fields.BooleanField(),
      zero: new fields.BooleanField(),
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
      inactive: [],
      selected: [],
      currentStep: null,
      maxSteps: null,
      mute: false,
      lockLibraries: false,
      reloadAll: true,
    },
  });
  game.settings.register(MODULE_ID, "cleaned", {
    type: new fields.BooleanField(),
    config: false,
    scope: "world",
  })
}
