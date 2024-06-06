import { MODULE_ID } from "./find-the-culprit.mjs";
export function registerSettings() {
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
}
