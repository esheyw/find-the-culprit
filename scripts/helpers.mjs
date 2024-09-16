import { fu, MODULE } from "./constants.mjs";

export function debug(...args) {
  if (MODULE().debug) console.warn(...args.map((a) => fu.deepClone(a)));
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
