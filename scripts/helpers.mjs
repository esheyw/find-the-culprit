import { fu, MODULE, MODULE_ID } from "./constants.mjs";

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

export function modTitle(modID) {
  return game.modules.get(modID)?.title || "";
}

export function getDependencies(mod, inner = false) {
  mod = mod instanceof foundry.packages.BaseModule ? mod : game.modules.get(mod);
  const modDeps = [...mod.relationships.requires].filter((r) => r.type === "module");
  const out = [];
  if (inner) out.push(mod.id);
  out.push(...modDeps.flatMap((d) => getDependencies(d.id, true)));
  return [...new Set(out)];
}

export function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
