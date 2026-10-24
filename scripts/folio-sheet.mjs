/**
 * The Folio sheets: a shared mixin with the complete sheet behavior, applied to Crucible's hero and adversary sheets.
 */

import {
  FLAGS, MODULE_ID, TEMPLATES, actorEntry, defaultBarPosition, loadUIState, setting, updateUIState
} from "./config.mjs";
import {openSettings} from "./settings.mjs";
import {setActorChoice} from "./sheet-choice.mjs";
import {
  computeDefenses, getProgressIssues, prepareAbilities, prepareActionChips, prepareActions, prepareAttunements,
  prepareEffects, prepareHeader, prepareInventory, prepareLastSpell, preparePinnedSkills, prepareQuickbarButtons,
  prepareResistances, prepareSkills, prepareSpellbook, prepareSpells, prepareTalents, prepareTargets, prepareTraining
} from "./prepare.mjs";
import {
  buildSpell, castLastSpell, castSpellFavorite, confirmHostileRestoration, getSpellFavorites, openSpellComposer,
  quickUseProblem, removeSpellFavorite, renameSpellFavorite, resolveActorToken
} from "./spell-favorites.mjs";
import {countFeature, markUsed} from "./usage.mjs";

export {MODULE_ID};

/** The MIME type used to reorder favorites by drag and drop. */
const FAVORITE_MIME = "application/x-folio-favorite";

/**
 * Apply the Folio behavior to a Crucible actor sheet class.
 * @param {typeof foundry.applications.sheets.ActorSheetV2} Base
 * @returns {typeof foundry.applications.sheets.ActorSheetV2}
 */
export function FolioSheetMixin(Base) {
  return class FolioSheet extends Base {

    /** Marker used to find open Folio sheets. */
    static FOLIO = true;

    /** @inheritDoc */
    static DEFAULT_OPTIONS = {
      classes: ["folio"],
      position: {width: 900, height: 860},
      window: {resizable: true},
      actions: {
        foLock: FolioSheet.#onToggleLock,
        foUse: FolioSheet.#onUseAction,
        foExpand: FolioSheet.#onExpand,
        foFavorite: FolioSheet.#onFavorite,
        foActionEdit: FolioSheet.#onActionEdit,
        foItemEdit: FolioSheet.#onItemEdit,
        foItemDelete: FolioSheet.#onItemDelete,
        foItemEquip: FolioSheet.#onItemEquip,
        foItemDrop: FolioSheet.#onItemDrop,
        foItemCreate: FolioSheet.#onItemCreate,
        foUses: FolioSheet.#onChangeUses,
        foEffectToggle: FolioSheet.#onEffectToggle,
        foEffectEdit: FolioSheet.#onEffectEdit,
        foEffectDelete: FolioSheet.#onEffectDelete,
        foStatus: FolioSheet.#onToggleStatus,
        foSkill: FolioSheet.#onRollSkill,
        foPinSkill: FolioSheet.#onPinSkill,
        foAbility: FolioSheet.#onChangeAbility,
        foTraining: FolioSheet.#onChangeTraining,
        foFilter: FolioSheet.#onFilter,
        foCollapse: FolioSheet.#onCollapse,
        foRest: FolioSheet.#onRest,
        foResolve: FolioSheet.#onResolveProgress,
        foShowArt: FolioSheet.#onShowArt,
        foGoTab: FolioSheet.#onGoTab,
        foProfFilter: FolioSheet.#onProficiencyFilter,
        foClearSearch: FolioSheet.#onClearSearch,
        foCastFavorite: FolioSheet.#onCastFavorite,
        foSpellRemove: FolioSheet.#onSpellRemove,
        foSpellCreate: FolioSheet.#onSpellCreate,
        foSpellRename: FolioSheet.#onSpellRename,
        foEndTurn: FolioSheet.#onEndTurn,
        foQuickbar: FolioSheet.#onToggleQuickbar,
        foQbSkills: FolioSheet.#onToggleQuickbarSkills,
        foRepeatSpell: FolioSheet.#onRepeatSpell,
        foEndEffect: FolioSheet.#onEndEffect,
        foMaintainEffect: FolioSheet.#onMaintainEffect,
        foTarget: FolioSheet.#onPanToTarget,
        foSettings: FolioSheet.#onOpenSettings,
        foUseStandardSheet: FolioSheet.#onUseStandardSheet
      }
    };

    /** @override */
    static PARTS = {
      header: {id: "header", template: `${TEMPLATES}/header.hbs`},
      tabs: {id: "tabs", template: `${TEMPLATES}/tabs.hbs`},
      play: {id: "play", template: `${TEMPLATES}/play.hbs`, scrollable: [".fo-side", ".fo-main .fo-scroll"]},
      inventory: {id: "inventory", template: `${TEMPLATES}/inventory.hbs`, scrollable: [".fo-scroll"]},
      talents: {id: "talents", template: `${TEMPLATES}/talents.hbs`, scrollable: [".fo-scroll"]},
      training: {id: "training", template: `${TEMPLATES}/training.hbs`, scrollable: [".fo-scroll"]},
      spells: {id: "spells", template: `${TEMPLATES}/spells.hbs`, scrollable: [".fo-scroll"]},
      effects: {id: "effects", template: `${TEMPLATES}/effects.hbs`, scrollable: [".fo-scroll"]},
      attunement: {id: "attunement", template: `${TEMPLATES}/attunement.hbs`, scrollable: [".fo-scroll"]},
      biography: {id: "biography", template: `${TEMPLATES}/biography.hbs`, scrollable: [".fo-scroll"]},
      quickbar: {id: "quickbar", template: `${TEMPLATES}/quickbar.hbs`}
    };

    /** @override */
    static TABS = {
      sheet: {
        tabs: [
          {id: "play", icon: "fa-solid fa-swords"},
          {id: "inventory", icon: "fa-solid fa-sack"},
          {id: "talents", icon: "fa-solid fa-diagram-project"},
          {id: "training", icon: "fa-solid fa-graduation-cap"},
          {id: "spells", icon: "fa-solid fa-wand-sparkles"},
          {id: "effects", icon: "fa-solid fa-bolt"},
          {id: "attunement", icon: "fa-solid fa-moon"},
          {id: "biography", icon: "fa-solid fa-feather"}
        ],
        initial: "play",
        labelPrefix: "FOLIO.TABS"
      }
    };

    /**
     * Crucible re-renders parts of its own sheets by name, e.g. the sidebar after every action chat message.
     * These names map to the Folio part that shows the same information.
     * @type {Record<string, string>}
     */
    static PART_ALIASES = {
      sidebar: "play",
      actions: "play",
      attributes: "header",
      proficiency: "training"
    };

    /**
     * Does the Ember module provide its attunement tab for Crucible heroes?
     * @type {boolean}
     */
    static get hasAttunement() {
      return !!crucible.api.applications.HeroSheet?.PARTS?.attunement;
    }

    /* -------------------------------------------- */
    /*  Instance State                              */
    /* -------------------------------------------- */

    /** Is the sheet in play mode, hiding controls which restructure the character? */
    #locked;

    /** Keys of rows whose details are expanded inline. */
    #expanded = new Set();

    /** Search and filter state per tab, kept on the instance so that filters survive re-renders. */
    #filters = {
      play: {text: "", section: ""},
      inventory: {text: ""},
      talents: {text: ""},
      effects: {text: ""}
    };

    /** The tab which resolves the next unmet progression requirement. */
    #progressTab = null;

    /** Show only trainings with invested points on the training tab. */
    #trainedOnly = false;

    /** Elements which already received listeners, so partial re-renders do not bind them twice. */
    #bound = new WeakSet();

    /** Is the sheet reduced to the compact quickbar? */
    #quickbar = false;

    /** Is the skill drawer of the quickbar open? */
    #qbSkillsOpen = false;

    /** The position of the full sheet, restored when leaving the quickbar. */
    #fullPosition = null;

    /** Persist the quickbar position at most a few times per second while it is dragged. */
    #savePositionSoon = foundry.utils.debounce(() => this.#saveQuickbarState(), 250);

    /** The element whose cost is previewed on the resource pips. */
    #costSource = null;

    /**
     * Was this quickbar opened by the GM combat bar? Such a bar follows the turn order: it is closed again when the
     * turn moves on and does not change the remembered sheet mode of the actor.
     * @type {boolean}
     */
    folioAutoBar = false;

    /* -------------------------------------------- */

    /** @inheritDoc */
    constructor(options={}) {
      super(options);
      const state = loadUIState();
      const tab = actorEntry(state.tabs, this.document);
      if ( tab && this._getTabsConfig("sheet")?.tabs.some(t => t.id === tab) ) this.tabGroups.sheet = tab;
      const qb = actorEntry(state.quickbar, this.document);
      if ( qb?.on && !options.folioSelfTest ) {
        this.#quickbar = true;
        this.#fullPosition = qb.full ?? null;
      }
    }

    /* -------------------------------------------- */

    /**
     * Is the actor of this sheet a hero?
     * @type {boolean}
     */
    get isHero() {
      return this.document.type === "hero";
    }

    /**
     * Is the sheet currently shown as the compact quickbar?
     * @type {boolean}
     */
    get isQuickbar() {
      return this.#quickbar;
    }

    /**
     * The key under which UI state of this actor is stored. Token actors use their own UUID.
     * @type {string}
     */
    get stateKey() {
      return this.document.uuid;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    changeTab(tab, group, options) {
      super.changeTab(tab, group, options);
      if ( group === "sheet" ) this.#persist(state => state.tabs[this.stateKey] = tab);
    }

    /**
     * Update the UI state stored on this client, unless this is a throwaway self-test instance.
     * @param {function(object): void} fn
     */
    #persist(fn) {
      if ( !this.options.folioSelfTest && !this.folioAutoBar ) updateUIState(fn);
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _initializeApplicationOptions(options) {
      options = super._initializeApplicationOptions(options);
      // The Crucible actor and form styles are scoped to these classes; the Folio sheet brings its own layout
      options.classes = options.classes.filter(c => !["actor", "standard-form"].includes(c));
      if ( setting("compactMode") ) {
        // The compact layout needs less room, so new sheets open smaller
        options.position.width = Math.round(options.position.width * 0.9);
        options.position.height = Math.round(options.position.height * 0.88);
      }
      return options;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _configureRenderOptions(options) {
      // The quickbar is a single part which shows a little of everything
      if ( this.#quickbar && Array.isArray(options.parts) ) options.parts = ["quickbar"];
      else if ( Array.isArray(options.parts) ) {
        const known = new Set(Object.keys(this._configureRenderParts(options)));
        const parts = options.parts.map(p => FolioSheet.PART_ALIASES[p] ?? p).filter(p => known.has(p));
        options.parts = Array.from(new Set(parts));
      }
      super._configureRenderOptions(options);
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _configureRenderParts(options) {
      const parts = super._configureRenderParts(options);
      if ( this.#quickbar ) return {quickbar: parts.quickbar};
      delete parts.quickbar;
      if ( !this.isHero || !FolioSheet.hasAttunement ) delete parts.attunement;
      return parts;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _getTabsConfig(group) {
      const config = super._getTabsConfig(group);
      if ( (group !== "sheet") || (this.isHero && FolioSheet.hasAttunement) ) return config;
      return {...config, tabs: config.tabs.filter(t => t.id !== "attunement")};
    }

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /**
     * Describe the sheet state for the preparation functions.
     * @param {object} uiState
     * @returns {import("./prepare.mjs").FolioScope}
     */
    #scope(uiState) {
      const editable = this.isEditable;
      return {
        actor: this.document,
        isHero: this.isHero,
        editable,
        locked: !editable || this.#locked,
        expanded: this.#expanded,
        uiState,
        trainedOnly: this.#trainedOnly
      };
    }

    /**
     * Run one preparation step; a failure is logged and replaced by a fallback so the rest of the sheet still works.
     * @param {string} label
     * @param {Function} fn
     * @param {*} fallback
     * @returns {Promise<*>}
     */
    async #safe(label, fn, fallback) {
      try {
        return await fn();
      } catch(err) {
        console.error(`${MODULE_ID} | Failed to prepare ${label} for ${this.document.name}`, err);
        return fallback;
      }
    }

    /** @override */
    async _prepareContext(options) {
      const uiState = loadUIState();
      const issues = getProgressIssues(this.document);
      this.#progressTab = issues[0]?.tab ?? null;
      if ( this.#locked === undefined ) {
        this.#locked = actorEntry(uiState.locked, this.document) ?? !issues.length;
      }
      if ( this.#quickbar ) return this.#prepareQuickbarContext(uiState, issues);

      const context = await super._prepareContext(options);
      const scope = this.#scope(uiState);
      const safe = this.#safe.bind(this);
      const folio = context.folio = {
        isHero: this.isHero,
        editable: scope.editable,
        locked: scope.locked,
        unlocked: scope.editable && !scope.locked,
        collapsed: uiState.collapsed,
        filters: this.#filters,
        hasBiographyDetails: !!this.document.system.schema.getField("details.biography.pronouns"),
        actionColumns: [
          {key: "cost", label: _loc("FOLIO.COLUMNS.cost")},
          {key: "target", label: _loc("FOLIO.COLUMNS.target")}
        ]
      };
      folio.header = await safe("header", () => prepareHeader(scope, issues), null);
      folio.abilities = await safe("abilities", () => prepareAbilities(scope), {scores: []});
      folio.defenses = await safe("defenses", () => computeDefenses(this.document), null);
      folio.spellbook = await safe("spellbook", () => prepareSpellbook(scope), []);
      folio.pinnedSkills = await safe("pinned skills", () => preparePinnedSkills(scope), []);
      folio.actions = await safe("actions", () => prepareActions(scope, {spellbook: folio.spellbook,
        skills: folio.pinnedSkills}), {sections: [], favorites: {rows: []}});
      folio.actions.chips = prepareActionChips(folio.actions.sections, this.#filters.play.section);
      folio.skills = await safe("skills", () => prepareSkills(scope, context), []);
      folio.resistances = await safe("resistances", () => prepareResistances(scope), {groups: []});
      folio.equipped = (context.featuredEquipment ?? []).map(e => ({...e, tags: (e.tags ?? []).filter(Boolean)}));
      folio.inventory = await safe("inventory", () => prepareInventory(scope, context), {sections: []});
      folio.talents = await safe("talents", () => prepareTalents(scope, context), {sections: []});
      folio.training = await safe("training", () => prepareTraining(scope, context), {sections: []});
      folio.spells = await safe("spells", () => prepareSpells(scope, folio.spellbook), {groups: [], iconic: []});
      folio.lastSpell = setting("repeatSpell") ? await safe("last spell", () => prepareLastSpell(scope), null) : null;
      folio.effects = await safe("effects", () => prepareEffects(scope, context), {conditions: [], sections: []});
      folio.attunements = this.isHero ? await safe("attunements", () => prepareAttunements(context), null) : null;

      // Tab badges announce unspent points and active effects
      const points = this.document.system.points;
      const badges = {
        talents: Math.max(points?.talent?.available ?? 0, 0),
        training: Math.max(points?.proficiency?.available ?? 0, 0),
        effects: folio.header?.conditions.length ?? 0
      };
      for ( const [id, tab] of Object.entries(context.tabs ?? {}) ) {
        tab.badge = badges[id] || null;
        tab.badgeAlert = (id === "talents") || (id === "training");
      }
      return context;
    }

    /**
     * A lean context for the quickbar: it is permanently open, so it skips everything it does not show.
     * @param {object} uiState
     * @param {object[]} issues
     * @returns {Promise<object>}
     */
    async #prepareQuickbarContext(uiState, issues) {
      const scope = this.#scope(uiState);
      const safe = this.#safe.bind(this);
      const spellbook = await safe("spellbook", () => prepareSpellbook(scope), []);
      const skills = await safe("pinned skills", () => preparePinnedSkills(scope), []);
      const actions = await safe("actions", () => prepareActions(scope, {spellbook, skills, favoritesOnly: true}),
        {favorites: {rows: []}});
      const lastSpell = setting("repeatSpell") ? await safe("last spell", () => prepareLastSpell(scope), null) : null;
      const showTargets = setting("quickbarTargets");
      const checkTargets = setting("targetChecks");
      const targets = (showTargets || checkTargets) ? await safe("targets", () => prepareTargets(scope), []) : [];
      const buttons = prepareQuickbarButtons(actions.favorites.rows);
      const repeat = lastSpell ? prepareQuickbarButtons([lastSpell])[0] : null;
      if ( checkTargets && targets.length ) {
        await safe("target checks", () => this.#markTargetProblems([...buttons, repeat]), null);
      }
      return {
        actor: this.document,
        isEditable: this.isEditable,
        folio: {
          isHero: this.isHero,
          editable: scope.editable,
          locked: scope.locked,
          header: await safe("header", () => prepareHeader(scope, issues), null),
          defenses: await safe("defenses", () => computeDefenses(this.document), null),
          skills: await safe("skills", () => prepareSkills(scope), []),
          quickbar: {buttons, repeat, targets: showTargets ? targets : [], skillsOpen: this.#qbSkillsOpen}
        }
      };
    }

    /**
     * Mark quickbar buttons which cannot be used on the current targets, with Crucible's reason.
     * Actions placed as a region are skipped, because their targets are chosen when the region is placed.
     * @param {object[]} buttons
     */
    #markTargetProblems(buttons) {
      const actor = this.document;
      const token = resolveActorToken(actor);
      const favorites = getSpellFavorites(actor);
      for ( const button of buttons ) {
        if ( !button || button.skill ) continue;
        let action = null;
        if ( button.lastSpell ) action = buildSpell(actor, {id: button.id});
        else if ( button.spell ) action = favorites[button.index] ? buildSpell(actor, favorites[button.index]) : null;
        else action = actor.actions[button.id];
        if ( !action || (action.id === "cast") ) continue;
        if ( SYSTEM.ACTION.TARGET_TYPES[action.target?.type]?.region ) continue;
        if ( ["self", "none", "summon"].includes(action.target?.type) ) continue;
        button.targetProblem = quickUseProblem(action, token);
      }
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onFirstRender(context, options) {
      await super._onFirstRender(context, options);
      if ( !this.options.folioSelfTest ) markUsed(MODULE_ID);
      this.#createContextMenus();
      // Keyboard access: Enter or Space activates any focusable element which carries an action
      this.element.addEventListener("keydown", event => {
        if ( !["Enter", " "].includes(event.key) ) return;
        const target = event.target;
        if ( (target.getAttribute("role") !== "button") || !target.dataset.action ) return;
        event.preventDefault();
        target.click();
      });

      // Hovering or focusing an action lights up the resource pips it would spend
      const preview = event => {
        const source = setting("costPreview") ? (event.target.closest?.("[data-cost]") ?? null) : null;
        if ( source === this.#costSource ) return;
        this.#costSource = source;
        this.#previewCost(source?.dataset.cost ?? "");
      };
      this.element.addEventListener("pointerover", preview);
      this.element.addEventListener("focusin", preview);
      this.element.addEventListener("pointerleave", () => {
        this.#costSource = null;
        this.#previewCost("");
      });
    }

    /**
     * Highlight the pips which an action would spend; pips it lacks are shown as missing.
     * @param {string} data    Encoded costs, e.g. "action:3 focus:1"
     */
    #previewCost(data) {
      const costs = {};
      for ( const part of data.split(" ") ) {
        const [resource, amount] = part.split(":");
        if ( resource ) costs[resource] = Number(amount) || 0;
      }
      for ( const pips of this.element.querySelectorAll(".fo-pips") ) {
        const resource = pips.querySelector("[data-resource]")?.dataset.resource;
        const cost = costs[resource] ?? 0;
        const value = this.document.system.resources?.[resource]?.value ?? 0;
        Array.from(pips.children).forEach((pip, i) => {
          const n = i + 1;
          pip.classList.toggle("fo-spend", (cost > 0) && (n > value - cost) && (n <= value));
          pip.classList.toggle("fo-short", (cost > 0) && (n > value) && (n <= cost));
        });
        pips.parentElement?.classList.toggle("fo-previewing", cost > 0);
      }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
      await super._onRender(context, options);
      const el = this.element;
      const light = game.settings.get(MODULE_ID, "theme") === "light";
      el.classList.toggle("fo-light", light);
      el.classList.toggle("theme-light", light);
      el.classList.toggle("theme-dark", !light);
      el.classList.toggle("fo-locked", !!context.folio?.locked);
      el.classList.toggle("fo-qb", this.#quickbar);
      el.classList.toggle("fo-adversary", !this.isHero);
      const compact = !!setting("compactMode");
      const compactChanged = el.classList.contains("fo-compact") !== compact;
      el.classList.toggle("fo-compact", compact);
      el.style.setProperty("--fo-qb-idle", String(game.settings.get(MODULE_ID, "quickbarOpacity")));
      let background = setting("background");
      if ( (background === "ember") && !game.modules.get("ember")?.active ) background = "solid";
      for ( const b of ["crucible", "ember", "glass"] ) el.classList.toggle(`fo-bg-${b}`, b === background);
      el.classList.toggle("fo-bg-image", background !== "solid");
      el.style.setProperty("--fo-glass", String(setting("backgroundOpacity")));
      if ( options.isFirstRender && !this.#quickbar && (this.position.width === "auto") ) {
        // A sheet which was last open as a combat bar keeps the bar's automatic size; restore the sheet size
        this.setPosition({width: this.options.position.width, height: this.options.position.height});
      }
      this.#costSource = null;
      if ( this.#quickbar ) {
        if ( options.isFirstRender ) {
          let bar = actorEntry(loadUIState().quickbar, this.document)?.bar;
          if ( !bar ) {
            const others = Array.from(foundry.applications.instances.values())
              .filter(app => (app !== this) && app.constructor.FOLIO && app.rendered && app.isQuickbar).length;
            bar = defaultBarPosition(others);
          }
          this.setPosition({width: "auto", height: "auto", ...bar});
        }
        else if ( compactChanged ) this.setPosition({width: "auto", height: "auto"});
        this.#setQuickbarOpen(true);
      }

      const bind = node => {
        if ( this.#bound.has(node) ) return false;
        this.#bound.add(node);
        return true;
      };

      // Search fields filter rows live without a re-render
      for ( const input of el.querySelectorAll("input.fo-search") ) {
        if ( !bind(input) ) continue;
        input.addEventListener("input", this.#onSearchInput.bind(this));
        input.addEventListener("change", event => event.stopPropagation());
        input.addEventListener("keydown", event => {
          // Enter would submit the sheet form and re-render; the search already filters live
          if ( event.key === "Enter" ) return event.preventDefault();
          if ( (event.key === "Escape") && input.value ) {
            event.preventDefault();
            event.stopPropagation();
            input.value = "";
            this.#onSearchInput({currentTarget: input});
          }
        });
      }
      for ( const tab of Object.keys(this.#filters) ) this.#applyFilter(tab);

      // Inline quantity editing updates the embedded item directly
      for ( const input of el.querySelectorAll("input.fo-qty") ) {
        if ( bind(input) ) input.addEventListener("change", this.#onChangeQuantity.bind(this));
      }

      // Double-click a row to open its sheet
      for ( const row of el.querySelectorAll(".fo-row[data-item-id], .fo-row[data-effect-uuid]") ) {
        if ( bind(row) ) row.addEventListener("dblclick", this.#onRowDoubleClick.bind(this));
      }

      // Favorites can be reordered by drag and drop, in the play tab and in the quickbar
      if ( this.isEditable ) {
        for ( const node of el.querySelectorAll("[data-fav-key]") ) {
          if ( !bind(node) ) continue;
          node.draggable = true;
          node.addEventListener("dragstart", this.#onFavoriteDragStart.bind(this));
          node.addEventListener("dragend", () => this.#clearDropMarkers());
        }
        for ( const container of el.querySelectorAll("[data-fav-container]") ) {
          if ( !bind(container) ) continue;
          container.addEventListener("dragover", this.#onFavoriteDragOver.bind(this));
          container.addEventListener("dragleave", event => {
            if ( !container.contains(event.relatedTarget) ) this.#clearDropMarkers();
          });
          container.addEventListener("drop", this.#onFavoriteDrop.bind(this));
        }
      }

      // Elements which carry an action but are not buttons become reachable by keyboard
      for ( const node of el.querySelectorAll("[data-action]:not(button, input, select, textarea, [tabindex])") ) {
        node.tabIndex = 0;
        node.setAttribute("role", "button");
      }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onDragStart(event) {
      const target = event.currentTarget;
      if ( target.classList.contains("fo-action-drag") ) {
        const action = this.document.actions[target.closest("[data-action-id]")?.dataset.actionId];
        if ( action ) event.dataTransfer.setData("text/plain", JSON.stringify(action.toMacroDragData()));
        return;
      }
      return super._onDragStart(event);
    }

    /* -------------------------------------------- */
    /*  Favorite Ordering                           */
    /* -------------------------------------------- */

    /**
     * Remember which favorite is dragged. Action icons additionally carry macro data for the hotbar.
     * @param {DragEvent} event
     */
    #onFavoriteDragStart(event) {
      const key = event.currentTarget.dataset.favKey;
      event.dataTransfer.setData(FAVORITE_MIME, key);
      if ( !event.dataTransfer.getData("text/plain") ) event.dataTransfer.setData("text/plain", "");
      event.dataTransfer.effectAllowed = "copyMove";
      game.tooltip.deactivate();
    }

    /**
     * Show where a dragged favorite would be inserted.
     * @param {DragEvent} event
     */
    #onFavoriteDragOver(event) {
      if ( !event.dataTransfer.types.includes(FAVORITE_MIME) ) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const target = event.target.closest("[data-fav-key]");
      this.#clearDropMarkers();
      if ( !target ) return;
      target.classList.add(this.#dropAfter(event, target) ? "fo-drop-after" : "fo-drop-before");
    }

    /**
     * Should a drop land after the hovered element? Rows compare vertically, quickbar buttons horizontally.
     * @param {DragEvent} event
     * @param {HTMLElement} target
     * @returns {boolean}
     */
    #dropAfter(event, target) {
      const rect = target.getBoundingClientRect();
      const horizontal = target.classList.contains("fo-qb-action");
      return horizontal ? (event.clientX > rect.left + (rect.width / 2)) : (event.clientY > rect.top + (rect.height / 2));
    }

    /** Remove the insertion markers of a favorite drag. */
    #clearDropMarkers() {
      for ( const node of this.element.querySelectorAll(".fo-drop-before, .fo-drop-after") ) {
        node.classList.remove("fo-drop-before", "fo-drop-after");
      }
    }

    /**
     * Reorder the favorites after a drop and remember the order on the actor.
     * @param {DragEvent} event
     */
    async #onFavoriteDrop(event) {
      const key = event.dataTransfer.getData(FAVORITE_MIME);
      if ( !key ) return;
      event.preventDefault();
      event.stopPropagation();
      this.#clearDropMarkers();
      const container = event.currentTarget;
      const keys = Array.from(container.querySelectorAll("[data-fav-key]")).map(n => n.dataset.favKey);
      const target = event.target.closest("[data-fav-key]");
      const from = keys.indexOf(key);
      if ( from < 0 ) return;
      keys.splice(from, 1);
      let to = keys.length;
      if ( target && (target.dataset.favKey !== key) ) {
        to = keys.indexOf(target.dataset.favKey) + (this.#dropAfter(event, target) ? 1 : 0);
      }
      keys.splice(to, 0, key);
      await this.document.setFlag(MODULE_ID, FLAGS.favoriteOrder, keys);
    }

    /* -------------------------------------------- */
    /*  Context Menus                               */
    /* -------------------------------------------- */

    /**
     * Create context menus for actions, spells, skills, items and effects.
     */
    #createContextMenus() {
      const ContextMenu = foundry.applications.ux.ContextMenu.implementation;
      const actor = this.document;
      const actionOf = li => actor.actions[li.dataset.actionId];
      const itemOf = li => actor.items.get(li.dataset.itemId);
      const effectOf = li => fromUuidSync(li.dataset.effectUuid);
      const favoriteOf = li => getSpellFavorites(actor)[Number(li.dataset.spellIndex)];
      const editable = () => this.isEditable;
      const notQuickbar = () => !this.#quickbar;
      const icon = name => `<i class="fa-solid ${name}"></i>`;

      new ContextMenu(this.element, ".fo-row[data-action-id], .fo-qb-action[data-action-id]", [
        {label: "FOLIO.MENU.Use", icon: icon("fa-dice-d20"),
          onClick: (_e, li) => this.#useAction(li.dataset.actionId, {dialog: true})},
        {label: "FOLIO.MENU.UseQuick", icon: icon("fa-forward-fast"),
          onClick: (_e, li) => this.#useAction(li.dataset.actionId, {dialog: false})},
        {label: "FOLIO.MENU.Details", icon: icon("fa-book-open"), visible: notQuickbar,
          onClick: (_e, li) => this.#toggleExpanded(li.dataset.key)},
        {label: "FOLIO.MENU.Favorite", icon: icon("fa-star"), visible: editable,
          onClick: (_e, li) => this.#toggleFavorite(li.dataset.actionId)},
        {label: "FOLIO.MENU.Edit", icon: icon("fa-pen-to-square"),
          visible: li => editable() && !!actionOf(li)?.parent,
          onClick: (_e, li) => actionOf(li)?.sheet.render({force: true})}
      ], {jQuery: false});

      new ContextMenu(this.element, ".fo-row[data-spell-index], .fo-qb-action[data-spell-index]", [
        {label: "FOLIO.SPELLFAV.Cast", icon: icon("fa-wand-sparkles"),
          onClick: (_e, li) => castSpellFavorite(actor, favoriteOf(li), {dialog: true})},
        {label: "FOLIO.SPELLFAV.CastQuick", icon: icon("fa-forward-fast"),
          onClick: (_e, li) => castSpellFavorite(actor, favoriteOf(li), {dialog: false})},
        {label: "FOLIO.MENU.Details", icon: icon("fa-book-open"), visible: notQuickbar,
          onClick: (_e, li) => this.#toggleExpanded(li.dataset.key)},
        {label: "FOLIO.SPELLFAV.Rename", icon: icon("fa-signature"), visible: editable,
          onClick: (_e, li) => renameSpellFavorite(actor, Number(li.dataset.spellIndex))},
        {label: "FOLIO.SPELLFAV.Remove", icon: icon("fa-trash"), visible: editable,
          onClick: (_e, li) => removeSpellFavorite(actor, Number(li.dataset.spellIndex))}
      ], {jQuery: false});

      new ContextMenu(this.element, ".fo-row[data-pinned-skill], .fo-qb-action[data-pinned-skill]", [
        {label: "FOLIO.MENU.Roll", icon: icon("fa-dice-d20"),
          onClick: (_e, li) => this.#rollSkill(li.dataset.skill, true)},
        {label: "FOLIO.MENU.RollQuick", icon: icon("fa-forward-fast"),
          onClick: (_e, li) => this.#rollSkill(li.dataset.skill, false)},
        {label: "FOLIO.MENU.Unpin", icon: icon("fa-thumbtack-slash"), visible: editable,
          onClick: (_e, li) => this.#togglePinnedSkill(li.dataset.skill)}
      ], {jQuery: false});

      new ContextMenu(this.element, ".fo-row[data-item-id]", [
        {label: "FOLIO.MENU.Use", icon: icon("fa-dice-d20"), visible: li => !!li.dataset.useAction,
          onClick: (_e, li) => this.#useAction(li.dataset.useAction, {dialog: true})},
        {label: "FOLIO.MENU.Details", icon: icon("fa-book-open"), visible: notQuickbar,
          onClick: (_e, li) => this.#toggleExpanded(li.dataset.key)},
        {label: "FOLIO.MENU.Equip", icon: icon("fa-shield-plus"),
          visible: li => editable() && ("equipped" in li.dataset) && (li.dataset.equipped !== "true"),
          onClick: (_e, li) => this.#equipItem(itemOf(li))},
        {label: "FOLIO.MENU.Unequip", icon: icon("fa-shield-minus"),
          visible: li => editable() && (li.dataset.equipped === "true"),
          onClick: (_e, li) => this.#equipItem(itemOf(li))},
        {label: "FOLIO.MENU.Edit", icon: icon("fa-pen-to-square"),
          onClick: (_e, li) => itemOf(li)?.sheet.render({force: true})},
        {label: "FOLIO.MENU.Delete", icon: icon("fa-trash"),
          visible: li => editable() && (li.dataset.deletable === "true"),
          onClick: (_e, li) => itemOf(li)?.deleteDialog()}
      ], {jQuery: false});

      new ContextMenu(this.element, ".fo-row[data-effect-uuid]", [
        {label: "FOLIO.MENU.Details", icon: icon("fa-book-open"), visible: notQuickbar,
          onClick: (_e, li) => this.#toggleExpanded(li.dataset.key)},
        {label: "FOLIO.MENU.Toggle", icon: icon("fa-toggle-on"), visible: editable,
          onClick: (_e, li) => {
            const effect = effectOf(li);
            return effect?.update({disabled: !effect.disabled});
          }},
        {label: "FOLIO.MENU.Edit", icon: icon("fa-pen-to-square"),
          onClick: (_e, li) => effectOf(li)?.sheet.render({force: true})},
        {label: "FOLIO.MENU.Delete", icon: icon("fa-trash"), visible: editable,
          onClick: (_e, li) => effectOf(li)?.deleteDialog()}
      ], {jQuery: false});
    }

    /* -------------------------------------------- */
    /*  Quickbar                                    */
    /* -------------------------------------------- */

    /** @inheritDoc */
    _attachFrameListeners() {
      super._attachFrameListeners();
      // Double-clicking the title bar switches between the full sheet and the quickbar instead of minimizing
      this.window.header?.addEventListener("dblclick", event => {
        if ( !setting("headerDblClick") || event.target.closest("button, a, [data-action], input") ) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.toggleQuickbar();
      }, {capture: true});
    }

    /** @inheritDoc */
    async close(options={}) {
      // The quickbar is meant to stay open: Escape, which closes every window, leaves it alone
      if ( this.#quickbar && options.closeKey ) return this;
      if ( this.folioAutoBar ) {
        // A combat bar leaves no trace: the next time the sheet opens, it opens as the actor's sheet again
        const result = await super.close(options);
        this.folioAutoBar = false;
        this.#quickbar = false;
        return result;
      }
      if ( this.#quickbar ) this.#setQuickbarOpen(false);
      return super.close(options);
    }

    /** @inheritDoc */
    _onPosition(position) {
      super._onPosition?.(position);
      if ( !this.#quickbar || !this.rendered ) return;
      if ( this.folioAutoBar ) this.#saveCombatBarSoon();
      else this.#savePositionSoon();
    }

    /** Remember where the GM keeps the combat bar, so the next adversary's bar opens in the same place. */
    #saveCombatBarSoon = foundry.utils.debounce(() => {
      if ( !this.rendered || !this.folioAutoBar ) return;
      updateUIState(state => state.combatBar = {left: this.position.left, top: this.position.top});
    }, 250);

    /**
     * Remember whether the quickbar of this actor is open, so it reopens after a client reload.
     * @param {boolean} open
     */
    #setQuickbarOpen(open) {
      this.#persist(state => {
        const entry = actorEntry(state.quickbar, this.document);
        if ( entry ) state.quickbar[this.stateKey] = {...entry, open};
      });
    }

    /** Persist the quickbar mode and positions for this actor on this client. */
    #saveQuickbarState() {
      this.#persist(state => {
        const prior = actorEntry(state.quickbar, this.document) ?? {};
        const entry = {...prior, on: this.#quickbar, full: this.#fullPosition ?? prior.full ?? null};
        if ( this.#quickbar && this.rendered ) entry.bar = {left: this.position.left, top: this.position.top};
        state.quickbar[this.stateKey] = entry;
      });
    }

    /**
     * Switch between the full sheet and the compact quickbar.
     * @param {boolean} [force]   Force a specific mode
     * @returns {Promise<void>}
     */
    async toggleQuickbar(force) {
      const on = force ?? !this.#quickbar;
      if ( on === this.#quickbar ) return;
      if ( !this.options.folioSelfTest ) countFeature(MODULE_ID, "quickbarToggle");
      if ( !on ) this.folioAutoBar = false; // Opening the full sheet makes a combat bar an ordinary sheet
      game.tooltip.deactivate();
      const stored = actorEntry(loadUIState().quickbar, this.document) ?? {};
      if ( on ) {
        const {left, top, width, height} = this.position;
        this.#fullPosition = {left, top, width, height};
      }
      this.#quickbar = on;
      this.#saveQuickbarState();
      this.#setQuickbarOpen(on);

      // The rendered parts differ between the modes, so start from an empty window body
      this.element?.querySelector(".window-content")?.replaceChildren();
      this.element?.classList.toggle("fo-qb", on);
      await this.render({force: true});
      if ( on ) {
        const bar = stored.bar ?? {left: this.position.left, top: this.position.top};
        this.setPosition({width: "auto", height: "auto", left: bar.left, top: bar.top});
      }
      else this.setPosition(this.#fullPosition ?? {width: this.options.position.width, height: this.options.position.height});
    }

    /** @inheritDoc */
    _getFrameButtons(options) {
      const buttons = super._getFrameButtons(options);
      // The full sheet has its own gear in the header; the title bar one serves the quickbar
      buttons.unshift({icon: "fa-solid fa-gear", label: "FOLIO.SETTINGS.Open", action: "foSettings"});
      return buttons;
    }

    /** @inheritDoc */
    _getHeaderControls() {
      const controls = super._getHeaderControls();
      if ( this.document.id && !this.document.pack ) {
        controls.push({icon: "fa-solid fa-scroll", label: "FOLIO.SHEET.UseStandard", action: "foUseStandardSheet"});
      }
      return controls;
    }

    /** @this {FolioSheet} */
    static async #onUseStandardSheet() {
      await setActorChoice(this.document, false);
    }

    /** @this {FolioSheet} */
    static #onOpenSettings() {
      openSettings();
    }

    /** @this {FolioSheet} */
    static async #onToggleQuickbar() {
      await this.toggleQuickbar();
    }

    /**
     * Bring the actor forward as quickbar: a closed sheet opens as quickbar, an open one comes to the front.
     * A full sheet which is already open stays a full sheet.
     * @param {object} [options]
     * @param {{left: number, top: number}} [options.position]   Where a newly opened bar appears
     * @param {boolean} [options.auto=false]     Open it as GM combat bar, which follows the turn order
     * @param {boolean} [options.announce=false] Announce the start of the actor's turn
     * @returns {Promise<void>}
     */
    async showQuickbar({position, auto=false, announce=false}={}) {
      if ( !this.rendered ) {
        this.#quickbar = true;
        this.folioAutoBar = auto;
        await this.render({force: true});
        if ( position ) this.setPosition({left: position.left, top: position.top});
      }
      if ( this.minimized ) await this.maximize();
      this.bringToFront();
      if ( announce ) this.#announceTurn();
    }

    /** Draw attention to the sheet when the actor's turn begins. */
    #announceTurn() {
      ui.notifications.info(_loc("FOLIO.TurnStart", {name: this.document.name}));
      const el = this.element;
      el.classList.remove("fo-announce");
      void el.offsetWidth; // Restart the animation
      el.classList.add("fo-announce");
      setTimeout(() => el.classList.remove("fo-announce"), 3600);
    }

    /**
     * Open or close the skill drawer of the quickbar.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onToggleQuickbarSkills(event, target) {
      this.#qbSkillsOpen = !this.#qbSkillsOpen;
      const drawer = this.element.querySelector(".fo-qb-skills");
      if ( drawer ) drawer.hidden = !this.#qbSkillsOpen;
      target.classList.toggle("active", this.#qbSkillsOpen);
      this.setPosition({height: "auto"});
    }

    /**
     * End the current combat turn. Available to the GM and to the owner of the active combatant.
     * @this {FolioSheet}
     */
    static async #onEndTurn() {
      game.tooltip.deactivate();
      try {
        await game.combat?.nextTurn();
      } catch(err) {
        ui.notifications.warn(err.message);
      }
    }

    /**
     * Cast the actor's last spell again.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     */
    static async #onRepeatSpell(event) {
      game.tooltip.deactivate();
      await castLastSpell(this.document, {dialog: this.#wantsDialog(event)});
    }

    /**
     * End an effect the actor maintains, e.g. a sustained spell or a grapple.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onEndEffect(event, target) {
      event.stopPropagation();
      const effect = fromUuidSync(target.dataset.uuid);
      if ( !effect?.isOwner ) return;
      game.tooltip.deactivate();
      await effect.delete();
    }

    /**
     * Pay the maintenance of a maintained effect with Crucible's Maintain action (Crucible 0.11.2).
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onMaintainEffect(event, target) {
      event.stopPropagation();
      const effect = fromUuidSync(target.dataset.uuid);
      if ( !effect?.isOwner ) return;
      game.tooltip.deactivate();
      await effect.system?.getMaintainAction?.()?.use();
    }

    /**
     * Pan the canvas to a targeted token.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onPanToTarget(event, target) {
      const token = canvas.tokens?.get(target.dataset.tokenId);
      if ( token ) canvas.animatePan({x: token.center.x, y: token.center.y});
    }

    /* -------------------------------------------- */
    /*  Search and Filters                          */
    /* -------------------------------------------- */

    /**
     * Handle live input in a search field.
     * @param {InputEvent|{currentTarget: HTMLInputElement}} event
     */
    #onSearchInput(event) {
      const input = event.currentTarget;
      const tab = input.dataset.tab;
      this.#filters[tab].text = input.value.trim().toLowerCase();
      input.closest(".fo-search-box")?.classList.toggle("has-value", !!input.value);
      this.#applyFilter(tab);
    }

    /**
     * Show or hide rows of one tab according to its search text and section filter.
     * @param {string} tab
     */
    #applyFilter(tab) {
      const root = this.element.querySelector(`[data-application-part="${tab}"]`);
      if ( !root ) return;
      const {text, section} = this.#filters[tab];
      const terms = text ? text.split(/\s+/) : [];
      const filtering = !!(terms.length || section);
      root.dataset.filtering = filtering ? "true" : "false";
      root.dataset.sectionFilter = section ?? "";
      for ( const row of root.querySelectorAll(".fo-row[data-search]") ) {
        const haystack = row.dataset.search;
        let visible = terms.every(t => haystack.includes(t));
        if ( section === "usable" ) visible &&= (row.dataset.usable === "true");
        else if ( section ) visible &&= (row.dataset.section === section);
        row.classList.toggle("fo-hidden", !visible);
      }
      for ( const block of root.querySelectorAll(".fo-section[data-filterable]") ) {
        const rows = block.querySelectorAll(".fo-row[data-search]");
        const shown = Array.from(rows).filter(r => !r.classList.contains("fo-hidden")
          && (getComputedStyle(r).display !== "none"));
        block.classList.toggle("fo-hidden", filtering && !shown.length);
        const count = block.querySelector(":scope > .fo-section-head .fo-count");
        if ( count ) {
          count.dataset.total ??= count.textContent;
          count.textContent = filtering ? shown.length : count.dataset.total;
        }
      }
      const noResults = root.querySelector(".fo-no-results");
      if ( noResults ) {
        const anyVisible = root.querySelector(".fo-section[data-filterable]:not(.fo-hidden)");
        noResults.hidden = !!anyVisible || !filtering;
      }
    }

    /**
     * Select a section filter chip in the play tab.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onFilter(event, target) {
      const tab = target.dataset.tab ?? "play";
      const filter = target.dataset.filter ?? "";
      const current = this.#filters[tab].section;
      this.#filters[tab].section = (current === filter) ? "" : filter;
      for ( const chip of target.parentElement.querySelectorAll("[data-filter]") ) {
        chip.classList.toggle("active", chip.dataset.filter === this.#filters[tab].section);
      }
      this.#applyFilter(tab);
    }

    /**
     * Clear the search field of a tab.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onClearSearch(event, target) {
      const input = target.closest(".fo-search-box")?.querySelector("input");
      if ( !input ) return;
      input.value = "";
      this.#onSearchInput({currentTarget: input});
      input.focus();
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Decide whether a click opens the configuration dialog: the quick-use preference, inverted by Shift.
     * @param {Event} [event]
     * @returns {boolean}
     */
    #wantsDialog(event) {
      const quick = game.settings.get(MODULE_ID, "quickUse");
      return !(quick !== !!event?.shiftKey);
    }

    /**
     * Use an action, honoring the quick-use preference and the Shift modifier.
     * @param {string} actionId
     * @param {object} [options]
     * @param {boolean} [options.dialog]   Force or suppress the configuration dialog
     * @param {Event} [options.event]      The triggering event, whose Shift key inverts the preference
     * @returns {Promise<void>}
     */
    async #useAction(actionId, {dialog, event}={}) {
      const action = this.document.actions[actionId];
      if ( !action ) return;
      dialog ??= this.#wantsDialog(event);

      // Actions which place a region are positioned in their dialog and need the actor's token on the scene
      if ( action.requiresRegion ) {
        dialog = true;
        if ( !resolveActorToken(this.document) ) {
          ui.notifications.warn(_loc("FOLIO.NeedsToken", {name: action.name}));
          return;
        }
      }
      if ( !dialog ) {
        const problem = quickUseProblem(action, resolveActorToken(this.document));
        if ( problem ) {
          ui.notifications.warn(problem);
          return;
        }
      }
      if ( !(await confirmHostileRestoration(action, resolveActorToken(this.document))) ) return;
      countFeature(MODULE_ID, this.#quickbar ? "quickbarAction" : "sheetAction");
      game.tooltip.deactivate();
      try {
        await this.document.useAction(actionId, {dialog});
      } catch(err) {
        ui.notifications.warn(err.message);
      }
    }

    /** @this {FolioSheet} */
    static async #onToggleLock() {
      this.#locked = !this.#locked;
      updateUIState(state => state.locked[this.stateKey] = this.#locked);
      await this.render();
    }

    /**
     * Use the action of a row: an actor action, or the action granted by an item.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onUseAction(event, target) {
      const row = target.closest(".fo-row");
      const actionId = target.dataset.useAction ?? target.dataset.actionId ?? row?.dataset.useAction
        ?? row?.dataset.actionId;
      if ( !actionId ) return this.#toggleExpanded(row?.dataset.key);
      await this.#useAction(actionId, {event});
    }

    /**
     * Toggle inline details of a row.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onExpand(event, target) {
      // Ignore clicks on interactive descendants inside the details themselves
      if ( event.target.closest(".fo-detail a, .fo-detail button, .fo-detail input") ) return;
      await this.#toggleExpanded(target.closest(".fo-row")?.dataset.key);
    }

    /**
     * Toggle the expansion state of a row and re-render the active tab.
     * @param {string} key
     */
    async #toggleExpanded(key) {
      if ( !key ) return;
      if ( this.#expanded.has(key) ) this.#expanded.delete(key);
      else this.#expanded.add(key);
      await this.render({parts: [this.tabGroups.sheet]});
    }

    /** @this {FolioSheet} */
    static async #onFavorite(event, target) {
      await this.#toggleFavorite(target.closest("[data-action-id]")?.dataset.actionId);
    }

    /**
     * Toggle the favorite state of an action, pruning favorites which no longer exist.
     * @param {string} actionId
     */
    async #toggleFavorite(actionId) {
      const actor = this.document;
      if ( !actor.actions[actionId] ) return;
      const prior = actor.system.favorites ?? new Set();
      const favorites = new Set(Object.keys(actor.actions).filter(id => prior.has(id)));
      if ( favorites.has(actionId) ) favorites.delete(actionId);
      else favorites.add(actionId);
      await actor.update({"system.favorites": favorites});
    }

    /** @this {FolioSheet} */
    static async #onActionEdit(event, target) {
      const action = this.document.actions[target.closest("[data-action-id]")?.dataset.actionId];
      if ( action?.parent ) await action.sheet.render({force: true});
    }

    /**
     * Get the Item for a row.
     * @param {HTMLElement} target
     * @returns {Item|undefined}
     */
    #getItem(target) {
      return this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    }

    /** @this {FolioSheet} */
    static async #onItemEdit(event, target) {
      await this.#getItem(target)?.sheet.render({force: true});
    }

    /** @this {FolioSheet} */
    static async #onItemDelete(event, target) {
      await this.#getItem(target)?.deleteDialog();
    }

    /** @this {FolioSheet} */
    static async #onItemEquip(event, target) {
      await this.#equipItem(this.#getItem(target));
    }

    /**
     * Toggle the equipped state of an item.
     * @param {Item} item
     */
    async #equipItem(item) {
      if ( !item ) return;
      try {
        await this.document.equipItem(item, {equipped: !item.system.equipped});
      } catch(err) {
        ui.notifications.warn(err.message);
      }
    }

    /** @this {FolioSheet} */
    static async #onItemDrop(event, target) {
      const item = this.#getItem(target);
      if ( item ) await this.document.equipItem(item.id, {equipped: false, dropped: true});
    }

    /** @this {FolioSheet} */
    static async #onItemCreate() {
      const cls = getDocumentClass("Item");
      await cls.createDialog({type: "weapon"}, {parent: this.document, pack: this.document.pack}, {
        types: Array.from(SYSTEM.ITEM.PHYSICAL_ITEM_TYPES)
      });
    }

    /**
     * Spend or restore a use of an item with limited uses.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onChangeUses(event, target) {
      const item = this.#getItem(target);
      const uses = item?.system.uses;
      if ( !uses ) return;
      const value = Math.clamp(uses.value + Number(target.dataset.delta), 0, uses.max);
      if ( value !== uses.value ) await item.update({"system.uses.value": value});
    }

    /**
     * Change the stack size of an item from its inline quantity field.
     * @param {Event} event
     */
    async #onChangeQuantity(event) {
      event.stopPropagation();
      const input = event.currentTarget;
      const item = this.#getItem(input);
      if ( !item ) return;
      let value = input.value.trim();
      const current = item.system.quantity ?? 0;
      if ( /^[+-]/.test(value) ) value = current + Number(value);
      else value = Number(value);
      if ( !Number.isFinite(value) ) return this.render({parts: [this.tabGroups.sheet]});
      await item.update({"system.quantity": Math.max(0, Math.round(value))});
    }

    /**
     * Open the sheet of a row on double-click.
     * @param {MouseEvent} event
     */
    #onRowDoubleClick(event) {
      if ( event.target.closest("button, a, input, .fo-detail") ) return;
      const row = event.currentTarget;
      const doc = row.dataset.itemId ? this.document.items.get(row.dataset.itemId)
        : fromUuidSync(row.dataset.effectUuid);
      doc?.sheet.render({force: true});
    }

    /**
     * Get the ActiveEffect for a row.
     * @param {HTMLElement} target
     * @returns {ActiveEffect|null}
     */
    #getEffect(target) {
      const uuid = target.closest("[data-effect-uuid]")?.dataset.effectUuid;
      return uuid ? fromUuidSync(uuid) : null;
    }

    /** @this {FolioSheet} */
    static async #onEffectToggle(event, target) {
      const effect = this.#getEffect(target);
      await effect?.update({disabled: !effect.disabled});
    }

    /** @this {FolioSheet} */
    static async #onEffectEdit(event, target) {
      await this.#getEffect(target)?.sheet.render({force: true});
    }

    /** @this {FolioSheet} */
    static async #onEffectDelete(event, target) {
      await this.#getEffect(target)?.deleteDialog();
    }

    /**
     * Toggle a status condition.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onToggleStatus(event, target) {
      const statusId = target.dataset.status;
      try {
        await this.document.toggleStatusEffect(statusId);
      } catch(err) {
        // Some generated conditions (e.g. Entropy) need a source creature and cannot be toggled directly
        const name = _loc(CONFIG.statusEffects[statusId]?.name ?? statusId);
        ui.notifications.warn(_loc("FOLIO.StatusNeedsSource", {name}));
        console.warn(err);
      }
    }

    /**
     * Roll a skill check. Shift inverts the quick-roll preference.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onRollSkill(event, target) {
      const skillId = target.closest("[data-skill]")?.dataset.skill;
      if ( !skillId ) return;
      game.tooltip.deactivate();
      await this.#rollSkill(skillId, this.#wantsDialog(event));
    }

    /**
     * Roll a skill check and post it in the name of this actor. Crucible's rollSkill posts without a
     * speaker, so the chat card would otherwise carry the rolling user's own character.
     * @param {string} skillId
     * @param {boolean} dialog
     * @returns {Promise<void>}
     */
    async #rollSkill(skillId, dialog) {
      countFeature(MODULE_ID, "skillRoll");
      const check = await this.document.rollSkill(skillId, {dialog, chatMessage: false});
      if ( !check ) return;
      const skill = check.data.type ?? skillId;
      await check.toMessage({
        flavor: _loc("ACTION.SkillCheck", {skill: SYSTEM.SKILLS[skill]?.label ?? skill}),
        flags: {crucible: {skill}},
        speaker: ChatMessage.implementation.getSpeaker({actor: this.document})
      });
    }

    /**
     * Pin or unpin a skill to the favorites and the quickbar.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onPinSkill(event, target) {
      event.stopPropagation();
      await this.#togglePinnedSkill(target.closest("[data-skill]")?.dataset.skill);
    }

    /**
     * Toggle a pinned skill on the actor.
     * @param {string} skillId
     */
    async #togglePinnedSkill(skillId) {
      if ( !skillId ) return;
      game.tooltip.deactivate();
      const pinned = new Set(this.document.getFlag(MODULE_ID, FLAGS.pinnedSkills) ?? []);
      if ( pinned.has(skillId) ) pinned.delete(skillId);
      else pinned.add(skillId);
      await this.document.setFlag(MODULE_ID, FLAGS.pinnedSkills, Array.from(pinned));
    }

    /**
     * Purchase or refund an ability point.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onChangeAbility(event, target) {
      const ability = target.closest("[data-ability]")?.dataset.ability;
      await this.document.purchaseAbility(ability, Number(target.dataset.delta));
    }

    /**
     * Allocate or reclaim a training point.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onChangeTraining(event, target) {
      const training = target.closest("[data-training]")?.dataset.training;
      await this.document.purchaseTraining(training, Number(target.dataset.delta));
    }

    /** @this {FolioSheet} */
    static async #onProficiencyFilter() {
      this.#trainedOnly = !this.#trainedOnly;
      await this.render({parts: ["training"]});
    }

    /**
     * Collapse or expand a section; the state is remembered on this client.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onCollapse(event, target) {
      const block = target.closest("[data-collapse-key]");
      if ( !block ) return;
      const key = block.dataset.collapseKey;
      const collapsed = !block.classList.contains("collapsed");
      block.classList.toggle("collapsed", collapsed);
      updateUIState(state => state.collapsed[key] = collapsed);
    }

    /**
     * Use the Recover or Rest action from the header.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onRest(event, target) {
      await this.#useAction(target.dataset.rest, {dialog: true});
    }

    /**
     * Navigate to the next unresolved progression step.
     * @this {FolioSheet}
     */
    static async #onResolveProgress() {
      game.tooltip.deactivate();
      const tab = this.#progressTab;
      if ( !tab ) return;
      if ( this.#locked ) {
        this.#locked = false;
        await this.render();
      }
      if ( tab !== "header" ) this.changeTab(tab, "sheet");
    }

    /**
     * Show the portrait to everyone or edit it, depending on the lock state.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onShowArt(event, target) {
      if ( !this.#locked && this.isEditable && !this.#quickbar ) {
        const handler = this.options.actions.editImage;
        const fn = handler?.handler ?? handler;
        if ( fn ) return fn.call(this, event, target);
      }
      new foundry.applications.apps.ImagePopout({
        src: this.document.img,
        uuid: this.document.uuid,
        window: {title: this.document.name}
      }).render({force: true});
    }

    /** @this {FolioSheet} */
    static #onGoTab(event, target) {
      this.changeTab(target.dataset.tab, "sheet");
    }

    /**
     * Cast a saved spell from the spellbook. Shift inverts the quick-use preference.
     * @this {FolioSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onCastFavorite(event, target) {
      const index = Number(target.closest("[data-spell-index]")?.dataset.spellIndex);
      const favorite = getSpellFavorites(this.document)[index];
      if ( !favorite ) return;
      game.tooltip.deactivate();
      await castSpellFavorite(this.document, favorite, {dialog: this.#wantsDialog(event)});
    }

    /** @this {FolioSheet} */
    static async #onSpellRemove(event, target) {
      const index = Number(target.closest("[data-spell-index]")?.dataset.spellIndex);
      game.tooltip.deactivate();
      await removeSpellFavorite(this.document, index);
    }

    /** @this {FolioSheet} */
    static async #onSpellCreate() {
      await openSpellComposer(this.document);
    }

    /** @this {FolioSheet} */
    static async #onSpellRename(event, target) {
      game.tooltip.deactivate();
      await renameSpellFavorite(this.document, Number(target.closest("[data-spell-index]")?.dataset.spellIndex));
    }
  };
}

/* -------------------------------------------- */

/**
 * Create the Folio sheet classes. A factory is used because the Crucible base classes only exist once the system has
 * initialized.
 * @returns {{FolioHeroSheet: typeof ActorSheetV2, FolioAdversarySheet: typeof ActorSheetV2}}
 */
export function createFolioSheets() {
  const {HeroSheet, AdversarySheet} = crucible.api.applications;
  const FolioHeroSheet = class FolioHeroSheet extends FolioSheetMixin(HeroSheet) {};
  const FolioAdversarySheet = class FolioAdversarySheet extends FolioSheetMixin(AdversarySheet) {
    /** @inheritDoc */
    static DEFAULT_OPTIONS = {
      position: {width: 860, height: 800}
    };
  };
  return {FolioHeroSheet, FolioAdversarySheet};
}
