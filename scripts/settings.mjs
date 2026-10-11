/**
 * Folio settings: like in every Sephral module, all options appear in Foundry's settings dialog under this module,
 * starting with the module language. User settings follow the user to every device; world settings apply to everyone.
 */

import {MODULE_ID} from "./config.mjs";
import {closeCombatBar} from "./combat.mjs";
import {FOLLOW_FOUNDRY, applyModuleLanguage} from "./language.mjs";
import {runSelfTest} from "./selftest.mjs";
import {refreshSheetChoice} from "./sheet-choice.mjs";

/**
 * @typedef FolioSettingDefinition
 * @property {Function} type                  Boolean, String or Number
 * @property {*} default
 * @property {Record<string, string>} [choices]
 * @property {Record<string, string>} [choiceModules]  Choices which are only offered while this module is active
 * @property {{min: number, max: number, step: number}} [range]
 * @property {"user"|"world"|"client"} [scope="user"]
 * @property {boolean} [gm]                   Only shown to the GM
 * @property {boolean} [requiresReload]
 * @property {boolean} [hidden]               Stored, but not shown in the settings dialog
 * @property {Function} [onChange]            Called in addition to refreshing open sheets
 */

/**
 * The settings of the module, grouped by topic in the order they appear in the settings dialog.
 * @type {{id: string, settings: Record<string, FolioSettingDefinition>}[]}
 */
export const SETTINGS = [
  {id: "language", settings: {
    uiLanguage: {type: String, default: FOLLOW_FOUNDRY, scope: "client", onChange: onLanguageChange, choices: {
      [FOLLOW_FOUNDRY]: "FOLIO.LANGUAGE.default", de: "FOLIO.LANGUAGE.de", en: "FOLIO.LANGUAGE.en"}}
  }},
  {id: "sheet", settings: {
    sheetMode: {type: String, default: "world", onChange: () => refreshSheetChoice(), choices: {
      world: "FOLIO.SETTINGS.SheetMode.world", all: "FOLIO.SETTINGS.SheetMode.all",
      heroes: "FOLIO.SETTINGS.SheetMode.heroes", chosen: "FOLIO.SETTINGS.SheetMode.chosen"}},
    worldDefault: {type: String, default: "none", scope: "world", gm: true, onChange: () => refreshSheetChoice(), choices: {
      none: "FOLIO.SETTINGS.WorldDefault.none", heroes: "FOLIO.SETTINGS.WorldDefault.heroes",
      all: "FOLIO.SETTINGS.WorldDefault.all"}},
    sheetActors: {type: Object, default: {}, hidden: true, onChange: () => refreshSheetChoice()}
  }},
  {id: "display", settings: {
    theme: {type: String, default: "dark",
      choices: {dark: "FOLIO.SETTINGS.Theme.dark", light: "FOLIO.SETTINGS.Theme.light"}},
    background: {type: String, default: "glass", choiceModules: {ember: "ember"}, choices: {
      solid: "FOLIO.SETTINGS.Background.solid", crucible: "FOLIO.SETTINGS.Background.crucible",
      ember: "FOLIO.SETTINGS.Background.ember", glass: "FOLIO.SETTINGS.Background.glass"}},
    backgroundOpacity: {type: Number, default: 0.3, range: {min: 0.3, max: 1, step: 0.05}},
    compactMode: {type: Boolean, default: true},
    quickbarOpacity: {type: Number, default: 0.6, range: {min: 0.2, max: 1, step: 0.05}, onChange: applyOpacity},
    headerDblClick: {type: Boolean, default: true},
    conditionRounds: {type: Boolean, default: true}
  }},
  {id: "play", settings: {
    quickUse: {type: Boolean, default: false},
    costPreview: {type: Boolean, default: true},
    repeatSpell: {type: Boolean, default: true},
    spellDialogStrip: {type: Boolean, default: true},
    hostileHealConfirm: {type: Boolean, default: true}
  }},
  {id: "targets", settings: {
    quickbarTargets: {type: Boolean, default: true},
    targetChecks: {type: Boolean, default: true}
  }},
  {id: "combat", settings: {
    turnQuickbar: {type: Boolean, default: true},
    turnAnnounce: {type: Boolean, default: true},
    combatBar: {type: Boolean, default: true, gm: true, onChange: enabled => enabled || closeCombatBar()},
    autoFillAdversaries: {type: Boolean, default: true, gm: true}
  }}
];

/* -------------------------------------------- */

/**
 * The localization prefix of a setting.
 * @param {string} key
 * @returns {string}
 */
export function labelKey(key) {
  return `FOLIO.SETTINGS.${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

/**
 * The choices a setting offers, without those which need an inactive module.
 * @param {FolioSettingDefinition} def
 * @param {(id: string) => boolean} isActive    Is the module with this id active?
 * @returns {Record<string, string>|undefined}
 */
export function offeredChoices(def, isActive) {
  if ( !def.choices ) return undefined;
  return Object.fromEntries(Object.entries(def.choices)
    .filter(([id]) => !def.choiceModules?.[id] || isActive(def.choiceModules[id])));
}

/** Re-render open Folio sheets once after one or several settings changed. */
const refreshSheets = foundry.utils.debounce(() => {
  for ( const app of foundry.applications.instances.values() ) {
    if ( app.constructor.FOLIO && app.rendered ) app.render();
  }
}, 50);

/**
 * Apply the quickbar opacity to open sheets without re-rendering them.
 * @param {number} value
 */
function applyOpacity(value) {
  for ( const app of foundry.applications.instances.values() ) {
    if ( app.constructor.FOLIO && app.rendered ) app.element.style.setProperty("--fo-qb-idle", String(value));
  }
}

/**
 * Switch the module strings when the user picks another module language.
 * @param {string} value
 */
function onLanguageChange(value) {
  applyModuleLanguage(value).then(refreshSheets);
}

/* -------------------------------------------- */

/**
 * The menu button which runs the self-test. Foundry only accepts application classes as menus; this one runs the test
 * instead of opening a window.
 */
class FolioSelfTestMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    if ( game.user.isGM ) await runSelfTest();
    return this;
  }
}

/* -------------------------------------------- */

/**
 * Register all settings of the module and the self-test menu button.
 */
export function registerSettings() {
  const isActive = id => !!game.modules.get(id)?.active;
  for ( const group of SETTINGS ) {
    for ( const [key, def] of Object.entries(group.settings) ) {
      const type = def.range
        ? new foundry.data.fields.NumberField({...def.range, initial: def.default})
        : def.type;
      game.settings.register(MODULE_ID, key, {
        name: `${labelKey(key)}.name`,
        hint: `${labelKey(key)}.hint`,
        scope: def.scope ?? "user",
        config: !def.hidden,
        type,
        choices: offeredChoices(def, isActive),
        default: def.default,
        requiresReload: !!def.requiresReload,
        onChange: value => {
          def.onChange?.(value);
          if ( !def.requiresReload ) refreshSheets();
        }
      });
    }
  }

  // Once-markers of the migration from the module's earlier id
  game.settings.register(MODULE_ID, "migratedUser", {scope: "user", config: false, type: Boolean, default: false});
  game.settings.register(MODULE_ID, "migratedWorld", {scope: "world", config: false, type: Boolean, default: false});

  game.settings.register(MODULE_ID, "acknowledgedVersions", {
    scope: "client",
    config: false,
    type: String,
    default: ""
  });

  game.settings.registerMenu(MODULE_ID, "selfTest", {
    name: "FOLIO.SELFTEST.Title",
    label: "FOLIO.SELFTEST.Run",
    hint: "FOLIO.SELFTEST.Hint",
    icon: "fa-solid fa-stethoscope",
    type: FolioSelfTestMenu,
    restricted: true
  });
}

/**
 * Hide the GM's personal options from players. Runs at setup, when the current user is known.
 */
export function hideGMSettings() {
  if ( game.user.isGM ) return;
  for ( const group of SETTINGS ) {
    for ( const [key, def] of Object.entries(group.settings) ) {
      if ( def.gm ) game.settings.settings.get(`${MODULE_ID}.${key}`).config = false;
    }
  }
}

/**
 * Open Foundry's settings dialog on the page of this module.
 */
export function openSettings() {
  const app = game.settings.sheet;
  if ( !app.rendered ) return app.render({force: true, tab: {categories: MODULE_ID}});
  app.changeTab(MODULE_ID, "categories");
  app.bringToFront();
}
