/**
 * Per-user sheet choice: every user decides for themselves whether heroes and adversaries open in the Folio sheet –
 * all of them, heroes only, or single characters. Nobody else is affected: the choice is a user setting, and
 * Foundry's own sheet selection, which is shared by everyone, never offers or picks Folio.
 */

import {MODULE_ID, setting} from "./config.mjs";

/**
 * The Folio sheet class per actor type, filled when the sheets are registered.
 * @type {Record<string, typeof foundry.applications.api.DocumentSheetV2>}
 */
const FOLIO_CLASSES = {};

/* -------------------------------------------- */

/**
 * Register the Folio sheets without offering them in Foundry's sheet configuration, and route the sheet lookup of
 * actors through the choice of the current user.
 * @param {Record<string, {cls: Function, label: string}>} sheets   Folio sheet class and label per actor type
 */
export function registerFolioSheets(sheets) {
  const {DocumentSheetConfig} = foundry.applications.apps;
  for ( const [type, {cls, label}] of Object.entries(sheets) ) {
    FOLIO_CLASSES[type] = cls;
    DocumentSheetConfig.registerSheet(Actor, MODULE_ID, cls, {
      types: [type], label, makeDefault: false, canBeDefault: false, canConfigure: false
    });
  }

  const ActorClass = foundry.documents.Actor;
  const getSheetClass = ActorClass.prototype._getSheetClass;
  ActorClass.prototype._getSheetClass = function() {
    const cls = getSheetClass.call(this);
    if ( !(this.type in FOLIO_CLASSES) || inCharacterCreation(this) ) return cls;
    try {
      if ( wantsFolio(this) ) return FOLIO_CLASSES[this.type];
    } catch(err) {
      console.error(`${MODULE_ID} | Could not read the sheet choice`, err);
    }
    return cls?.FOLIO ? standardSheetClass(this) : cls;
  };

  Hooks.on("getHeaderControlsActorSheetV2", addHeaderControl);
  Hooks.on("getActorContextOptions", addContextOptions);
  Hooks.on("renderDocumentSheetConfig", addSheetConfigChoice);
}

/* -------------------------------------------- */

/** The answers of the first start question in button order: values of the worldDefault setting. */
const WORLD_DEFAULT_CHOICES = {
  heroes: {label: "FOLIO.WELCOME.Heroes", icon: "fa-solid fa-user"},
  all: {label: "FOLIO.WELCOME.All", icon: "fa-solid fa-users"},
  none: {label: "FOLIO.WELCOME.None", icon: "fa-solid fa-user-gear"}
};

/**
 * Ask the GM once per world whether the sheet should be the default for everyone. Until someone chooses it, enabling
 * the module changes nothing anyone sees, so a GM who never opens the settings would not notice it at all. A world
 * which already has a default is asked as well, with that default preselected; closing the window changes nothing.
 * @returns {Promise<void>}
 */
export async function askWorldDefault() {
  if ( !game.user.isGM || (game.users.activeGM && !game.users.activeGM.isSelf) ) return;
  if ( game.settings.get(MODULE_ID, "welcomeShown") ) return;
  await game.settings.set(MODULE_ID, "welcomeShown", true);
  const current = setting("worldDefault");
  const preselect = (current in WORLD_DEFAULT_CHOICES) && (current !== "none") ? current : "heroes";
  const choice = await foundry.applications.api.DialogV2.wait({
    window: {title: "FOLIO.WELCOME.Title", icon: "fa-solid fa-scroll"},
    position: {width: 480},
    // Modal dialogs sit in the browser's top layer, so windows other packages open on ready cannot cover the question
    modal: true,
    content: `<p>${_loc("FOLIO.WELCOME.Text")}</p><p class="hint">${_loc("FOLIO.WELCOME.Hint")}</p>`,
    buttons: Object.entries(WORLD_DEFAULT_CHOICES).map(([action, b]) => ({...b, action, default: action === preselect})),
    rejectClose: false
  });
  if ( (choice in WORLD_DEFAULT_CHOICES) && (choice !== current) ) {
    await game.settings.set(MODULE_ID, "worldDefault", choice);
  }
}

/**
 * Is a hero still in Crucible's character creation? Crucible assigns its creation sheet to new level 0 heroes and
 * clears that sheet once creation is done.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function inCharacterCreation(actor) {
  const creation = crucible.CONFIG?.heroCreationSheet?.name;
  return (actor.type === "hero") && !!creation && (actor.getFlag("core", "sheetClass") === `crucible.${creation}`);
}

/**
 * Does the current user see this actor in the Folio sheet?
 * @param {Actor} actor
 * @returns {boolean}
 */
export function wantsFolio(actor) {
  if ( !(actor?.type in FOLIO_CLASSES) ) return false;
  const choice = actor.pack ? undefined : setting("sheetActors")?.[actor.id];
  if ( typeof choice === "boolean" ) return choice;
  return modeWantsFolio(actor.type);
}

/**
 * The choice of the user's general mode for an actor type, without single-character choices.
 * @param {string} type
 * @returns {boolean}
 */
function modeWantsFolio(type) {
  let mode = setting("sheetMode");
  if ( mode === "world" ) mode = setting("worldDefault");
  return (mode === "all") || ((mode === "heroes") && (type === "hero"));
}

/**
 * Does the current user use the Folio sheet for anything at all?
 * @returns {boolean}
 */
export function folioInUse() {
  return Object.keys(FOLIO_CLASSES).some(modeWantsFolio)
    || Object.values(setting("sheetActors") ?? {}).includes(true);
}

/* -------------------------------------------- */

/**
 * The sheet Foundry would show without Folio: the document's own sheet setting, else the default for its type.
 * @param {Actor} actor
 * @returns {Function}
 */
function standardSheetClass(actor) {
  const sheets = CONFIG.Actor.sheetClasses[actor.type] ?? {};
  const override = actor.getFlag("core", "sheetClass");
  if ( override && sheets[override] && !sheets[override].cls.FOLIO ) return sheets[override].cls;
  const classes = Object.values(sheets).filter(s => !s.cls.FOLIO);
  return (classes.find(s => s.default) ?? classes.find(s => s.canBeDefault) ?? classes.at(-1))?.cls
    ?? foundry.applications.sheets.BaseSheet;
}

/* -------------------------------------------- */

/**
 * Let the current user see one actor in the Folio sheet or in the standard sheet. A choice that matches the general
 * mode is not stored, so changing the mode later still applies to that actor.
 * @param {Actor} actor
 * @param {boolean} useFolio
 * @returns {Promise<void>}
 */
export async function setActorChoice(actor, useFolio) {
  if ( !actor?.id ) return;
  const choices = {...setting("sheetActors")};
  delete choices[actor.id];
  if ( modeWantsFolio(actor.type) !== useFolio ) choices[actor.id] = useFolio;
  await game.settings.set(MODULE_ID, "sheetActors", choices);
}

/**
 * Swap the sheets of actors whose sheet class changed with the user's choice; open sheets reopen in the new one.
 */
export const refreshSheetChoice = foundry.utils.debounce(async () => {
  const actors = new Set(game.actors);
  for ( const scene of game.scenes ) {
    for ( const token of scene.tokens ) {
      const synthetic = token.actorLink ? null : token.delta?.syntheticActor;
      if ( synthetic ) actors.add(synthetic);
    }
  }
  for ( const actor of actors ) {
    const sheet = actor._sheet;
    if ( !sheet || (actor._getSheetClass() === sheet.constructor) ) continue;
    try {
      await actor._onSheetChange();
    } catch(err) {
      console.error(`${MODULE_ID} | Could not switch the sheet of ${actor.name}`, err);
    }
  }
}, 100);

/* -------------------------------------------- */

/**
 * The ⋮ menu of a standard hero or adversary sheet offers to switch this actor to Folio, for the current user only.
 * @param {ApplicationV2} app
 * @param {object[]} controls
 */
function addHeaderControl(app, controls) {
  const actor = app.document;
  if ( app.constructor.FOLIO || !(actor?.type in FOLIO_CLASSES) ) return;
  const registered = Object.values(CONFIG.Actor.sheetClasses[actor.type] ?? {}).some(s => s.cls === app.constructor);
  if ( !registered ) return;
  controls.push({
    icon: "fa-solid fa-book-open", label: "FOLIO.SHEET.UseFolio", action: "foUseFolioSheet",
    onClick: () => setActorChoice(actor, true)
  });
}

/**
 * Foundry's "Configure Sheet" dialog is where users look for another sheet, but its choices apply to everyone. A
 * section of its own at the top offers the personal choice instead.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
function addSheetConfigChoice(app, element) {
  const actor = app.document;
  if ( (actor?.documentName !== "Actor") || !(actor.type in FOLIO_CLASSES) || !actor.id || actor.pack ) return;
  const form = element.querySelector(".window-content section, .window-content") ?? element;
  if ( form.querySelector(".scsq-sheet-choice") ) return;
  const using = wantsFolio(actor);
  const fieldset = document.createElement("fieldset");
  fieldset.className = "scsq-sheet-choice";
  fieldset.innerHTML = `<legend>${_loc("FOLIO.SHEET.ConfigLegend")}</legend>
    <div class="form-group">
      <label for="scsq-sheet-choice-${actor.id}">${_loc("FOLIO.SHEET.ConfigLabel")}</label>
      <div class="form-fields">
        <select id="scsq-sheet-choice-${actor.id}">
          <option value="folio" ${using ? "selected" : ""}>${_loc("FOLIO.SHEET.ConfigFolio")}</option>
          <option value="standard" ${using ? "" : "selected"}>${_loc("FOLIO.SHEET.ConfigStandard")}</option>
        </select>
      </div>
      <p class="hint">${_loc("FOLIO.SHEET.ConfigHint")}</p>
    </div>`;
  // Applied at once, independent of the dialog's save button; the sheet then reopens in the chosen one
  fieldset.querySelector("select").addEventListener("change", event => {
    event.stopPropagation();
    setActorChoice(actor, event.currentTarget.value === "folio");
  });
  form.prepend(fieldset);
  app.setPosition({height: "auto"});
}

/**
 * Right-click on an actor in the actor directory: switch between Folio and the standard sheet, for this user only.
 * @param {ApplicationV2} app
 * @param {object[]} options
 */
function addContextOptions(app, options) {
  const actorOf = li => game.actors.get(li.closest("[data-entry-id]")?.dataset.entryId);
  const eligible = actor => (actor?.type in FOLIO_CLASSES) && actor.testUserPermission(game.user, "LIMITED");
  options.push({
    label: "FOLIO.SHEET.UseFolio",
    icon: "fa-solid fa-book-open",
    visible: li => {
      const actor = actorOf(li);
      return eligible(actor) && !wantsFolio(actor);
    },
    onClick: (event, li) => setActorChoice(actorOf(li), true)
  }, {
    label: "FOLIO.SHEET.UseStandard",
    icon: "fa-solid fa-scroll",
    visible: li => {
      const actor = actorOf(li);
      return eligible(actor) && wantsFolio(actor);
    },
    onClick: (event, li) => setActorChoice(actorOf(li), false)
  });
}
