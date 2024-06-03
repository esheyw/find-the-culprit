import { MODULE_ID } from "./find-the-culprit.mjs";
export function registerSettings() {
  game.settings.register(MODULE_ID, "modules", {
    default: {},
    type: Object,
    config: false,
  });
  game.settings.register(MODULE_ID, "locks", {
    default: {},
    type: Object,
    config: false,
  });
}
