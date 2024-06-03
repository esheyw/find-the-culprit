import { MODULE_ID } from "../find-the-culprit.mjs";

export class FtCSelectMods extends FormApplication {
  constuctor(object={}, options={}) {
    super(object, options);
  }
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Find the Cuprit",
      template: `modules/${MODULE_ID}/templates/FtCSelectMods.hbs`,
      classes: ["form", "ftc-select-mods"]
    })
  }
}