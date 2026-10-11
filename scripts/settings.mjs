/**
 * Folio settings: every option of the module, switched on and off in one grouped menu instead of the long core
 * settings list. User settings follow the user to every device; world settings apply to everyone.
 */

import {MODULE_ID, TEMPLATES, setting} from "./config.mjs";
import {closeCombatBar} from "./combat.mjs";
import {runSelfTest} from "./selftest.mjs";
import {refreshSheetChoice} from "./sheet-choice.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/**
 * @typedef FolioSettingDefinition
 * @property {Function} type                  Boolean, String or Number
 * @property {*} default
 * @property {Record<string, string>} [choices]
 * @property {Record<string, string>} [choiceModules]  Choices which are only offered while this module is active
 * @property {{min: number, max: number, step: number}} [range]
 * @property {"user"|"world"} [scope="user"]
 * @property {boolean} [gm]                   Only offered to the GM
 * @property {boolean} [requiresReload]
 * @property {boolean} [hidden]               Stored, but not shown as a field in the menu
 * @property {Function} [onChange]            Called in addition to refreshing open sheets
 */

/**
 * The settings of the module, grouped as they appear in the menu.
 * @type {{id: string, icon: string, gm?: boolean, settings: Record<string, FolioSettingDefinition>}[]}
 */
export const SETTINGS = [
  {id: "sheet", icon: "fa-solid fa-book-open", settings: {
    sheetMode: {type: String, default: "world", onChange: () => refreshSheetChoice(), choices: {
      world: "FOLIO.SETTINGS.SheetMode.world", all: "FOLIO.SETTINGS.SheetMode.all",
      heroes: "FOLIO.SETTINGS.SheetMode.heroes", chosen: "FOLIO.SETTINGS.SheetMode.chosen"}},
    worldDefault: {type: String, default: "none", scope: "world", gm: true, onChange: () => refreshSheetChoice(), choices: {
      none: "FOLIO.SETTINGS.WorldDefault.none", heroes: "FOLIO.SETTINGS.WorldDefault.heroes",
      all: "FOLIO.SETTINGS.WorldDefault.all"}},
    sheetActors: {type: Object, default: {}, hidden: true, onChange: () => refreshSheetChoice()}
  }},
  {id: "display", icon: "fa-solid fa-palette", settings: {
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
  {id: "play", icon: "fa-solid fa-hand-pointer", settings: {
    quickUse: {type: Boolean, default: false},
    costPreview: {type: Boolean, default: true},
    repeatSpell: {type: Boolean, default: true},
    spellDialogStrip: {type: Boolean, default: true},
    hostileHealConfirm: {type: Boolean, default: true}
  }},
  {id: "targets", icon: "fa-solid fa-crosshairs", settings: {
    quickbarTargets: {type: Boolean, default: true},
    targetChecks: {type: Boolean, default: true}
  }},
  {id: "combat", icon: "fa-solid fa-swords", settings: {
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
function labelKey(key) {
  return `FOLIO.SETTINGS.${key.capitalize()}`;
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

/* -------------------------------------------- */

/**
 * Register all settings of the module and the menu which edits them.
 */
export function registerSettings() {
  for ( const group of SETTINGS ) {
    for ( const [key, def] of Object.entries(group.settings) ) {
      const type = def.range
        ? new foundry.data.fields.NumberField({...def.range, initial: def.default})
        : def.type;
      game.settings.register(MODULE_ID, key, {
        name: `${labelKey(key)}.name`,
        hint: `${labelKey(key)}.hint`,
        scope: def.scope ?? "user",
        config: false,
        type,
        choices: def.choices,
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

  game.settings.registerMenu(MODULE_ID, "settings", {
    name: "FOLIO.SETTINGS.Menu.name",
    label: "FOLIO.SETTINGS.Menu.label",
    hint: "FOLIO.SETTINGS.Menu.hint",
    icon: "fa-solid fa-gear",
    type: FolioSettingsMenu,
    restricted: false
  });
}

/* -------------------------------------------- */

/**
 * The Folio settings window: all options grouped by topic, each with an explanation.
 */
export class FolioSettingsMenu extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "folio-settings",
    tag: "form",
    classes: ["folio-settings"],
    window: {title: "FOLIO.SETTINGS.Menu.name", icon: "fa-solid fa-gear", contentClasses: ["standard-form"]},
    position: {width: 600, height: "auto"},
    form: {handler: FolioSettingsMenu.#onSubmit, closeOnSubmit: true},
    actions: {
      reset: FolioSettingsMenu.#onReset,
      selfTest: FolioSettingsMenu.#onSelfTest,
      removeActorChoice: FolioSettingsMenu.#onRemoveActorChoice
    }
  };

  /** @override */
  static PARTS = {
    form: {template: `${TEMPLATES}/settings.hbs`, scrollable: [".fo-settings-groups"]},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext() {
    const isGM = game.user.isGM;
    const groups = SETTINGS.filter(g => isGM || !g.gm).map(group => ({
      id: group.id,
      icon: group.icon,
      label: _loc(`FOLIO.SETTINGS.GROUPS.${group.id}`),
      actorChoices: (group.id === "sheet") ? this.#prepareActorChoices() : null,
      fields: Object.entries(group.settings).filter(([, def]) => !def.hidden && (isGM || !def.gm)).map(([key, def]) => {
        const value = setting(key);
        return {
          key, value,
          label: _loc(`${labelKey(key)}.name`),
          hint: _loc(`${labelKey(key)}.hint`),
          isBoolean: def.type === Boolean,
          choices: def.choices ? Object.entries(def.choices)
            .filter(([id]) => !def.choiceModules?.[id] || game.modules.get(def.choiceModules[id])?.active)
            .map(([id, label]) => ({id, label: _loc(label), selected: id === value})) : null,
          range: def.range ?? null,
          world: def.scope === "world",
          reload: !!def.requiresReload,
          gm: !!def.gm && !group.gm
        };
      })
    }));
    return {
      groups,
      isGM,
      buttons: [
        {type: "button", action: "reset", icon: "fa-solid fa-rotate-left", label: "FOLIO.SETTINGS.Reset"},
        {type: "submit", icon: "fa-solid fa-floppy-disk", label: "FOLIO.SETTINGS.Save"}
      ]
    };
  }

  /* -------------------------------------------- */

  /**
   * The characters this user switched one by one, with the sheet each of them uses.
   * @returns {{id: string, name: string, folio: boolean}[]}
   */
  #prepareActorChoices() {
    return Object.entries(setting("sheetActors") ?? {})
      .map(([id, folio]) => ({id, folio, name: game.actors.get(id)?.name}))
      .filter(c => c.name)
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  }

  /* -------------------------------------------- */

  /**
   * Save every changed setting; ask to reload if a changed setting requires it.
   * @this {FolioSettingsMenu}
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    let reload = false;
    for ( const group of SETTINGS ) {
      for ( const [key, def] of Object.entries(group.settings) ) {
        if ( !(key in data) ) continue;
        if ( (def.scope === "world") && !game.user.isGM ) continue;
        let value = data[key];
        if ( def.type === Boolean ) value = !!value;
        else if ( def.type === Number ) value = Number(value);
        if ( value === setting(key) ) continue;
        await game.settings.set(MODULE_ID, key, value);
        if ( def.requiresReload ) reload = true;
      }
    }
    if ( reload ) await foundry.applications.settings.SettingsConfig.reloadConfirm({world: true});
  }

  /* -------------------------------------------- */

  /**
   * Put the default values into the form; they are saved with the form.
   * @this {FolioSettingsMenu}
   */
  static #onReset() {
    const form = this.element;
    for ( const group of SETTINGS ) {
      for ( const [key, def] of Object.entries(group.settings) ) {
        const input = form.querySelector(`[name="${key}"]`);
        if ( !input ) continue;
        if ( def.type === Boolean ) input.checked = def.default;
        else input.value = def.default;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Forget the single-character choice for one actor; it follows the general mode again.
   * @this {FolioSettingsMenu}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onRemoveActorChoice(event, target) {
    const choices = {...setting("sheetActors")};
    delete choices[target.dataset.actorId];
    await game.settings.set(MODULE_ID, "sheetActors", choices);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Run the self-test from the menu.
   * @this {FolioSettingsMenu}
   * @param {PointerEvent} event
   * @param {HTMLButtonElement} button
   */
  static async #onSelfTest(event, button) {
    if ( !game.user.isGM ) return;
    button.disabled = true;
    try {
      await runSelfTest();
    } finally {
      button.disabled = false;
    }
  }
}
