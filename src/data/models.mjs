import { MappingField } from "./fields.mjs";
const fields = foundry.data.fields;

export class FindTheCulpritData extends foundry.abstract.DataModel {
  get originalSearchablesCount() {
    return Object.values(this.modules).filter((m) => m.pinned === false && m.originallyActive).length;
  }

  get maxSteps() {
    return Math.ceil(Math.log2(this.originalSearchablesCount)) + 1;
  }

  get searchablesCount() {
    return Object.values(this.modules).filter((m) => m.pinned === false && m.originallyActive && m.active !== null)
      .length;
  }

  get remainingSteps() {
    const count = this.searchablesCount;
    //return 0 for single searchable for the confirm step
    return count > 1 ?Math.ceil(Math.log2(this.searchablesCount)) : 0;
  }

  static defineSchema() {
    return {
      modules: new MappingField(new fields.EmbeddedDataField(FindTheCulpritModuleData)),
      currentStep: new fields.NumberField({ nullable: true, required: false, integer: true }),
      mute: new fields.BooleanField(),
      lockLibraries: new fields.BooleanField({
        initial: true,
      }),
      reloadAll: new fields.BooleanField({
        initial: true,
      }),
      zero: new fields.BooleanField(),
      deterministic: new fields.BooleanField(),
      instructionsAcknowledged: new fields.BooleanField(),
    };
  }
}
export class FindTheCulpritModuleData extends foundry.abstract.DataModel {
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
