/**
 * Data preparation for the Folio sheets. Every function receives a scope describing the sheet state and returns plain
 * objects for the templates. Header, resources, defenses, actions and skills are computed from the actor directly, so
 * the lean quickbar context does not depend on the full Crucible sheet context.
 */

import {
  ACTION_SECTIONS, ACTION_TAG_SECTIONS, COST_TAGS, FLAGS, INVENTORY_COLUMNS, INVENTORY_ICONS, MODULE_ID, SECTION_ICONS,
  TALENT_ICONS, cssColor, nextInRound, setting, signClass
} from "./config.mjs";
import {
  buildSpell, getSpellFavorites, missingComponents, normalizeSpellId, parseSpellId, resolveActorToken, spellKey
} from "./spell-favorites.mjs";

/**
 * @typedef FolioScope
 * @property {Actor} actor             The actor of the sheet
 * @property {boolean} isHero          Is the actor a hero (as opposed to an adversary)?
 * @property {boolean} editable        Can the current user edit the actor?
 * @property {boolean} locked          Is the sheet in play mode?
 * @property {Set<string>} expanded    Keys of rows with expanded details
 * @property {object} uiState          The persisted client UI state
 * @property {boolean} trainedOnly     Show only invested trainings
 */

/** Resource pip limits, as rendered by Crucible. */
const MAX_PIPS = {action: 6, focus: 12, heroism: 3};

/** Action sections which fill the quickbar of an adversary that has no favorites. */
const AUTO_FILL_SECTIONS = new Set(["attack", "spell", "summon", "consumable"]);

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Enrich the description shown when a row is expanded.
 * @param {FolioScope} scope
 * @param {string} html
 * @returns {Promise<string>}
 */
export async function enrich(scope, html) {
  if ( !html ) return `<p class="fo-empty">${_loc("FOLIO.NoDescription")}</p>`;
  return CONFIG.ux.TextEditor.enrichHTML(html, {relativeTo: scope.actor, secrets: scope.actor.isOwner});
}

/**
 * Convert activation tags of a CrucibleAction into cost chips, target and remaining fragments.
 * @param {object} activation
 * @returns {{cost: object[], target: string, hands: object|null, extra: object[], unmet: boolean}}
 */
export function prepareActivation(activation={}) {
  const result = {cost: [], target: "", hands: null, extra: [], unmet: false, costData: ""};
  for ( const [key, tag] of Object.entries(activation) ) {
    const label = tag?.label ?? tag;
    const unmet = !!tag?.unmet;
    if ( unmet ) result.unmet = true;
    if ( key === "target" ) result.target = label;
    else if ( key in COST_TAGS ) {
      const free = /^0\D*$/.test(String(label));
      // Weapon-dependent costs ("W") have no number; they are shown but cannot be previewed on the pips
      const amount = Number(String(label).match(/^(\d+)/)?.[1] ?? NaN);
      result.cost.push({key, resource: COST_TAGS[key], label, unmet, free, amount});
    }
    else if ( key === "hands" ) result.hands = {label, unmet};
    else result.extra.push({key, label, unmet, tooltip: tag?.tooltip ?? ""});
  }
  // Free actions only show their AP cost when nothing else is spent
  result.costData = costData(result.cost);
  if ( result.cost.length > 1 ) result.cost = result.cost.filter(c => !c.free);
  return result;
}

/**
 * Encode the resource costs of an action for the pip preview, e.g. "action:3 focus:1".
 * @param {{resource: string, amount: number}[]} cost
 * @returns {string}
 */
export function costData(cost) {
  return cost.filter(c => Number.isFinite(c.amount) && (c.amount > 0)).map(c => `${c.resource}:${c.amount}`).join(" ");
}

/**
 * Convert a record of Crucible tags into subtitle fragments which keep the system tag tooltips.
 * @param {object} tags
 * @param {Set<string>} [exclude]
 * @returns {{id: string, label: string, unmet: boolean, tooltip: string}[]}
 */
export function tagFragments(tags={}, exclude=new Set()) {
  const fragments = [];
  for ( const [id, tag] of Object.entries(tags) ) {
    if ( exclude.has(id) || (tag === undefined) || (tag === null) || (tag === "") ) continue;
    const label = tag.label ?? tag;
    if ( (typeof label !== "string") && (typeof label !== "number") ) continue;
    fragments.push({id, label, unmet: !!tag.unmet, tooltip: tag.tooltip ?? ""});
  }
  return fragments;
}

/**
 * Map actor-level action ids by the id of the item which grants them.
 * @param {Actor} actor
 * @returns {Map<string, string>}
 */
export function itemActionIndex(actor) {
  const index = new Map();
  for ( const [id, action] of Object.entries(actor.actions ?? {}) ) {
    const itemId = action.item?.id;
    if ( itemId && !index.has(itemId) ) index.set(itemId, id);
  }
  return index;
}

/* -------------------------------------------- */
/*  Progression, Resources and Defenses         */
/* -------------------------------------------- */

/**
 * Collect unmet progression requirements of a hero, ordered so the first is the next step to take.
 * Mirrors the Crucible hero sheet so the warning can navigate to Folio tabs.
 * @param {Actor} actor
 * @returns {{label: string, tab: string}[]}
 */
export function getProgressIssues(actor) {
  if ( actor.type !== "hero" ) return [];
  const s = actor.system;
  const points = s.points;
  const source = s._source?.details ?? {};
  const issues = [];
  if ( !source.ancestry?.name ) issues.push({label: "ACTOR.WARNINGS.NoAncestry", tab: "header"});
  if ( !source.background?.name ) issues.push({label: "ACTOR.WARNINGS.NoBackground", tab: "header"});
  if ( !actor.isL0 && points ) {
    if ( points.ability?.available < 0 ) issues.push({label: "ACTOR.WARNINGS.OverspentAbility", tab: "header"});
    else if ( points.ability?.requireInput ) issues.push({label: "ACTOR.WARNINGS.UnderspentAbility", tab: "header"});
    if ( points.talent?.available < 0 ) issues.push({label: "ACTOR.WARNINGS.OverspentTalent", tab: "talents"});
    else if ( points.talent?.available ) issues.push({label: "ACTOR.WARNINGS.UnderspentTalent", tab: "talents"});
    if ( points.proficiency?.available < 0 ) issues.push({label: "ACTOR.WARNINGS.OverspentProficiency", tab: "training"});
    else if ( points.proficiency?.available ) {
      issues.push({label: "ACTOR.WARNINGS.UnderspentProficiency", tab: "training"});
    }
  }
  return issues;
}

/**
 * Prepare the resource pools of an actor with percentages and pips, as Crucible does for its own sheet.
 * @param {Actor} actor
 * @returns {Record<string, object>}
 */
export function computeResources(actor) {
  const resources = {};
  for ( const [id, resource] of Object.entries(actor.system.resources ?? {}) ) {
    const config = SYSTEM.RESOURCES[id] ?? {};
    const r = {...config, ...resource, id};
    r.label = config.label ?? id;
    r.pct = r.max > 0 ? Math.clamp(Math.round(r.value * 100 / r.max), 0, 100) : 0;
    if ( id in MAX_PIPS ) {
      const limit = MAX_PIPS[id];
      r.pips = [];
      for ( let i = 1; i <= Math.min(r.max, limit); i++ ) {
        const full = r.value >= i;
        const double = (id !== "heroism") && ((r.value - limit) >= i);
        r.pips.push({cssClass: [full ? "full" : "", double ? "double" : ""].filterJoin(" ")});
      }
    }
    resources[id] = r;
  }
  return resources;
}

/**
 * Prepare defense values of an actor.
 * @param {Actor} actor
 * @returns {object}
 */
export function computeDefenses(actor) {
  const d = actor.system.defenses ?? {};
  const label = id => SYSTEM.DEFENSES[id]?.label ?? id;
  const total = id => d[id]?.total ?? 0;
  const physical = total("physical");
  const segments = ["armor", "dodge", "parry", "block"].map(id => ({
    id, label: label(id), value: total(id), pct: physical ? Math.round(total(id) * 100 / physical) : 0
  }));
  const short = id => {
    const key = `FOLIO.DEFENSE.${id}`;
    return game.i18n.has(key) ? _loc(key) : label(id);
  };
  const m = actor.system.movement ?? {};
  return {
    physical: {
      label: short("physical"), value: physical, segments, ruleId: "defense.physical",
      tooltip: `${label("physical")} ${physical} = ${segments.map(s => `${s.label} ${s.value}`).join(" + ")}`
    },
    saves: ["fortitude", "reflex", "willpower"].map(id => ({id, label: short(id), value: total(id),
      ruleId: `defense.${id}`})),
    thresholds: {
      wounds: {value: total("wounds"), label: SYSTEM.DEFENSES.wounds?.shortLabel ?? label("wounds"),
        ruleId: "defense.wounds"},
      madness: {value: total("madness"), label: SYSTEM.DEFENSES.madness?.shortLabel ?? label("madness"),
        ruleId: "defense.madness"}
    },
    stride: m.stride ?? 0,
    engagement: m.engagement ?? 0,
    size: actor.size
  };
}

/* -------------------------------------------- */
/*  Header                                      */
/* -------------------------------------------- */

/**
 * Prepare the persistent header: identity, level, resources, conditions and combat state.
 * @param {FolioScope} scope
 * @param {object[]} issues    Unmet progression requirements
 * @returns {object}
 */
export function prepareHeader(scope, issues) {
  const {actor, isHero} = scope;
  const s = actor.system;
  const r = computeResources(actor);
  const defenses = computeDefenses(actor);
  const important = !isHero && !!s.advancement?.important;

  // Health and Morale pools with their reserves and recovery thresholds
  const pool = (id, reserveId) => {
    const res = r[id];
    if ( !res ) return null;
    const reserve = r[reserveId];
    const ratio = res.max > 0 ? res.value / res.max : 0;
    const showReserve = !!reserve && (reserve.max > 0) && (isHero || important);
    return {
      id, label: res.label, value: res.value, max: res.max, pct: res.pct,
      color: cssColor(res.color?.high), colorLow: cssColor(res.color?.low), tooltip: res.tooltip,
      state: ratio <= 0 ? "empty" : (ratio <= 0.25 ? "critical" : (ratio <= 0.5 ? "low" : "")),
      field: `system.resources.${id}.value`,
      reserve: showReserve ? {
        id: reserveId, label: reserve.label, value: reserve.value, max: reserve.max, tooltip: reserve.tooltip,
        pct: reserve.pct, field: `system.resources.${reserveId}.value`
      } : null,
      threshold: defenses.thresholds[reserveId]
    };
  };
  const health = pool("health", "wounds");
  const pools = [health, pool("morale", "madness")].filter(Boolean);

  // Point currencies rendered as pips
  const currencies = ["action", "focus", "heroism"].map(id => {
    const res = r[id];
    if ( !res || ((id === "heroism") && !(res.max > 0)) ) return null;
    return {
      id, label: res.label, value: res.value, max: res.max, color: cssColor(res.color), tooltip: res.tooltip,
      pips: res.pips, field: `system.resources.${id}.value`, empty: res.value <= 0
    };
  }).filter(Boolean);

  // Active conditions, temporary effects and effects the actor maintains
  const conditions = [];
  for ( const effect of actor.allApplicableEffects() ) {
    if ( effect.disabled || effect.isSuppressed ) continue;
    const maintenance = effect.system?.maintenance ?? {};
    const maintained = !!(maintenance.cost || maintenance.hands);
    if ( !effect.statuses.size && !effect.isTemporary && !maintained ) continue;
    conditions.push(prepareCondition(effect, maintenance, maintained));
  }
  conditions.sort((x, y) => (y.maintained - x.maintained) || x.name.localeCompare(y.name));

  // Combat turn indicator
  let combat = null;
  const encounter = game.combat;
  const combatant = encounter?.combatants.find(c => (c.actor?.uuid === actor.uuid) || (c.actor?.id === actor.id
    && !actor.isToken));
  if ( combatant ) {
    const isTurn = !!encounter.started && (encounter.combatant?.id === combatant.id);
    const next = nextInRound(encounter.turns, encounter.turn, encounter.settings?.skipDefeated);
    // Crucible lets only the GM start a new round, so a player cannot end the last turn of a round
    const canEnd = isTurn && (game.user.isGM || combatant.isOwner);
    // Crucible's Delay action: the actor acts later this round, at a lower initiative
    const delay = combatant.actor?.flags.crucible?.delay;
    const delayed = (delay && (delay.round === encounter.round))
      ? {from: delay.from, to: delay.to, tooltip: _loc("FOLIO.Delayed", {from: delay.from, to: delay.to})}
      : null;
    combat = {
      round: encounter.round,
      initiative: combatant.initiative ?? "–",
      isTurn,
      isNext: !!encounter.started && !isTurn && (next?.id === combatant.id),
      delayed,
      canEnd,
      endBlocked: canEnd && !game.user.isGM && !next
    };
  }

  const adv = s.advancement ?? {};
  const header = {
    isHero, health, pools, currencies, conditions, combat,
    img: actor.img,
    name: actor.name,
    size: actor.size
  };

  if ( isHero ) {
    const source = s._source?.details ?? {};
    Object.assign(header, {
      ancestry: {name: source.ancestry?.name || _loc("ANCESTRY.SHEET.Choose"), missing: !source.ancestry?.name},
      background: {name: source.background?.name || _loc("BACKGROUND.SHEET.Choose"), missing: !source.background?.name},
      signature: s.details?.signatureName,
      level: adv.level,
      levelDisplay: String(adv.level ?? 0),
      milestones: {progress: adv.progress ?? 0, required: adv.required ?? 0, pct: adv.pct ?? 0,
        tooltip: _loc("ADVANCEMENT.MilestoneTooltip", adv)},
      canLevelUp: !actor.isL0 && (adv.pct === 100) && !issues.length,
      progress: issues.length ? {
        tooltip: `<h4>${_loc("ACTOR.ProgressionRequirements")}</h4><ol>${
          issues.map(i => `<li>${_loc(i.label)}</li>`).join("")}</ol>`
      } : null
    });
  }
  else {
    const level = adv.level ?? 0;
    const threat = SYSTEM.THREAT_RANKS?.[adv.rank];
    Object.assign(header, {
      taxonomy: {name: s.details?.taxonomy?.name || _loc("TAXONOMY.SHEET.Choose"), missing: !s.details?.taxonomy?.name},
      archetype: {name: s.details?.archetype?.name || _loc("ARCHETYPE.SHEET.Choose"),
        missing: !s.details?.archetype?.name},
      level,
      levelDisplay: level > 0 ? String(level) : (level === 0 ? "0" : `1/${1 - level}`),
      threat: threat ? {label: _loc(threat.label), icon: threat.icon, id: adv.rank} : null,
      threatOptions: Object.entries(SYSTEM.THREAT_RANKS ?? {}).map(([id, t]) => ({
        id, label: _loc(t.label), selected: id === adv.rank
      })),
      important,
      canLevelUp: level < 24,
      canLevelDown: level !== 0,
      milestones: {pct: 0, tooltip: ""}
    });
  }
  return header;
}

/**
 * Describe an active condition with its remaining duration and maintenance.
 * @param {ActiveEffect} effect
 * @param {{cost?: number, hands?: number}} maintenance
 * @param {boolean} maintained
 * @returns {object}
 */
function prepareCondition(effect, maintenance, maintained) {
  let duration = effect.duration ?? {};
  try {
    duration = effect.updateDuration?.() ?? duration;
  } catch(err) {
    // Keep the duration prepared with the document
  }
  const counted = ["rounds", "turns"].includes(duration.units) && Number.isFinite(duration.remaining);
  const rounds = counted ? Math.max(duration.remaining, 0) : null;
  const lines = [`<strong>${foundry.utils.escapeHTML(effect.name)}</strong>`];
  if ( Number.isFinite(duration.remaining) && duration.label ) lines.push(duration.label);
  if ( maintenance.cost ) lines.push(_loc("FOLIO.MaintainedCost", {cost: maintenance.cost}));
  else if ( maintenance.hands ) lines.push(_loc("FOLIO.MaintainedHands", {hands: maintenance.hands}));
  return {
    name: effect.name, img: effect.img, uuid: effect.uuid, rounds,
    roundsLabel: (counted && setting("conditionRounds")) ? String(rounds) : "", maintained,
    canEnd: maintained && effect.isOwner,
    tooltip: lines.join("<br>")
  };
}

/**
 * Prepare the ability strip.
 * @param {FolioScope} scope
 * @returns {{scores: object[], points: object|null, showControls: boolean}}
 */
export function prepareAbilities(scope) {
  const {actor, isHero, editable, locked} = scope;
  const points = actor.system.points?.ability;
  const showControls = isHero && editable && (!locked || !!points?.requireInput);
  const canPurchase = (id, delta) => {
    try {
      return showControls && !!actor.canPurchaseAbility?.(id, delta);
    } catch(err) {
      return false;
    }
  };
  const scores = Object.values(SYSTEM.ABILITIES)
    .sort((a, b) => a.sheetOrder - b.sheetOrder)
    .map(ab => ({
      id: ab.id, label: ab.label, abbr: ab.abbreviation, value: actor.system.abilities?.[ab.id]?.value ?? 0,
      color: cssColor(ab.color), type: ab.type,
      canIncrease: canPurchase(ab.id, 1), canDecrease: canPurchase(ab.id, -1)
    }));
  const available = points ? (points.pool || points.available) : 0;
  return {scores, showControls, points: (points?.requireInput && available) ? {available} : null};
}

/* -------------------------------------------- */
/*  Actions, Spellbook and Pinned Skills        */
/* -------------------------------------------- */

/**
 * Prepare the saved spell compositions of the spellbook as castable rows.
 * @param {FolioScope} scope
 * @returns {Promise<object[]>}
 */
export async function prepareSpellbook(scope) {
  const {actor} = scope;
  const {RUNES, GESTURES, INFLECTIONS} = SYSTEM.SPELL ?? {};
  const rows = [];
  for ( const [index, favorite] of getSpellFavorites(actor).entries() ) {
    const spell = buildSpell(actor, favorite);
    const missing = missingComponents(actor, favorite);
    let tags = {activation: {}, action: {}};
    try {
      tags = spell?.getTags() ?? tags;
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not read the tags of ${favorite.id}`, err);
    }
    const activation = prepareActivation(tags.activation);
    const context = tagFragments(tags.action, new Set(["composed"]));
    const {rune, gesture, inflection} = parseSpellId(favorite.id);
    const recipe = [RUNES?.[rune]?.name, GESTURES?.[gesture]?.name, INFLECTIONS?.[inflection]?.name]
      .filter(Boolean).join(" + ");
    const composedName = spell?.name || favorite.id;
    const subtitle = [{label: recipe, source: true}];
    if ( favorite.label && (favorite.label !== composedName) ) subtitle.unshift({label: composedName, source: true});
    if ( favorite.damageType ) subtitle.push({label: SYSTEM.DAMAGE_TYPES[favorite.damageType]?.label ?? ""});
    if ( missing.length ) {
      subtitle.push({label: _loc("FOLIO.SPELLFAV.Unknown", {components: missing.join(", ")}), unmet: true});
    }
    else subtitle.push(...context);
    if ( activation.hands ) subtitle.push({label: activation.hands.label, unmet: activation.hands.unmet});
    const key = `spell:${favorite.id}:${favorite.damageType ?? ""}`;
    const expanded = scope.expanded.has(key);
    let description = "";
    if ( expanded && spell ) {
      try {
        description = await spell.renderCard();
      } catch(err) {
        description = await enrich(scope, spell.description);
      }
    }
    rows.push({
      kind: "spell", spell: true, index, id: favorite.id, key, favKey: spellKey(favorite),
      name: favorite.label || composedName, img: spell?.img ?? "icons/svg/explosion.svg", section: "spell",
      cost: activation.cost, costData: activation.costData, target: activation.target, subtitle,
      usable: !missing.length && !activation.unmet, missing: !!missing.length, favorite: true,
      search: [favorite.label, composedName, recipe, ...context.map(c => c.label)].filterJoin(" ").toLowerCase(),
      expanded, description
    });
  }
  return rows;
}

/**
 * Prepare the spell the actor cast last, so it can be repeated with one click.
 * Crucible remembers it in the actor flag `crucible.lastSpell`.
 * @param {FolioScope} scope
 * @returns {object|null}
 */
export function prepareLastSpell(scope) {
  const {actor} = scope;
  const lastSpell = actor.flags.crucible?.lastSpell;
  if ( !lastSpell || !String(lastSpell).startsWith("spell.") ) return null;
  const favorite = {id: normalizeSpellId(lastSpell)};
  // Crucible renamed components over time (e.g. the spirit rune); an outdated id is not offered for repetition
  const {rune, gesture, inflection} = parseSpellId(favorite.id);
  const known = (group, id) => !id || (id === "none") || Object.keys(SYSTEM.SPELL?.[group] ?? {}).includes(id);
  if ( !known("RUNES", rune) || !known("GESTURES", gesture) || !known("INFLECTIONS", inflection) ) return null;
  if ( missingComponents(actor, favorite).length ) return null;
  const spell = buildSpell(actor, favorite);
  if ( !spell ) return null;
  let tags = {activation: {}};
  try {
    tags = spell.getTags();
  } catch(err) {
    return null;
  }
  const activation = prepareActivation(tags.activation);
  return {
    kind: "spell", lastSpell: true, id: favorite.id, key: `last:${favorite.id}`, name: spell.name, img: spell.img,
    cost: activation.cost, costData: activation.costData, target: activation.target,
    usable: !activation.unmet
  };
}

/* -------------------------------------------- */

/** How many status icons a target chip shows at most. */
const TARGET_STATUS_ICONS = 5;

/**
 * Describe the current user's targets for the quickbar: who they are, how far away and how well defended, and which
 * conditions they suffer from.
 * @param {FolioScope} scope
 * @returns {object[]}
 */
export function prepareTargets(scope) {
  const {actor} = scope;
  if ( !canvas.ready || !game.user.targets.size ) return [];
  const source = resolveActorToken(actor);
  const sourceToken = (source?.parent === canvas.scene) ? source.object : null;
  const {HOSTILE, FRIENDLY} = CONST.TOKEN_DISPOSITIONS;
  const targets = [];
  for ( const token of game.user.targets ) {
    const target = token.actor;
    if ( !target ) continue;
    let distance = null;
    if ( sourceToken && (sourceToken !== token) ) {
      try {
        distance = Math.round(crucible.api.canvas.grid.getLinearRangeCost(sourceToken, token));
      } catch(err) {
        distance = null;
      }
    }
    const defenses = computeDefenses(target);
    const disposition = token.document.disposition;
    const health = target.system.resources?.health;
    const showHealth = !!health && target.testUserPermission(game.user, "OBSERVER");
    const saves = defenses.saves.map(sv => `${sv.label} ${sv.value}`).join(" · ");
    // Statuses are shown on the token for everyone anyway
    const statuses = [...target.statuses].map(id => CONFIG.statusEffects[id]).filter(s => s?.img)
      .map(s => ({id: s.id, img: s.img, name: _loc(s.name)}));
    targets.push({
      id: token.id, name: token.name, img: token.document.texture?.src || target.img,
      self: sourceToken === token, distance,
      disposition: disposition === HOSTILE ? "hostile" : (disposition === FRIENDLY ? "friendly" : "neutral"),
      physical: defenses.physical.value,
      saves: defenses.saves.map(sv => ({id: sv.id, label: _loc(`FOLIO.QB.${sv.id}`), value: sv.value})),
      statuses: statuses.slice(0, TARGET_STATUS_ICONS),
      moreStatuses: Math.max(statuses.length - TARGET_STATUS_ICONS, 0),
      health: showHealth ? {value: health.value, max: health.max,
        pct: health.max ? Math.clamp(Math.round(health.value * 100 / health.max), 0, 100) : 0} : null,
      tooltip: `<strong>${foundry.utils.escapeHTML(token.name)}</strong><br>${defenses.physical.label} ${
        defenses.physical.value} · ${saves}${distance !== null ? `<br>${_loc("FOLIO.TARGET.Distance", {distance})}` : ""}${
        statuses.length ? `<br>${statuses.map(s => foundry.utils.escapeHTML(s.name)).join(", ")}` : ""}`
    });
  }
  return targets;
}

/* -------------------------------------------- */

/**
 * Prepare the skills pinned to the favorites as rows.
 * @param {FolioScope} scope
 * @returns {object[]}
 */
export function preparePinnedSkills(scope) {
  const {actor} = scope;
  const pinned = actor.getFlag(MODULE_ID, FLAGS.pinnedSkills);
  if ( !Array.isArray(pinned) ) return [];
  const {PROFICIENCIES, RANK_VALUES} = SYSTEM.PROFICIENCY;
  const rows = [];
  for ( const id of pinned ) {
    const config = PROFICIENCIES[id];
    const t = actor.system.training?.[id];
    if ( !config || !t || !(id in SYSTEM.SKILLS) ) continue;
    const rank = RANK_VALUES[t.rank];
    rows.push({
      kind: "skill", skill: true, id, key: `skill:${id}`, favKey: `k:${id}`,
      name: config.short ?? config.label, img: config.icon, section: "skill",
      score: t.score, scoreLabel: t.score >= 0 ? `+${t.score}` : String(t.score), scoreClass: signClass(t.score),
      passive: t.passive, subtitle: [{label: rank?.label ?? "", source: true}],
      cost: [], target: "", usable: true, favorite: true,
      search: [config.label, config.short].filterJoin(" ").toLowerCase()
    });
  }
  return rows;
}

/**
 * Order favorites by the saved order of the actor; unknown entries follow alphabetically.
 * @param {Actor} actor
 * @param {object[]} rows
 * @returns {object[]}
 */
export function orderFavorites(actor, rows) {
  const order = actor.getFlag(MODULE_ID, FLAGS.favoriteOrder);
  const index = new Map(Array.isArray(order) ? order.map((key, i) => [key, i]) : []);
  return rows.sort((a, b) => {
    const ia = index.get(a.favKey) ?? Infinity;
    const ib = index.get(b.favKey) ?? Infinity;
    if ( ia !== ib ) return ia - ib;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Prepare all actions grouped into sections, with favorites pinned in their own section.
 * @param {FolioScope} scope
 * @param {object} [options]
 * @param {object[]} [options.spellbook]       Spellbook rows to pin with the favorites
 * @param {object[]} [options.skills]          Pinned skill rows
 * @param {boolean} [options.favoritesOnly]    Skip everything which is not a favorite (quickbar)
 * @returns {Promise<{sections: object[], favorites: object, chips: object[]}>}
 */
export async function prepareActions(scope, {spellbook=[], skills=[], favoritesOnly=false}={}) {
  const {actor, uiState} = scope;
  const sections = Object.fromEntries(ACTION_SECTIONS.map(id => [id, {
    id, label: _loc(`FOLIO.ACTIONS.${id}`), icon: SECTION_ICONS[id], rows: []
  }]));
  const favorites = {id: "favorites", label: _loc("FOLIO.ACTIONS.favorites"), icon: SECTION_ICONS.favorites, rows: []};

  // Strikes name the wielded weapons and their damage, so the attack is clear without opening a card
  const weaponNotes = [];
  const {mainhand, offhand} = actor.equipment?.weapons ?? {};
  for ( const w of [mainhand, offhand] ) {
    if ( !w?.name || (weaponNotes.length && !w.id) ) continue;
    const damage = w.getTags?.("short")?.damage;
    weaponNotes.push({label: damage ? `${w.name} (${damage.label ?? damage})` : w.name, source: true});
  }

  // An adversary without any chosen favorites gets its attacks and abilities on the quickbar instead
  const autoFill = favoritesOnly && !scope.isHero && !spellbook.length && !skills.length
    && setting("autoFillAdversaries") && !Object.values(actor.actions ?? {}).some(a => a.isFavorite);

  for ( const [actionId, action] of Object.entries(actor.actions ?? {}) ) {
    const favorite = !!action.isFavorite;
    let pinned = false;
    let shown = true;
    try {
      shown = action._displayOnSheet?.() ?? true;
      pinned = (favorite || action.autoFavorite) && shown;
    } catch(err) {
      pinned = favorite;
    }

    let sectionId = "general";
    for ( const [tag, id] of Object.entries(ACTION_TAG_SECTIONS) ) {
      if ( action.tags?.has(tag) ) {
        sectionId = id;
        break;
      }
    }
    const filled = autoFill && !pinned && shown && !action.suppressFromSheet && (AUTO_FILL_SECTIONS.has(sectionId)
      || (actionId === "defend") || ((sectionId === "general") && (action.item?.type === "talent")));
    if ( favoritesOnly && !pinned && !filled ) continue;

    let tags = {activation: {}, action: {}};
    try {
      tags = action.getTags();
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not read the tags of action ${actionId}`, err);
    }
    const activation = prepareActivation(tags.activation);
    const context = tagFragments(tags.action);
    const item = action.item;

    // Subtitle: source, wielded weapons, context tags, hands and consumable stock
    const subtitle = [];
    if ( item && (item.name !== action.name) ) subtitle.push({label: item.name, source: true});
    if ( action.tags?.has("strike") ) subtitle.push(...weaponNotes);
    subtitle.push(...context);
    if ( activation.hands ) subtitle.push({label: activation.hands.label, unmet: activation.hands.unmet});
    subtitle.push(...activation.extra);
    if ( item?.system.uses ) {
      // A used-up stack keeps full uses on a quantity of zero, so ask Crucible whether anything is left
      const {value, max} = item.system.uses;
      const depleted = item.system.isDepleted ?? (value <= 0);
      const label = depleted ? _loc("ITEM.PROPERTIES.Depleted") : _loc("FOLIO.UsesLeft", {value, max});
      subtitle.push({label, unmet: depleted});
    }

    const key = `action:${actionId}`;
    const expanded = scope.expanded.has(key);
    const row = {
      kind: "action", id: actionId, key, favKey: `a:${actionId}`, name: action.name, img: action.img,
      section: sectionId, cost: activation.cost, costData: activation.costData, target: activation.target, subtitle,
      usable: !activation.unmet && !context.some(c => c.unmet),
      favorite, canEdit: !!action.parent,
      search: [action.name, item?.name, ...context.map(c => c.label)].filterJoin(" ").toLowerCase(),
      expanded,
      description: expanded ? await enrich(scope, action.description) : ""
    };
    if ( pinned ) {
      favorites.rows.push({...row, draggableFav: true});
      row.pinned = true;
    }
    else if ( filled ) favorites.rows.push({...row, autoFilled: true});
    if ( action.suppressFromSheet || favoritesOnly ) continue;
    sections[sectionId].rows.push(row);
  }

  // Saved spells and pinned skills join the favorites; spells are also listed under spellcraft
  for ( const row of spellbook ) {
    favorites.rows.push({...row, draggableFav: true});
    if ( !favoritesOnly ) sections.spell.rows.push({...row, pinned: true});
  }
  for ( const row of skills ) favorites.rows.push({...row, draggableFav: true});
  orderFavorites(actor, favorites.rows);
  favorites.collapsed = !!uiState.collapsed["play.favorites"];

  // Sort and drop empty sections
  const list = [];
  for ( const id of ACTION_SECTIONS ) {
    const section = sections[id];
    if ( !section.rows.length ) continue;
    section.rows.sort((x, y) => x.name.localeCompare(y.name));
    section.collapsed = !!uiState.collapsed[`play.${id}`];
    section.allPinned = section.rows.every(r => r.pinned);
    section.count = section.rows.filter(r => !r.pinned).length;
    list.push(section);
  }

  return {sections: list, favorites};
}

/**
 * Prepare the filter chips of the play tab.
 * @param {object[]} sections
 * @param {string} active
 * @returns {object[]}
 */
export function prepareActionChips(sections, active) {
  return [
    {id: "", label: _loc("FOLIO.FILTER.All"), icon: "fa-solid fa-layer-group", active: !active},
    {id: "usable", label: _loc("FOLIO.FILTER.Usable"), icon: "fa-solid fa-circle-check", active: active === "usable"},
    ...sections.map(s => ({id: s.id, label: s.label, icon: s.icon, active: active === s.id, iconOnly: true}))
  ];
}

/**
 * Prepare the buttons of the quickbar from the ordered favorites.
 * @param {object[]} favorites
 * @returns {object[]}
 */
export function prepareQuickbarButtons(favorites) {
  const number = label => String(label ?? "").match(/\d+/)?.[0] ?? "";
  return favorites.map(row => {
    const ap = row.cost?.find(c => c.resource === "action");
    const fp = row.cost?.find(c => c.resource === "focus");
    return {
      ...row,
      ap: ap && !ap.free ? number(ap.label) : "", apUnmet: !!ap?.unmet,
      fp: fp ? number(fp.label) : "", fpUnmet: !!fp?.unmet,
      costText: (row.cost ?? []).map(c => c.label).join(" ")
    };
  });
}

/* -------------------------------------------- */
/*  Skills and Resistances                      */
/* -------------------------------------------- */

/**
 * Prepare the rollable skills grouped like Crucible's training groups.
 * @param {FolioScope} scope
 * @param {object} [context]   The Crucible sheet context, which supplies score tooltips when available
 * @returns {object[]}
 */
export function prepareSkills(scope, context) {
  const {actor, uiState} = scope;
  const {GROUPS, PROFICIENCIES, RANK_VALUES} = SYSTEM.PROFICIENCY;
  const training = actor.system.training ?? {};
  const pinned = new Set(actor.getFlag(MODULE_ID, FLAGS.pinnedSkills) ?? []);
  const prepared = new Map();
  for ( const section of context?.proficiency?.sections ?? [] ) {
    for ( const t of section.types ) prepared.set(t.id, t);
  }
  const groups = [];
  for ( const group of Object.values(GROUPS) ) {
    const skills = Object.values(PROFICIENCIES)
      .filter(p => (p.group === group.id) && (p.id in SYSTEM.SKILLS) && training[p.id])
      .map(p => {
        const t = training[p.id];
        const rank = RANK_VALUES[t.rank] ?? {rank: 0, label: ""};
        return {
          id: p.id, label: p.short ?? p.label, score: t.score, passive: t.passive, scoreClass: signClass(t.score),
          rank: rank.rank, rankLabel: rank.label, trained: rank.rank > 0, pinned: pinned.has(p.id),
          pips: [1, 2, 3, 4].map(i => i <= rank.rank),
          abbrs: (p.abilities ?? []).map(id => SYSTEM.ABILITIES[id]?.abbreviation).join(" · "),
          tooltip: prepared.get(p.id)?.tooltips.value ?? ""
        };
      });
    if ( !skills.length ) continue;
    const key = `skills.${group.id}`;
    const defaultCollapsed = skills.length > 6; // Trade skills start folded away
    const shortKey = `FOLIO.SKILLGROUP.${group.id}`;
    const label = game.i18n.has(shortKey) ? _loc(shortKey) : _loc(group.label);
    groups.push({id: group.id, key, label, color: cssColor(group.color), skills,
      collapsed: uiState.collapsed[key] ?? defaultCollapsed});
  }
  return groups;
}

/**
 * Prepare the compact resistance grid from the actor data.
 * @param {FolioScope} scope
 * @returns {{groups: object[], collapsed: boolean}}
 */
export function prepareResistances(scope) {
  const {actor, uiState} = scope;
  const rs = actor.system.resistances ?? {};
  const groups = Object.entries(SYSTEM.DAMAGE_CATEGORIES).map(([category, c]) => ({
    label: c.label,
    values: Object.values(SYSTEM.DAMAGE_TYPES).filter(d => d.type === category).map(d => {
      const r = rs[d.id] ?? {};
      const total = r.total ?? 0;
      let css = "none";
      if ( r.immune ) css = "immunity";
      else if ( total ) css = total < 0 ? "vuln" : "res";
      return {id: d.id, label: d.label, total: r.immune ? "∞" : total, css};
    })
  }));
  return {groups, collapsed: !!uiState.collapsed["side.resistances"]};
}

/* -------------------------------------------- */
/*  Inventory and Talents                       */
/* -------------------------------------------- */

/**
 * Prepare inventory sections with column values.
 * @param {FolioScope} scope
 * @param {object} context
 * @returns {Promise<object>}
 */
export async function prepareInventory(scope, context) {
  const {actor, uiState, editable} = scope;
  const actionIndex = itemActionIndex(actor);
  const sections = [];
  const num = tag => {
    const label = tag?.label ?? tag;
    if ( (label === undefined) || (label === null) || (label === "") ) return "–";
    return String(label).match(/-?\d+(?:[.,]\d+)?/)?.[0] ?? label;
  };
  for ( const [sectionId, section] of Object.entries(context.inventory ?? {}) ) {
    const columns = INVENTORY_COLUMNS[sectionId] ?? ["quantity", "weight"];
    const rows = [];
    for ( const d of section.items ) {
      const item = actor.items.get(d.id);
      if ( !item ) continue;
      const short = item.getTags("short") ?? {};
      const system = item.system;
      const uses = system.uses;
      const values = {
        damage: num(short.damage), range: num(short.range), armor: num(short.armor), dodge: num(short.dodge),
        uses: uses ? `${uses.value}/${uses.max}` : "–",
        quantity: system.quantity ?? 1,
        weight: system.weight ? Number((system.weight * (system.quantity ?? 1)).toFixed(1)) : "–"
      };
      const shown = new Set(["equipped", "uses", ...columns]);
      const key = `item:${item.id}`;
      const expanded = scope.expanded.has(key);
      const actionId = actionIndex.get(item.id) ?? null;
      const equipAction = d.actions.find(b => b.action === "itemEquip");
      rows.push({
        id: item.id, uuid: item.uuid, key, name: item.name, img: item.img, type: item.type,
        subtitle: tagFragments(d.tags, shown),
        cells: columns.map(c => ({
          key: c, value: values[c],
          // Crucible keeps non-stackable items at a quantity of one, so only stacks can be edited
          editable: (c === "quantity") && !!(d.showStack || system.properties?.has?.("stackable")),
          uses: (c === "uses") && !!uses && editable ? {value: uses.value, max: uses.max,
            canDecrease: uses.value > 0, canIncrease: uses.value < uses.max} : null
        })),
        quantity: values.quantity,
        showStack: d.showStack,
        equipped: !!d.equipped, dropped: !!d.dropped, css: d.cssClass ?? "",
        equip: equipAction ? {icon: equipAction.icon, tooltip: _loc(equipAction.tooltip)} : null,
        canDrop: d.actions.some(b => b.action === "itemDrop"),
        actionId, usable: !!actionId,
        search: [item.name, ...Object.values(d.tags).map(t => t?.label ?? t)].filterJoin(" ").toLowerCase(),
        expanded,
        description: expanded ? await enrich(scope, system.description?.public) : ""
      });
    }
    const key = `inventory.${sectionId}`;
    sections.push({
      id: sectionId, key, icon: INVENTORY_ICONS[sectionId] ?? "fa-solid fa-box",
      label: _loc(`ACTOR.SECTIONS.${sectionId.toUpperCase()}.header`),
      counter: section.counter ? `${rows.length}/${section.counter}` : rows.length,
      full: section.counter && (rows.length >= section.counter),
      columns: columns.map(c => ({key: c, label: _loc(`FOLIO.COLUMNS.${c}`)})),
      empty: section.empty, rows, collapsed: !!uiState.collapsed[key]
    });
  }
  const capacity = context.capacity;
  return {
    sections,
    capacity: capacity ? {
      value: capacity.value, max: capacity.max,
      pct: Math.clamp(Math.round(capacity.pct * 100), 0, 100),
      over: capacity.value > capacity.max
    } : null,
    currency: context.source?.system.currency
  };
}

/**
 * Prepare talent sections.
 * @param {FolioScope} scope
 * @param {object} context
 * @returns {Promise<object>}
 */
export async function prepareTalents(scope, context) {
  const {actor, uiState, isHero} = scope;
  const actionIndex = itemActionIndex(actor);
  const sections = [];
  for ( const [sectionId, section] of Object.entries(context.talents ?? {}) ) {
    const rows = [];
    for ( const d of section.items ) {
      const item = actor.items.get(d.id);
      if ( !item ) continue;
      const action = item.actions?.[0];
      const key = `talent:${item.id}`;
      const expanded = scope.expanded.has(key);
      let activation = {cost: [], target: "", extra: []};
      let subtitle;
      if ( action ) {
        const tags = action.getTags();
        activation = prepareActivation(tags.activation);
        subtitle = tagFragments(tags.action);
        if ( item.actions.length > 1 ) {
          subtitle.unshift({label: _loc("FOLIO.ActionCount", {count: item.actions.length}), source: true});
        }
      }
      else subtitle = tagFragments(item.getTags());
      const actionId = action ? (actionIndex.get(item.id) ?? null) : null;
      rows.push({
        id: item.id, uuid: item.uuid, key, name: item.name, img: item.img,
        subtitle, cost: activation.cost, target: activation.target,
        actionId, usable: !!actionId,
        search: [item.name, ...subtitle.map(s => s.label)].filterJoin(" ").toLowerCase(),
        expanded,
        description: expanded ? await enrich(scope, item.system.description) : ""
      });
    }
    const key = `talents.${sectionId}`;
    const hasActivation = rows.some(r => r.cost.length || r.target);
    sections.push({id: sectionId, key, label: section.label, icon: TALENT_ICONS[sectionId] ?? "fa-solid fa-star",
      counter: rows.length, rows, collapsed: !!uiState.collapsed[key], hasActivation});
  }
  const points = actor.system.points?.talent;
  return {
    sections,
    canPurchase: isHero && !!points,
    canDelete: !isHero,
    points: points ? {available: points.available, spent: points.spent, alert: points.available > 0} : null,
    treeOpen: game.system.tree?.actor === actor,
    treeLabel: context.talentTreeButtonText
  };
}

/* -------------------------------------------- */
/*  Training, Spells, Effects, Attunement       */
/* -------------------------------------------- */

/**
 * Prepare the training tab from the proficiency data of the Crucible sheet.
 * @param {FolioScope} scope
 * @param {object} context
 * @returns {object}
 */
export function prepareTraining(scope, context) {
  const {editable, locked, trainedOnly} = scope;
  const prof = context.proficiency ?? {sections: [], ticks: [], pools: {}};
  const pools = prof.pools ?? {};
  const available = pools.available ?? 0;
  const showControls = !!pools.canAllocate && editable && (!locked || (available !== 0));
  const sections = prof.sections.map(s => ({
    label: s.label, color: s.color,
    types: s.types.filter(t => !trainedOnly || (t.points > 0)).map(t => ({
      id: t.id, label: t.label, icon: t.icon, rollable: t.rollable, rank: t.rank.label, rankValue: t.rank.rank,
      abbrs: t.abilityAbbrs.join(" · "), score: t.score, passive: t.passive, points: t.points,
      scoreClass: signClass(t.score),
      widthPct: t.widthPct, capTick: t.capTick, tooltips: t.tooltips,
      canIncrease: showControls && t.canIncrease, canDecrease: showControls && t.canDecrease
    }))
  })).filter(s => s.types.length);
  return {
    sections, ticks: prof.ticks, trainedOnly, showControls,
    pools: {...pools, alert: available > 0},
    knowledge: context.knowledge,
    languages: context.languages
  };
}

/**
 * Prepare known spellcraft components and iconic spells.
 * @param {FolioScope} scope
 * @param {object[]} spellbook
 * @returns {object}
 */
export function prepareSpells(scope, spellbook) {
  const {actor} = scope;
  const grimoire = actor.grimoire ?? {runes: new Map(), gestures: new Map(), inflections: new Map(), iconicSlots: 0};
  const {runes, gestures, inflections, iconicSlots} = grimoire;
  const component = c => ({id: c.id, name: c.name, img: c.img, tags: (c.tags ?? []).filter(Boolean)});
  const groups = [
    {id: "runes", label: _loc("SPELL.COMPONENTS.RunePl"), icon: "fa-solid fa-hexagon",
      items: Array.from(runes.values()).map(component), empty: _loc("SPELL.COMPONENTS.RuneNone")},
    {id: "gestures", label: _loc("SPELL.COMPONENTS.GesturePl"), icon: "fa-solid fa-hand-sparkles",
      items: Array.from(gestures.values()).map(component), empty: _loc("SPELL.COMPONENTS.GestureNone")},
    {id: "inflections", label: _loc("SPELL.COMPONENTS.InflectionPl"), icon: "fa-solid fa-wave-sine",
      items: Array.from(inflections.values()).map(component), empty: _loc("SPELL.COMPONENTS.InflectionNone")}
  ];
  const iconic = actor.items.filter(i => i.type === "spell").map(i => ({
    id: i.id, uuid: i.uuid, name: i.name, img: i.img, tags: Object.values(i.getTags?.() ?? {})
      .map(t => t?.label ?? t).filter(t => typeof t === "string")
  }));
  return {
    groups, iconic, iconicSlots, book: spellbook,
    iconicLabel: _loc("ACTOR.SECTIONS.ICONIC.header"),
    iconicEmpty: iconicSlots ? _loc("ACTOR.SECTIONS.ICONIC.empty") : _loc("ACTOR.SECTIONS.ICONIC.none"),
    canCast: "cast" in (actor.actions ?? {})
  };
}

/**
 * Prepare conditions and active effect sections.
 * @param {FolioScope} scope
 * @param {object} context
 * @returns {Promise<object>}
 */
export async function prepareEffects(scope, context) {
  const {actor, uiState} = scope;
  const statuses = actor.statuses;
  const conditions = Object.values(CONFIG.statusEffects)
    .filter(s => !s.hud?.actorTypes || s.hud.actorTypes.includes(actor.type))
    .map(s => ({id: s.id, label: _loc(s.name), img: s.img, active: statuses.has(s.id)}))
    .sort((a, b) => a.label.localeCompare(b.label));

  const sections = [];
  for ( const [sectionId, section] of Object.entries(context.effects ?? {}) ) {
    const rows = [];
    for ( const e of section.effects ) {
      const effect = fromUuidSync(e.uuid);
      const key = `effect:${e.uuid}`;
      const expanded = scope.expanded.has(key);
      const source = (effect?.parent && (effect.parent !== actor)) ? effect.parent.name : "";
      const subtitle = tagFragments(e.tags).filter(f => f.label !== e.name);
      if ( source ) subtitle.unshift({label: source, source: true});
      rows.push({
        id: e.id, uuid: e.uuid, key, name: e.name, img: e.icon, subtitle,
        disabled: effect?.disabled, toggle: e.disabled,
        search: [e.name, source].filterJoin(" ").toLowerCase(),
        expanded,
        description: expanded ? await enrich(scope, effect?.description) : ""
      });
    }
    const key = `effects.${sectionId}`;
    sections.push({id: sectionId, key, label: section.label, counter: rows.length, rows,
      collapsed: !!uiState.collapsed[key]});
  }
  return {
    conditions,
    conditionsCollapsed: !!uiState.collapsed["effects.conditions"],
    activeConditions: conditions.filter(c => c.active).length,
    sections
  };
}

/**
 * Prepare Ember attunements, if the Ember module supplied them.
 * @param {object} context
 * @returns {object|null}
 */
export function prepareAttunements(context) {
  if ( !context.attunements ) return null;
  const rows = Object.entries(context.attunements).map(([id, a]) => ({
    id, label: a.label, name: a.name, icon: a.icon, rank: a.rank, current: a.current, end: a.end,
    widthPct: a.widthPct, active: a.active, canActivate: a.canActivate, canDecrease: a.canDecrease,
    color: cssColor(a.color), background: cssColor(a.backgroundColor), border: cssColor(a.borderColor)
  }));
  rows.sort((a, b) => (b.active - a.active) || (b.current - a.current) || a.label.localeCompare(b.label));
  return {rows, canModify: !!context.canModifyAttunement};
}
