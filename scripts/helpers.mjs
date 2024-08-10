import { MODULE, MODULE_ID } from "./constants.mjs";

export function debug(...args) {
  if (MODULE().debug) console.warn(...args);
}

export function cleanOldSettings() {
  const oldSettingsList = ["locks", "stepData", "mute", "lockLibraries", "reloadAll"];
  const clientStorage = game.settings.storage.get("client");
  oldSettingsList.forEach((setting) => clientStorage.removeItem(`${MODULE_ID}.${setting}`));
}

export function actionLabel(name, value) {
  let out = `FindTheCulprit.SelectMods.Action.${name}.Label`;
  if (value !== undefined && typeof value !== "object") out += `.${value ? "Enabled" : "Disabled"}`;
  return out;
}

export function actionTooltip(name, value) {
  let out = `FindTheCulprit.SelectMods.Action.${name}.Tooltip`;
  if (value !== undefined && typeof value !== "object") out += `.${value ? "Enabled" : "Disabled"}`;
  return out;
}

export function lockTooltip(locked, lockLibraries, library) {
  let out = "FindTheCulprit.SelectMods.Lock.Tooltip.";
  if (lockLibraries && library) {
    out += "Forced";
  } else {
    out += locked ? "Locked" : "Unlocked";
  }
  return out;
}
