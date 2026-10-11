import {LEGACY_MODULE_ID, MODULE_ID, TESTED_VERSIONS, compareVersions, loadUIState} from "./config.mjs";
import {migrateLegacyData} from "./migration.mjs";
import {createFolioSheets} from "./folio-sheet.mjs";
import {castSpellFavorite, getSpellFavorites, openSpellComposer, registerSpellDialogHooks} from "./spell-favorites.mjs";
import {runSelfTest} from "./selftest.mjs";
import {registerCombatHooks} from "./combat.mjs";
import {FolioSettingsMenu, registerSettings} from "./settings.mjs";
import {folioInUse, registerFolioSheets} from "./sheet-choice.mjs";

/** The partial templates shared between several tabs of the sheet. */
const PARTIALS = {
  "folio.cost": `modules/${MODULE_ID}/templates/partials/cost.hbs`,
  "folio.action-row": `modules/${MODULE_ID}/templates/partials/action-row.hbs`,
  "folio.section-head": `modules/${MODULE_ID}/templates/partials/section-head.hbs`,
  "folio.condition": `modules/${MODULE_ID}/templates/partials/condition.hbs`
};

/**
 * Iterate the open Folio sheets.
 * @returns {Generator<ApplicationV2>}
 */
function* openFolioSheets() {
  for ( const app of foundry.applications.instances.values() ) {
    if ( app.constructor.FOLIO && app.rendered ) yield app;
  }
}

/* -------------------------------------------- */

/** Is the module active with its earlier id as well? Then this copy stays idle and asks the GM to disable one. */
const legacyActive = () => !!game.modules.get(LEGACY_MODULE_ID)?.active;

Hooks.once("init", () => {
  if ( (game.system.id !== "crucible") || legacyActive() ) return;

  registerSettings();
  registerSheets();
  registerSpellDialogHooks();
  registerCombatHooks();
  foundry.applications.handlebars.loadTemplates(PARTIALS);

  // Re-render the header of open sheets when the combat turn changes, so the turn indicator stays current
  const refreshCombat = () => {
    for ( const app of openFolioSheets() ) app.render({parts: ["header"]});
  };
  for ( const hook of ["updateCombat", "deleteCombat", "createCombatant", "deleteCombatant", "updateCombatant"] ) {
    Hooks.on(hook, refreshCombat);
  }

  game.modules.get(MODULE_ID).api = {
    devReload, runSelfTest, castSpellFavorite, getSpellFavorites, openSpellComposer,
    openSettings: () => new FolioSettingsMenu().render({force: true})
  };
});

/* -------------------------------------------- */

Hooks.once("ready", async () => {
  if ( game.system.id !== "crucible" ) return;
  if ( legacyActive() ) {
    if ( game.user.isGM ) ui.notifications.warn(_loc("FOLIO.MIGRATION.LegacyActive"), {permanent: true});
    return;
  }
  await migrateLegacyData();
  reopenQuickbars();
  noticeNewVersions();
});

/* -------------------------------------------- */

/**
 * Register the Folio sheets; which actors open in them is every user's own choice (see sheet-choice.mjs).
 */
function registerSheets() {
  const {FolioHeroSheet, FolioAdversarySheet} = createFolioSheets();
  registerFolioSheets({
    hero: {cls: FolioHeroSheet, label: "FOLIO.SheetLabel"},
    adversary: {cls: FolioAdversarySheet, label: "FOLIO.SheetLabelAdversary"}
  });
}

/* -------------------------------------------- */

/**
 * Reopen quickbars which were open when the client was last closed or reloaded.
 */
function reopenQuickbars() {
  for ( const [key, entry] of Object.entries(loadUIState().quickbar) ) {
    if ( !entry?.on || !entry.open ) continue;
    const actor = key.includes(".") ? fromUuidSync(key) : game.actors.get(key);
    if ( !actor?.isOwner || !actor.sheet?.constructor.FOLIO ) continue;
    actor.sheet.render({force: true});
  }
}

/* -------------------------------------------- */

/**
 * Tell the GM once when Crucible, Ember or Foundry is newer than the versions Folio was verified against.
 */
function noticeNewVersions() {
  if ( !game.user.isGM || !folioInUse() ) return;
  const current = {
    crucible: game.system.version,
    ember: game.modules.get("ember")?.active ? game.modules.get("ember").version : null,
    core: game.version
  };
  const newer = Object.entries(current)
    .filter(([id, version]) => version && (compareVersions(version, TESTED_VERSIONS[id]) > 0))
    .map(([id, version]) => `${id} ${version}`);
  if ( !newer.length ) return;
  const signature = newer.join(",");
  if ( game.settings.get(MODULE_ID, "acknowledgedVersions") === signature ) return;
  game.settings.set(MODULE_ID, "acknowledgedVersions", signature);
  ui.notifications.info(_loc("FOLIO.SELFTEST.NewVersions", {versions: newer.join(", ")}), {permanent: true});
}

/* -------------------------------------------- */

/**
 * Development helper: reload templates and styles and re-render open Folio sheets. Script changes need a client
 * reload, because the sheet modules import each other.
 * @returns {Promise<void>}
 */
async function devReload() {
  const stamp = Date.now();
  for ( const id of Object.keys(Handlebars.partials) ) {
    if ( id.includes(MODULE_ID) || id.startsWith("folio.") ) delete Handlebars.partials[id];
  }
  await foundry.applications.handlebars.loadTemplates(PARTIALS);
  // Module styles are imported into a cascade layer by a <style> element; re-import with a cache buster
  const pattern = new RegExp(`modules/${MODULE_ID}/styles/scsq\\.css[^"']*`);
  for ( const style of document.querySelectorAll("style") ) {
    if ( pattern.test(style.textContent) ) {
      style.textContent = style.textContent.replace(pattern, `modules/${MODULE_ID}/styles/scsq.css?v=${stamp}`);
    }
  }
  for ( const app of openFolioSheets() ) await app.render({force: true});
}
