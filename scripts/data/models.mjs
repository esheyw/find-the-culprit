import { MappingField } from "./fields.mjs";
const fields = foundry.data.fields;

export class FtCSettings extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      modules: new MappingField(new fields.EmbeddedDataField(FtCModule)),
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
export class FtCModule extends foundry.abstract.DataModel {
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
      requires: new fields.SetField(
        new fields.StringField({
          required: true,
          blank: false,
        })
      ),
      dependencyOf: new fields.SetField(
        new fields.StringField({
          required: true,
          blank: false,
        })
      ),
    };
  }
}
