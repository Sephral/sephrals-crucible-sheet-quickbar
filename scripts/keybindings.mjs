/**
 * Keybindings: switch between sheet and quickbar, end your turn, and use the first nine buttons of the open quickbar.
 * They have no default keys, because core already uses the digits (macros), Alt with the digits (macro pages) and Q/E
 * (rotation); every user assigns them under Configure Controls.
 */

import {MODULE_ID} from "./config.mjs";

/** How many quickbar buttons get a keybinding of their own. */
const BUTTON_KEYS = 9;

/**
 * The actor the keys act on: the actor of the single controlled token, else the user's own character.
 * @returns {Actor|null}
 */
function activeActor() {
  const controlled = canvas.ready ? canvas.tokens.controlled : [];
  if ( controlled.length === 1 ) return controlled[0].actor;
  return game.user.character ?? null;
}

/**
 * The Folio sheet of an actor, if the user sees it in this sheet.
 * @param {Actor|null} actor
 * @returns {ApplicationV2|null}
 */
function folioSheet(actor) {
  const sheet = actor?.sheet;
  return sheet?.constructor.FOLIO ? sheet : null;
}

/* -------------------------------------------- */

/**
 * Open the quickbar of the active actor, or switch an open sheet between full sheet and quickbar.
 * @returns {boolean}   Was the key handled?
 */
function onToggleQuickbar() {
  const sheet = folioSheet(activeActor());
  if ( !sheet ) return false;
  if ( sheet.rendered ) sheet.toggleQuickbar();
  else sheet.showQuickbar();
  return true;
}

/**
 * End the current turn if it belongs to this user (the GM may end any turn).
 * @returns {boolean}   Was the key handled?
 */
function onEndTurn() {
  const combat = game.combat;
  if ( !combat?.started ) return false;
  if ( !game.user.isGM && !combat.combatant?.isOwner ) return false;
  game.tooltip.deactivate();
  combat.nextTurn().catch(err => ui.notifications.warn(err.message));
  return true;
}

/**
 * Use one of the buttons of the open quickbar, exactly like a click: the quickbar of the active actor, else the only
 * open quickbar.
 * @param {number} index    The button number, starting at 1
 * @returns {boolean}       Was the key handled?
 */
function onUseButton(index) {
  const sheet = folioSheet(activeActor());
  let bar = (sheet?.rendered && sheet.isQuickbar) ? sheet : null;
  if ( !bar ) {
    const open = [...foundry.applications.instances.values()].filter(a => a.constructor.FOLIO && a.rendered && a.isQuickbar);
    if ( open.length === 1 ) bar = open[0];
  }
  const button = bar?.element.querySelectorAll(".fo-qb-actions .fo-qb-action")[index - 1];
  if ( !button ) return false;
  button.click();
  return true;
}

/* -------------------------------------------- */

/**
 * Register the keybindings. Runs at i18nInit, before Foundry initializes the keybindings, so the numbered names can be
 * formatted.
 */
export function registerKeybindings() {
  game.keybindings.register(MODULE_ID, "toggleQuickbar", {
    name: "FOLIO.KEYS.ToggleQuickbar.name",
    hint: "FOLIO.KEYS.ToggleQuickbar.hint",
    editable: [],
    onDown: onToggleQuickbar
  });
  game.keybindings.register(MODULE_ID, "endTurn", {
    name: "FOLIO.KEYS.EndTurn.name",
    hint: "FOLIO.KEYS.EndTurn.hint",
    editable: [],
    onDown: onEndTurn
  });
  for ( let n = 1; n <= BUTTON_KEYS; n++ ) {
    game.keybindings.register(MODULE_ID, `useButton${n}`, {
      name: _loc("FOLIO.KEYS.UseButton.name", {n}),
      hint: _loc("FOLIO.KEYS.UseButton.hint", {n}),
      editable: [],
      onDown: () => onUseButton(n)
    });
  }
}
