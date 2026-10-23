/**
 * Shared constants and client-side UI state for the sheets of Sephral’s Crucible Sheet & Quickbar (internally still
 * called "Folio", the module's earlier name).
 */

export const MODULE_ID = "sephrals-crucible-sheet-quickbar";

/** The id this module had as "Crucible Folio"; its data is migrated once (see migration.mjs). */
export const LEGACY_MODULE_ID = "crucible-folio";
export const TEMPLATES = `modules/${MODULE_ID}/templates`;

/**
 * Read a setting of this module.
 * @param {string} key
 * @returns {*}
 */
export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

/** Versions the module was last verified against; newer versions trigger a hint to run the self-test. */
export const TESTED_VERSIONS = {crucible: "0.11.2", ember: "0.6.3", core: "14.369"};

/** Action sections in display order, with the context tags which sort an action into them. */
export const ACTION_SECTIONS = ["attack", "spell", "summon", "reaction", "movement", "consumable", "general"];
export const ACTION_TAG_SECTIONS = {
  reaction: "reaction",
  strike: "attack",
  spell: "spell",
  iconicSpell: "spell",
  movement: "movement",
  summon: "summon",
  consume: "consumable"
};
export const SECTION_ICONS = {
  favorites: "fa-solid fa-star",
  attack: "fa-solid fa-sword",
  spell: "fa-solid fa-sparkles",
  summon: "fa-solid fa-paw-claws",
  reaction: "fa-solid fa-reply",
  movement: "fa-solid fa-person-running",
  consumable: "fa-solid fa-flask-round-potion",
  general: "fa-solid fa-circle-dot"
};

/** Activation tags which represent a resource cost, mapped to the resource they spend. */
export const COST_TAGS = {ap: "action", fp: "focus", hp: "heroism"};

/** Columns rendered for each inventory section. */
export const INVENTORY_COLUMNS = {
  weapon: ["damage", "range", "weight"],
  armor: ["armor", "dodge", "weight"],
  accessory: ["weight"],
  toolbelt: ["uses", "quantity", "weight"],
  backpack: ["uses", "quantity", "weight"]
};
export const INVENTORY_ICONS = {
  weapon: "fa-solid fa-swords",
  armor: "fa-solid fa-shield-halved",
  accessory: "fa-solid fa-ring",
  toolbelt: "fa-solid fa-toolbox",
  backpack: "fa-solid fa-sack"
};
export const TALENT_ICONS = {
  signature: "fa-solid fa-crown",
  active: "fa-solid fa-bolt",
  passive: "fa-solid fa-leaf",
  spell: "fa-solid fa-sparkles"
};

/** Actor flags of this module. */
export const FLAGS = {
  spellFavorites: "spellFavorites",
  favoriteOrder: "favoriteOrder",
  pinnedSkills: "pinnedSkills"
};

/* -------------------------------------------- */

/**
 * A CSS class which makes the sign of a modifier readable at a glance.
 * @param {number} value
 * @returns {"neg"|"pos"|"zero"}
 */
export function signClass(value) {
  if ( value < 0 ) return "neg";
  return value > 0 ? "pos" : "zero";
}

/**
 * Read a CSS color from a Color instance or string.
 * @param {Color|string|undefined} color
 * @returns {string|undefined}
 */
export function cssColor(color) {
  return color?.css ?? color;
}

/* -------------------------------------------- */
/*  Client-side UI State                        */
/* -------------------------------------------- */

const STORAGE_KEY = `${MODULE_ID}.ui`;

/**
 * Read the persisted UI state of this client: collapsed sections, and per actor the lock state, last tab and quickbar.
 * @returns {{collapsed: object, locked: object, tabs: object, quickbar: object}}
 */
export function loadUIState() {
  let state;
  try {
    state = JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || {};
  } catch(err) {
    state = {};
  }
  state.collapsed ??= {};
  state.locked ??= {};
  state.tabs ??= {};
  state.quickbar ??= {};
  return state;
}

/**
 * Persist the UI state of this client.
 * @param {object} state
 */
export function saveUIState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch(err) {
    // Storage may be unavailable in private windows; the sheet still works without persistence.
  }
}

/**
 * Read and modify the UI state in one step.
 * @param {(state: object) => void} fn
 */
export function updateUIState(fn) {
  const state = loadUIState();
  fn(state);
  saveUIState(state);
}

/**
 * Read a per-actor entry, preferring the actor UUID (distinct for token actors) and falling back to the plain id
 * which earlier versions used.
 * @param {object} bucket   One record of the UI state, e.g. state.tabs
 * @param {Actor} actor
 * @returns {*}
 */
export function actorEntry(bucket, actor) {
  return bucket[actor.uuid] ?? bucket[actor.id];
}

/* -------------------------------------------- */

/**
 * Compare dotted version strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}   Positive if a is newer than b
 */
export function compareVersions(a, b) {
  return foundry.utils.isNewerVersion(a, b) ? 1 : (foundry.utils.isNewerVersion(b, a) ? -1 : 0);
}

/* -------------------------------------------- */

/**
 * The combatant who acts after the current one in this round, or null at the end of the round. Crucible rolls the
 * initiative anew every round, so the order of the next round is not known yet.
 * @param {Combatant[]} turns         The turn order
 * @param {number|null} turn          The index of the current turn
 * @param {boolean} [skipDefeated]    Skip defeated combatants, like the combat tracker setting
 * @returns {Combatant|null}
 */
export function nextInRound(turns, turn, skipDefeated=false) {
  for ( let i = (turn ?? -1) + 1; i < turns.length; i++ ) {
    if ( !skipDefeated || !turns[i].isDefeated ) return turns[i];
  }
  return null;
}

/* -------------------------------------------- */

/**
 * Where a quickbar appears when it has no remembered position: above the hotbar, left of center. Further bars stack
 * upwards so they do not cover each other.
 * @param {number} [stack=0]   How many bars are already open
 * @returns {{left: number, top: number}}
 */
export function defaultBarPosition(stack=0) {
  const left = Math.max(Math.round((window.innerWidth / 2) - 420), 80);
  const top = Math.max(window.innerHeight - 330 - (stack * 165), 80);
  return {left, top};
}
