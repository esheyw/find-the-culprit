import { MappingField } from "./fields.mjs";
const fields = foundry.data.fields;
const ModuleIDField = () =>
  new fields.StringField({
    required: true,
    blank: false,
  });
const ModuleIDsField = () => new fields.SetField(ModuleIDField());

export class FtCSettingsModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      locks: ModuleIDsField(),
      original: ModuleIDsField(),
      active: ModuleIDsField(),
      inactive: ModuleIDsField(),
      selected: ModuleIDsField(),
      currentStep: new fields.NumberField({ nullable: true, required: false, integer: true }),
      maxSteps: new fields.NumberField({ nullable: true, required: false, min: 0, integer: true }),
      mute: new fields.BooleanField(),
      lockLibraries: new fields.BooleanField(),
      reloadAll: new fields.BooleanField(),
      zero: new fields.BooleanField(),
    };
  }
}
export class FtCSettingsModel2 extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      modules: new MappingField(new fields.EmbeddedDataField(FtCModuleModel)),
      currentStep: new fields.NumberField({ nullable: true, required: false, integer: true }),
      maxSteps: new fields.NumberField({ nullable: true, required: false, min: 0, integer: true }),
      mute: new fields.BooleanField(),
      lockLibraries: new fields.BooleanField({
        initial: true,
      }),
      reloadAll: new fields.BooleanField(),
      zero: new fields.BooleanField(),
      deterministic: new fields.BooleanField(),
    };
  }
}
export class FtCModuleModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      id: new fields.StringField({
        required: true,
        nullable: false,
        blank: false,
      }),
      pinned: new fields.BooleanField({
        nullable: true,
      }),
      priorPinned: new fields.BooleanField({
        required: false,
        nullable: true,
        initial: undefined,
      }),
      active: new fields.BooleanField({
        nullable: true,
        initial: true,
      }),
      originallyActive: new fields.BooleanField(),
      requires: ModuleIDsField(),
      dependencyOf: ModuleIDsField(),
    };
  }
}
