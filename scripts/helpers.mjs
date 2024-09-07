import { fu, MODULE, MODULE_ID } from "./constants.mjs";

export function debug(...args) {
  if (MODULE().debug) console.warn(...args.map((a) => fu.deepClone(a)));
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

export function getDependencies(mod, { inner = false, pinned = new Set() } = {}) {
  mod = mod instanceof foundry.packages.BaseModule ? mod : game.modules.get(mod);
  pinned = pinned instanceof Set ? pinned : new Set(pinned);
  const modDeps = [...mod.relationships.requires].filter((r) => r.type === "module");
  const requires = [];
  if (inner) requires.push(mod.id);
  requires.push(...modDeps.flatMap((d) => getDependencies(d.id, { inner: true, pinned })));
  const out = [...new Set(requires)];
  console.warn({ name: mod.title, modDeps, out, filtered: out.filter((r) => !pinned.has(r)) });
  return inner ? out : out.filter((r) => !pinned.has(r));
}

export function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export function oxfordList(list, { and = "and" } = {}) {
  list = (Array.isArray(list) ? list : [list]).filter((e) => !!e).map((e) => String(e));
  if (list.length <= 1) return list?.[0] ?? "";
  if (list.length === 2) return list.join(` ${and} `);
  const last = list.at(-1);
  const others = list.splice(0, list.length - 1);
  return `${others.join(", ")}, ${and} ${last}`;
}