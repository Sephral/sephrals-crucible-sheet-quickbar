/**
 * Combat helpers: a hero's quickbar opens and announces itself on its turn, and the GM's combat bar follows the
 * adversary whose turn it is. Quickbars also refresh when targets change or tokens move, so the target display and
 * the range checks of their buttons stay current.
 */

import {MODULE_ID, defaultBarPosition, loadUIState, setting} from "./config.mjs";

/**
 * The quickbar which the GM combat bar opened for the current turn.
 * @type {ApplicationV2|null}
 */
let combatBar = null;

/**
 * Iterate the open Folio quickbars.
 * @returns {Generator<ApplicationV2>}
 */
function* openQuickbars() {
  for ( const app of foundry.applications.instances.values() ) {
    if ( app.constructor.FOLIO && app.rendered && app.isQuickbar ) yield app;
  }
}

/** Re-render open quickbars once targets or token positions settle. */
const refreshQuickbars = foundry.utils.debounce(() => {
  for ( const app of openQuickbars() ) app.render({parts: ["quickbar"]});
}, 120);

/* -------------------------------------------- */

/**
 * Register the hooks of the combat helpers.
 */
export function registerCombatHooks() {
  Hooks.on("combatTurnChange", combat => onTurnChange(combat));
  Hooks.on("deleteCombat", () => closeCombatBar());
  Hooks.on("updateCombat", (combat, changes) => {
    if ( ("active" in changes) && !changes.active ) closeCombatBar();
  });

  Hooks.on("targetToken", user => {
    if ( user === game.user ) refreshQuickbars();
  });
  Hooks.on("updateToken", (token, changes) => {
    if ( !game.user.targets.size ) return;
    if ( ("x" in changes) || ("y" in changes) || ("elevation" in changes) ) refreshQuickbars();
  });
}

/* -------------------------------------------- */

/**
 * React to a new turn on this client.
 * @param {Combat} combat
 * @returns {Promise<void>}
 */
async function onTurnChange(combat) {
  if ( !combat?.started || !combat.isView ) return;
  const actor = combat.combatant?.actor;
  try {
    if ( game.user.isGM ) await followCombatant(combat, actor);
    else await announceOwnTurn(actor);
  } catch(err) {
    console.error(`${MODULE_ID} | Could not open the quickbar for the new turn`, err);
  }
}

/* -------------------------------------------- */

/**
 * Open the quickbar of a player's own hero when its turn begins, and announce the turn.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
async function announceOwnTurn(actor) {
  const sheet = actor?.isOwner ? actor.sheet : null;
  if ( !sheet?.constructor.FOLIO ) return;
  const announce = setting("turnAnnounce");
  if ( setting("turnQuickbar") ) await sheet.showQuickbar({announce});
  else if ( announce ) ui.notifications.info(_loc("FOLIO.TurnStart", {name: actor.name}));
}

/* -------------------------------------------- */

/**
 * Let the GM combat bar follow the turn order: show the quickbar of an adversary whose turn it is, close the bar of the
 * previous one, and select the token so its actions are performed by it.
 * @param {Combat} combat
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
async function followCombatant(combat, actor) {
  if ( !setting("combatBar") ) return;
  const previous = combatBar;
  const sheet = actor?.sheet;
  const follow = !!sheet?.constructor.FOLIO && !actor.hasPlayerOwner;
  if ( !follow ) {
    combatBar = null;
    if ( previous?.folioAutoBar ) await previous.close();
    return;
  }

  const wasOpen = sheet.rendered;
  await sheet.showQuickbar({position: loadUIState().combatBar ?? defaultBarPosition(), auto: !wasOpen});
  combatBar = sheet.folioAutoBar ? sheet : null;
  if ( previous && (previous !== sheet) && previous.folioAutoBar ) await previous.close();

  const token = combat.combatant?.token?.object;
  if ( token && canvas.ready && !token.controlled ) token.control({releaseOthers: true});
}

/* -------------------------------------------- */

/**
 * Close the bar which the combat bar opened, if it is still a combat bar.
 * @returns {Promise<void>}
 */
export async function closeCombatBar() {
  const bar = combatBar;
  combatBar = null;
  if ( bar?.folioAutoBar && bar.rendered ) await bar.close();
}
