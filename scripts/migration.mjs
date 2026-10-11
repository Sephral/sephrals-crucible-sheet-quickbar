/**
 * Migration from "Crucible Folio", the earlier name of this module (id "crucible-folio"): the data stored under the
 * old id is copied once to the new one. Nothing is deleted, so the old data stays available for a rollback.
 *
 * - every user: their own user settings (sheet choice, display, controls …) and the browser's UI state
 * - the GM: world settings and the actor flags (spellbook, favorite order, pinned skills) of world actors and of
 *   unlinked tokens
 */

import {LEGACY_MODULE_ID, MODULE_ID} from "./config.mjs";
import {SETTINGS} from "./settings.mjs";

/**
 * Copy the data of the old module id once; run when the game is ready.
 * @returns {Promise<void>}
 */
export async function migrateLegacyData() {
  try {
    migrateBrowserState();
    if ( !game.settings.get(MODULE_ID, "migratedUser") ) {
      await migrateSettings("user");
      await game.settings.set(MODULE_ID, "migratedUser", true);
    }
    if ( game.user.isGM && !game.settings.get(MODULE_ID, "migratedWorld") ) {
      await migrateSettings("world");
      const actors = await migrateActorFlags();
      await game.settings.set(MODULE_ID, "migratedWorld", true);
      if ( actors ) ui.notifications.info(_loc("FOLIO.MIGRATION.Done", {actors}));
    }
  } catch(err) {
    console.error(`${MODULE_ID} | Migration from ${LEGACY_MODULE_ID} failed`, err);
  }
}

/* -------------------------------------------- */

/**
 * Copy the stored values of the old id for settings of one scope, unless the new id already has a value.
 * @param {"user"|"world"} scope
 * @returns {Promise<number>}   The number of copied settings
 */
async function migrateSettings(scope) {
  const storage = game.settings.storage.get("world");
  const user = (scope === "user") ? game.user.id : null;
  let copied = 0;
  for ( const group of SETTINGS ) {
    for ( const [key, def] of Object.entries(group.settings) ) {
      if ( (def.scope ?? "user") !== scope ) continue;
      const legacy = storage.getSetting(`${LEGACY_MODULE_ID}.${key}`, user);
      if ( !legacy || storage.getSetting(`${MODULE_ID}.${key}`, user) ) continue;
      let value;
      try {
        value = JSON.parse(legacy._source.value);
      } catch(err) {
        continue;
      }
      if ( (value === null) || (value === undefined) ) continue;
      await game.settings.set(MODULE_ID, key, value);
      copied++;
    }
  }
  return copied;
}

/**
 * Copy the browser's UI state (tabs, lock state, quickbar positions) unless this browser already has one.
 */
function migrateBrowserState() {
  try {
    const legacy = window.localStorage.getItem(`${LEGACY_MODULE_ID}.ui`);
    if ( legacy && !window.localStorage.getItem(`${MODULE_ID}.ui`) ) {
      window.localStorage.setItem(`${MODULE_ID}.ui`, legacy);
    }
  } catch(err) {
    // Storage may be unavailable in private windows
  }
}

/**
 * Copy the flags of the old id on world actors and on the actors of unlinked tokens.
 * @returns {Promise<number>}   The number of migrated actors
 */
async function migrateActorFlags() {
  const legacyFlags = source => source?.flags?.[LEGACY_MODULE_ID];
  const needsCopy = source => !foundry.utils.isEmpty(legacyFlags(source) ?? {}) && !source.flags?.[MODULE_ID];

  const updates = game.actors.filter(a => needsCopy(a._source)).map(a => ({
    _id: a.id, [`flags.${MODULE_ID}`]: foundry.utils.deepClone(legacyFlags(a._source))
  }));
  if ( updates.length ) await Actor.implementation.updateDocuments(updates);

  let tokens = 0;
  for ( const scene of game.scenes ) {
    for ( const token of scene.tokens ) {
      if ( token.actorLink || !needsCopy(token.delta?._source) ) continue;
      await token.delta.update({[`flags.${MODULE_ID}`]: foundry.utils.deepClone(legacyFlags(token.delta._source))});
      tokens++;
    }
  }
  return updates.length + tokens;
}
