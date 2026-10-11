/**
 * Spell favorites: saved spellcraft compositions (rune + gesture + inflection) which can be cast with one click.
 * Favorites are stored on the Actor, so they work with every sheet and on every client.
 */

import {FLAGS, MODULE_ID, setting} from "./config.mjs";
import {wantsFolio} from "./sheet-choice.mjs";

const FLAG = FLAGS.spellFavorites;

/**
 * @typedef SpellFavorite
 * @property {string} id              The composed spell id, spell.{rune}.{gesture}.{inflection}
 * @property {string} [damageType]    The chosen damage type, for runes which let the caster choose
 * @property {string} [label]         A custom name chosen by the player
 */

/* -------------------------------------------- */

/**
 * Read the saved spell favorites of an Actor.
 * @param {Actor} actor
 * @returns {SpellFavorite[]}
 */
export function getSpellFavorites(actor) {
  const list = actor?.getFlag(MODULE_ID, FLAG);
  if ( !Array.isArray(list) ) return [];
  return list.filter(f => typeof f?.id === "string" && f.id.startsWith("spell."))
    .map(f => ({...f, id: normalizeSpellId(f.id)}));
}

/* -------------------------------------------- */

/**
 * The stable key of a favorite, used to remember its position among the favorites.
 * @param {SpellFavorite} favorite
 * @returns {string}
 */
export function spellKey(favorite) {
  return `s:${normalizeSpellId(favorite.id)}:${favorite.damageType ?? ""}`;
}

/* -------------------------------------------- */

/**
 * Crucible omits empty trailing components from some spell ids (spell.rune.gesture) and keeps "none" in others
 * (spell.rune.gesture.none). Favorites always use the full form so that compositions compare reliably.
 * @param {string} spellId
 * @returns {string}
 */
export function normalizeSpellId(spellId) {
  const {rune, gesture, inflection} = parseSpellId(spellId);
  return ["spell", rune || "none", gesture || "none", inflection || "none"].join(".");
}

/* -------------------------------------------- */

/**
 * Split a composed spell id into its components.
 * @param {string} spellId
 * @returns {{rune: string, gesture: string, inflection: string}}
 */
export function parseSpellId(spellId) {
  const [, rune="", gesture="", inflection=""] = spellId.split(".").map(p => (p === "none" ? "" : p));
  return {rune, gesture, inflection};
}

/* -------------------------------------------- */

/**
 * Does a favorite describe the given composition?
 * @param {SpellFavorite} favorite
 * @param {string} spellId
 * @param {string} [damageType]
 * @returns {boolean}
 */
function matches(favorite, spellId, damageType) {
  return (normalizeSpellId(favorite.id) === normalizeSpellId(spellId))
    && ((favorite.damageType || "") === (damageType || ""));
}

/* -------------------------------------------- */

/**
 * The damage type worth remembering for a spell: only runes whose damage type the caster chooses.
 * @param {CrucibleSpellAction} spell
 * @returns {string}
 */
function choosableDamageType(spell) {
  return (spell.rune?.damageType === "physical") ? (spell.damage?.type || "") : "";
}

/* -------------------------------------------- */

/**
 * Construct a castable spell for an Actor from a favorite.
 * @param {Actor} actor
 * @param {SpellFavorite} favorite
 * @returns {CrucibleSpellAction|null}
 */
export function buildSpell(actor, favorite) {
  const cls = crucible.api.models.CrucibleSpellAction;
  const {rune, gesture, inflection} = parseSpellId(favorite.id);
  const data = {
    id: favorite.id, rune, gesture, inflection,
    composition: cls.COMPOSITION_STATES.COMPOSED,
    tags: ["spell", "composed"]
  };
  if ( favorite.damageType ) data.damageType = favorite.damageType;
  try {
    return new cls(data, {actor});
  } catch(err) {
    console.warn(`${MODULE_ID} | Could not build spell favorite ${favorite.id}`, err);
    return null;
  }
}

/* -------------------------------------------- */

/**
 * List the components of a favorite which the Actor does not currently know, e.g. after a talent respec.
 * @param {Actor} actor
 * @param {SpellFavorite} favorite
 * @returns {string[]}  Localized component labels
 */
export function missingComponents(actor, favorite) {
  const {rune, gesture, inflection} = parseSpellId(favorite.id);
  const g = actor.grimoire;
  const {RUNES, GESTURES, INFLECTIONS} = SYSTEM.SPELL;
  const missing = [];
  if ( rune && !g.runes.has(rune) ) missing.push(RUNES[rune]?.name ?? rune);
  if ( gesture && !g.gestures.has(gesture) ) missing.push(GESTURES[gesture]?.name ?? gesture);
  if ( inflection && !g.inflections.has(inflection) ) missing.push(INFLECTIONS[inflection]?.name ?? inflection);
  return missing;
}

/* -------------------------------------------- */

/**
 * Add or remove a composition from the favorites of an Actor.
 * @param {Actor} actor
 * @param {string} spellId
 * @param {string} [damageType]
 * @returns {Promise<boolean>}  Is the composition a favorite afterwards?
 */
export async function toggleSpellFavorite(actor, spellId, damageType="") {
  spellId = normalizeSpellId(spellId);
  const list = getSpellFavorites(actor);
  const index = list.findIndex(f => matches(f, spellId, damageType));
  if ( index >= 0 ) list.splice(index, 1);
  else list.push(damageType ? {id: spellId, damageType} : {id: spellId});
  await actor.setFlag(MODULE_ID, FLAG, list);
  return index < 0;
}

/* -------------------------------------------- */

/**
 * Remove a favorite by its position.
 * @param {Actor} actor
 * @param {number} index
 * @returns {Promise<void>}
 */
export async function removeSpellFavorite(actor, index) {
  const list = getSpellFavorites(actor);
  if ( (index < 0) || (index >= list.length) ) return;
  list.splice(index, 1);
  await actor.setFlag(MODULE_ID, FLAG, list);
}

/* -------------------------------------------- */

/**
 * Give a favorite a custom name, or reset it to the composed name with an empty input.
 * @param {Actor} actor
 * @param {number} index
 * @returns {Promise<void>}
 */
export async function renameSpellFavorite(actor, index) {
  const list = getSpellFavorites(actor);
  const favorite = list[index];
  if ( !favorite ) return;
  const composed = buildSpell(actor, favorite)?.name ?? favorite.id;
  const input = document.createElement("input");
  input.type = "text";
  input.name = "label";
  input.defaultValue = favorite.label ?? ""; // The attribute, so it survives outerHTML
  input.placeholder = composed;
  input.autofocus = true;
  const label = await foundry.applications.api.DialogV2.prompt({
    window: {title: _loc("FOLIO.SPELLFAV.RenameTitle", {name: composed}), icon: "fa-solid fa-signature"},
    content: `<p class="hint">${_loc("FOLIO.SPELLFAV.RenameHint")}</p>${input.outerHTML}`,
    ok: {label: "FOLIO.SPELLFAV.RenameSave", callback: (event, button) => button.form.elements.label.value.trim()},
    rejectClose: false
  });
  if ( (label === null) || (label === undefined) ) return;
  if ( label ) favorite.label = label;
  else delete favorite.label;
  await actor.setFlag(MODULE_ID, FLAG, list);
}

/* -------------------------------------------- */

/**
 * Cast a favorite spell, opening the pre-filled spell dialog unless suppressed.
 * @param {Actor} actor
 * @param {SpellFavorite} favorite
 * @param {object} [options]
 * @param {boolean} [options.dialog=true]
 * @returns {Promise<void>}
 */
export async function castSpellFavorite(actor, favorite, {dialog=true}={}) {
  const missing = missingComponents(actor, favorite);
  if ( missing.length ) {
    ui.notifications.warn(_loc("FOLIO.SPELLFAV.Missing", {components: missing.join(", ")}));
    return;
  }
  const spell = buildSpell(actor, favorite);
  if ( !spell ) return;
  const token = resolveActorToken(actor);

  // Spells which place a region (aura, cone, summon, ...) are positioned in the dialog, so they always open it
  const needsRegion = !!SYSTEM.ACTION.TARGET_TYPES[spell.target?.type]?.region;
  if ( needsRegion ) {
    dialog = true;
    if ( !token ) {
      ui.notifications.warn(_loc("FOLIO.NeedsToken", {name: spell.name}));
      return;
    }
  }
  if ( !dialog ) {
    const problem = quickUseProblem(spell, token);
    if ( problem ) {
      ui.notifications.warn(problem);
      return;
    }
  }
  if ( !(await confirmHostileRestoration(spell, token)) ) return;
  try {
    await spell.use({dialog, token: token ?? undefined});
  } catch(err) {
    ui.notifications.warn(err.message);
  }
}

/* -------------------------------------------- */

/**
 * Cast the spell the actor cast last again. Crucible remembers it in the actor flag `crucible.lastSpell`.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {boolean} [options.dialog=true]
 * @returns {Promise<void>}
 */
export async function castLastSpell(actor, {dialog=true}={}) {
  const lastSpell = actor.flags.crucible?.lastSpell;
  if ( !lastSpell ) return;
  await castSpellFavorite(actor, {id: normalizeSpellId(lastSpell)}, {dialog});
}

/* -------------------------------------------- */

/**
 * Ask before an action restores Health or Morale of an opposed creature. Crucible allows this for some actions, e.g.
 * a healing elixir used while an enemy is still targeted.
 * @param {CrucibleAction} action
 * @param {TokenDocument|null} token    The token performing the action
 * @returns {Promise<boolean>}          Whether the action should proceed
 */
export async function confirmHostileRestoration(action, token) {
  if ( !setting("hostileHealConfirm") || !canvas.ready || !game.user.targets.size ) return true;
  let probe;
  try {
    probe = action.clone({}, {parent: action.parent, actor: action.actor, token: token ?? undefined});
  } catch(err) {
    return true;
  }
  const restores = probe.usage?.restoration || probe.tags?.has("healing") || probe.tags?.has("rallying");
  if ( !restores ) return true;
  const {FRIENDLY, HOSTILE} = CONST.TOKEN_DISPOSITIONS;
  const own = token?.disposition ?? (action.actor.hasPlayerOwner ? FRIENDLY : HOSTILE);
  const opposed = Array.from(game.user.targets).filter(t => {
    const d = t.document.disposition;
    return ((own === FRIENDLY) && (d === HOSTILE)) || ((own === HOSTILE) && (d === FRIENDLY));
  });
  if ( !opposed.length ) return true;
  return foundry.applications.api.DialogV2.confirm({
    window: {title: _loc("FOLIO.HostileHeal.Title"), icon: "fa-solid fa-triangle-exclamation"},
    content: `<p>${_loc("FOLIO.HostileHeal.Content", {action: foundry.utils.escapeHTML(action.name),
      targets: opposed.map(t => foundry.utils.escapeHTML(t.name)).join(", ")})}</p>`,
    rejectClose: false
  });
}

/* -------------------------------------------- */

/**
 * Validate the targets of an action which is used without its dialog. Crucible checks range, scope, target count
 * and tag requirements (e.g. flanking) only when its dialog is confirmed, so a quick use would skip these rules.
 * @param {CrucibleAction} action
 * @param {TokenDocument|null} token    The token performing the action
 * @returns {string|null}               Why the action cannot be used on the current targets, if it cannot
 */
export function quickUseProblem(action, token) {
  if ( !canvas.ready ) return null;
  try {
    const probe = action.clone({}, {parent: action.parent, actor: action.actor, token: token ?? undefined});
    probe.acquireTargets({strict: true});
  } catch(err) {
    return err.message;
  }
  return null;
}

/* -------------------------------------------- */

/**
 * Find the token which performs an Actor's actions on the viewed scene, as Crucible does.
 * @param {Actor} actor
 * @returns {TokenDocument|null}
 */
export function resolveActorToken(actor) {
  if ( actor.token ) return actor.token;
  let tokens = actor.getActiveTokens();
  if ( tokens.length > 1 ) tokens = tokens.filter(t => t.controlled);
  return (tokens.length === 1) ? (tokens[0].document ?? null) : null;
}

/* -------------------------------------------- */
/*  Spell Cast Dialog                           */
/* -------------------------------------------- */

/**
 * Register the favorites strip inside Crucible's spell casting dialog.
 */
export function registerSpellDialogHooks() {
  const cls = crucible.api.dice?.SpellCastDialog;
  if ( cls && !Object.hasOwn(cls.prototype, "_replaceHTML") ) {
    const inherited = cls.prototype._replaceHTML;
    cls.prototype._replaceHTML = function(result, content, options) {
      inherited.call(this, result, content, options);
      try {
        onRenderSpellCastDialog(this, content);
      } catch(err) {
        console.error(`${MODULE_ID} | Failed to add the spellbook to the spell dialog`, err);
      }
    };
  }
  else Hooks.on("renderSpellCastDialog", onRenderSpellCastDialog);
}

/* -------------------------------------------- */

/**
 * Inject the favorites strip into a rendered spell casting dialog.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
function onRenderSpellCastDialog(app, element) {
  if ( !setting("spellDialogStrip") ) return;
  const spell = app.action;
  const actor = spell?.actor;
  if ( !spell?.isComposed || (spell.id === "counterspell") || (app.constructor.name === "CounterspellDialog") ) return;
  if ( !actor?.isOwner || !wantsFolio(actor) ) return;
  const form = element.querySelector("form") ?? element;
  if ( form.querySelector(".fo-spellfav") ) return;

  const favorites = getSpellFavorites(actor);
  const currentType = choosableDamageType(spell);
  const isFavorite = favorites.some(f => matches(f, spell.id, currentType));

  const strip = document.createElement("section");
  strip.className = "fo-spellfav";

  // Header with save toggle
  const header = document.createElement("div");
  header.className = "fo-spellfav-head";
  const title = document.createElement("span");
  title.className = "fo-spellfav-title";
  title.innerHTML = `<i class="fa-solid fa-star"></i> ${_loc("FOLIO.SPELLFAV.Title")}`;
  const save = document.createElement("button");
  save.type = "button";
  save.className = `fo-spellfav-save${isFavorite ? " active" : ""}`;
  save.innerHTML = isFavorite
    ? `<i class="fa-solid fa-star"></i> ${_loc("FOLIO.SPELLFAV.Saved")}`
    : `<i class="fa-regular fa-star"></i> ${_loc("FOLIO.SPELLFAV.Save")}`;
  save.dataset.tooltip = isFavorite ? "FOLIO.SPELLFAV.RemoveHint" : "FOLIO.SPELLFAV.SaveHint";
  save.disabled = !spell.rune || !spell.gesture;
  save.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    game.tooltip.deactivate();
    await toggleSpellFavorite(actor, spell.id, choosableDamageType(spell));
    app.render({window: {title: app.title}});
  });
  header.append(title, save);
  strip.append(header);

  // One chip per favorite applies its composition
  const chips = document.createElement("div");
  chips.className = "fo-spellfav-chips";
  if ( !favorites.length ) {
    const hint = document.createElement("p");
    hint.className = "fo-spellfav-empty";
    hint.textContent = _loc("FOLIO.SPELLFAV.Empty");
    chips.append(hint);
  }
  for ( const favorite of favorites ) {
    const built = buildSpell(actor, favorite);
    const missing = missingComponents(actor, favorite);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "fo-spellfav-chip";
    if ( matches(favorite, spell.id, currentType) ) chip.classList.add("active");
    if ( missing.length ) {
      chip.classList.add("missing");
      chip.disabled = true;
      chip.dataset.tooltip = _loc("FOLIO.SPELLFAV.Missing", {components: missing.join(", ")});
    }
    else chip.dataset.tooltip = "FOLIO.SPELLFAV.ApplyHint";
    const img = document.createElement("img");
    img.src = built?.img ?? "icons/svg/explosion.svg";
    img.alt = "";
    const label = document.createElement("span");
    label.textContent = favorite.label || built?.name || favorite.id;
    chip.append(img, label);
    chip.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      game.tooltip.deactivate();
      applyComposition(app, favorite);
    });
    chips.append(chip);
  }
  strip.append(chips);

  // Place the strip directly above the composition fields
  const firstComponent = form.querySelector(".spell-component");
  if ( firstComponent ) firstComponent.before(strip);
  else form.prepend(strip);
}

/* -------------------------------------------- */

/**
 * Apply the composition of a favorite to an open spell dialog, mirroring the dialog's own change handling.
 * @param {ApplicationV2} app
 * @param {SpellFavorite} favorite
 */
function applyComposition(app, favorite) {
  const {rune, gesture, inflection} = parseSpellId(favorite.id);
  const changes = {rune, gesture, inflection};
  if ( favorite.damageType ) changes.damageType = favorite.damageType;
  app.action.updateSource(changes);
  app.roll = crucible.api.dice.StandardCheck.fromAction(app.action);
  app._clearTargetRegion?.();
  app.render({window: {title: app.title}});
}

/* -------------------------------------------- */
/*  Spell Composer                              */
/* -------------------------------------------- */

/**
 * Add a composition to the spellbook unless it is already saved.
 * @param {Actor} actor
 * @param {string} spellId
 * @param {string} [damageType]
 * @returns {Promise<boolean>}  Was a new entry added?
 */
export async function addSpellFavorite(actor, spellId, damageType="", label="") {
  spellId = normalizeSpellId(spellId);
  const list = getSpellFavorites(actor);
  if ( list.some(f => matches(f, spellId, damageType)) ) return false;
  const entry = {id: spellId};
  if ( damageType ) entry.damageType = damageType;
  if ( label ) entry.label = label;
  list.push(entry);
  await actor.setFlag(MODULE_ID, FLAG, list);
  return true;
}

/* -------------------------------------------- */

/**
 * Open a small composer which saves a spell to the spellbook without casting it.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function openSpellComposer(actor) {
  const g = actor.grimoire;
  const sort = (a, b) => a.name.localeCompare(b.name);
  const runes = Array.from(g.runes.values()).sort(sort);
  const gestures = Array.from(g.gestures.values()).sort(sort);
  const inflections = Array.from(g.inflections.values()).sort(sort);
  if ( !runes.length || !gestures.length ) {
    ui.notifications.warn(_loc("FOLIO.SPELLFAV.NoComponents"));
    return;
  }
  const esc = foundry.utils.escapeHTML;
  const options = (list, blank) => (blank ? `<option value=""></option>` : "")
    + list.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  const damageTypes = ["bludgeoning", "piercing", "slashing"]
    .map(id => `<option value="${id}">${esc(SYSTEM.DAMAGE_TYPES[id].label)}</option>`).join("");
  const content = `
  <div class="fo-composer">
    <div class="form-group"><label>${_loc("SPELL.COMPONENTS.Rune")}</label>
      <div class="form-fields"><select name="rune">${options(runes)}</select></div></div>
    <div class="form-group"><label>${_loc("SPELL.COMPONENTS.Gesture")}</label>
      <div class="form-fields"><select name="gesture">${options(gestures)}</select></div></div>
    <div class="form-group"><label>${_loc("SPELL.COMPONENTS.Inflection")}</label>
      <div class="form-fields"><select name="inflection" ${inflections.length ? "" : "disabled"}>${options(inflections, true)}</select></div></div>
    <div class="form-group fo-composer-damage" hidden><label>${_loc("SPELL.DamageType")}</label>
      <div class="form-fields"><select name="damageType">${damageTypes}</select></div></div>
    <div class="form-group"><label>${_loc("FOLIO.SPELLFAV.Name")}</label>
      <div class="form-fields"><input type="text" name="label" placeholder="${_loc("FOLIO.SPELLFAV.NamePlaceholder")}"></div></div>
    <div class="fo-composer-preview"></div>
  </div>`;

  /** Read the composition currently selected in the dialog. */
  const read = form => {
    const data = new foundry.applications.ux.FormDataExtended(form).object;
    const id = ["spell", data.rune || "none", data.gesture || "none", data.inflection || "none"].join(".");
    const favorite = {id};
    if ( data.label?.trim() ) favorite.label = data.label.trim();
    const rune = g.runes.get(data.rune);
    if ( rune?.damageType === "physical" ) favorite.damageType = data.damageType || "piercing";
    return favorite;
  };

  /** Show name, cost and targeting of the selected composition. */
  const preview = form => {
    const favorite = read(form);
    const spell = buildSpell(actor, favorite);
    const physical = g.runes.get(form.elements.rune.value)?.damageType === "physical";
    form.querySelector(".fo-composer-damage").hidden = !physical;
    const box = form.querySelector(".fo-composer-preview");
    if ( !spell ) {
      box.innerHTML = "";
      return;
    }
    const tags = spell.getTags();
    const chips = Object.entries(tags.activation ?? {}).map(([k, t]) => {
      const label = esc(String(t?.label ?? t));
      const cls = {ap: "action", fp: "focus", hp: "heroism"}[k] ?? "plain";
      return `<span class="fo-composer-chip ${cls}">${label}</span>`;
    }).join("");
    const details = Object.entries(tags.action ?? {}).filter(([k]) => k !== "composed").map(([, t]) => t?.label ?? t)
      .filter(t => typeof t === "string" && t).map(esc).join(" · ");
    const saved = getSpellFavorites(actor).some(f => matches(f, favorite.id, favorite.damageType));
    box.innerHTML = `
      <img src="${esc(spell.img)}" alt="">
      <div class="fo-composer-text">
        <strong>${esc(spell.name)}</strong>
        <div class="fo-composer-chips">${chips}</div>
        <small>${details}</small>
        ${saved ? `<em class="fo-composer-saved"><i class="fa-solid fa-star"></i> ${_loc("FOLIO.SPELLFAV.AlreadySaved")}</em>` : ""}
      </div>`;
  };

  const result = await foundry.applications.api.DialogV2.wait({
    window: {title: _loc("FOLIO.SPELLFAV.ComposerTitle", {actor: actor.name}), icon: "fa-solid fa-wand-sparkles"},
    classes: ["crucible", "fo-composer-dialog"],
    position: {width: 440},
    content,
    buttons: [
      {action: "save", label: "FOLIO.SPELLFAV.SaveToBook", icon: "fa-solid fa-book-bookmark", default: true,
        callback: (event, button) => read(button.form)},
      {action: "cancel", label: "FOLIO.Cancel", icon: "fa-solid fa-xmark"}
    ],
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      form.addEventListener("change", () => preview(form));
      form.addEventListener("keydown", event => {
        if ( (event.key === "Enter") && (event.target.name === "label") ) event.stopPropagation();
      });
      preview(form);
    },
    rejectClose: false
  });
  if ( !result || (typeof result !== "object") ) return;
  const added = await addSpellFavorite(actor, result.id, result.damageType ?? "", result.label ?? "");
  const name = result.label || buildSpell(actor, result)?.name || result.id;
  if ( added ) ui.notifications.info(_loc("FOLIO.SPELLFAV.Added", {name}));
  else ui.notifications.info(_loc("FOLIO.SPELLFAV.AlreadySaved"));
}
