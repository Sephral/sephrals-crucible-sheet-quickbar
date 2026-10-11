import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// settings.mjs and the modules it imports touch these Foundry APIs at import time
globalThis.foundry = {
  utils: {debounce: fn => fn},
  applications: {api: {ApplicationV2: class {}}}
};

const {SETTINGS, labelKey} = await import("../scripts/settings.mjs");
const {ACTION_SECTIONS, INVENTORY_COLUMNS} = await import("../scripts/config.mjs");

/**
 * All keys of a nested translation object, dotted.
 * @param {object} object
 * @param {string} [prefix]
 * @returns {string[]}
 */
function keysOf(object, prefix="") {
  return Object.entries(object).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    return (value && (typeof value === "object")) ? keysOf(value, full) : [full];
  });
}

/**
 * All files below a directory.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function filesIn(dir) {
  const entries = await readdir(dir, {withFileTypes: true});
  const nested = await Promise.all(entries.map(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? filesIn(full) : [full];
  }));
  return nested.flat();
}

const en = JSON.parse(await readFile(path.join(root, "lang/en.json"), "utf8"));
const de = JSON.parse(await readFile(path.join(root, "lang/de.json"), "utf8"));
const enKeys = new Set(keysOf(en));
const isModuleKey = key => key.startsWith("FOLIO.");

test("English and German have the same module keys", () => {
  assert.deepEqual(keysOf(de).filter(isModuleKey).sort(), [...enKeys].filter(isModuleKey).sort());
});

test("English only contains module keys", () => {
  assert.deepEqual(Object.keys(en), ["FOLIO"]);
});

test("German additions outside FOLIO only supplement Crucible's own namespaces", () => {
  const namespaces = new Set(keysOf(de).filter(key => !isModuleKey(key)).map(key => key.split(".")[0]));
  assert.deepEqual([...namespaces].sort(), ["ACTOR", "ADVANCEMENT", "DEFENSES", "TRAINING"]);
});

test("every key used by scripts and templates exists", async () => {
  const files = [...await filesIn(path.join(root, "scripts")), ...await filesIn(path.join(root, "templates"))];
  const used = new Set();
  for ( const file of files ) {
    const text = await readFile(file, "utf8");
    // Quoted in scripts, or bare inside data-tooltip attributes of the templates; a trailing dot marks a prefix
    for ( const [, key, dot] of text.matchAll(/(?<![\w.])(FOLIO(?:\.\w+)+)(\.?)/g) ) {
      if ( !dot ) used.add(key);
    }
  }

  // Keys built from a prefix at runtime
  for ( const group of SETTINGS ) {
    for ( const [key, def] of Object.entries(group.settings) ) {
      for ( const label of Object.values(def.choices ?? {}) ) used.add(label);
      if ( def.hidden ) continue;
      used.add(`${labelKey(key)}.name`);
      used.add(`${labelKey(key)}.hint`);
    }
  }
  for ( const id of ["favorites", ...ACTION_SECTIONS] ) used.add(`FOLIO.ACTIONS.${id}`);
  for ( const id of new Set(Object.values(INVENTORY_COLUMNS).flat()) ) used.add(`FOLIO.COLUMNS.${id}`);
  for ( const id of ["action", "focus", "heroism", "fortitude", "reflex", "willpower"] ) used.add(`FOLIO.QB.${id}`);
  for ( const id of ["physical", "fortitude", "reflex", "willpower"] ) used.add(`FOLIO.DEFENSE.${id}`);
  for ( const id of ["play", "inventory", "talents", "training", "spells", "effects", "attunement", "biography"] ) {
    used.add(`FOLIO.TABS.${id}`);
  }

  // A namespace such as the tab label prefix counts when it holds keys; its entries are listed above
  const isNamespace = key => [...enKeys].some(k => k.startsWith(`${key}.`));
  const missing = [...used].filter(key => !enKeys.has(key) && !isNamespace(key));
  assert.deepEqual(missing, []);
});
