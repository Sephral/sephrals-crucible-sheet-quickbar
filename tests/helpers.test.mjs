import assert from "node:assert/strict";
import test from "node:test";

// The Foundry helpers the pure functions and their imports touch; Foundry defines Math.clamp and Array#filterJoin
globalThis.foundry = {utils: {debounce: fn => fn}};
globalThis._loc = key => key;
Math.clamp ??= (value, min, max) => Math.min(Math.max(value, min), max);
if ( !Array.prototype.filterJoin ) {
  Object.defineProperty(Array.prototype, "filterJoin", {
    value(separator) {
      return this.filter(part => part).join(separator);
    }
  });
}

const config = await import("../scripts/config.mjs");
const spells = await import("../scripts/spell-favorites.mjs");
const prepare = await import("../scripts/prepare.mjs");

const {MODULE_ID} = config;

/**
 * A minimal actor which answers getFlag for this module.
 * @param {object} flags
 * @param {object} [data]
 * @returns {object}
 */
function makeActor(flags, data={}) {
  return {...data, getFlag: (scope, key) => (scope === MODULE_ID ? flags[key] : undefined)};
}

/**
 * Install a localStorage stub on a fake window.
 * @param {Record<string, string>} [items]
 * @param {{failWrites?: boolean}} [options]
 * @returns {Map<string, string>}
 */
function stubStorage(items={}, {failWrites=false}={}) {
  const store = new Map(Object.entries(items));
  globalThis.window = {
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => {
        if ( failWrites ) throw new Error("QuotaExceededError");
        store.set(key, String(value));
      }
    }
  };
  return store;
}

/* -------------------------------------------- */
/*  config.mjs                                  */
/* -------------------------------------------- */

test("signClass marks the sign of a modifier", () => {
  assert.equal(config.signClass(-2), "neg");
  assert.equal(config.signClass(0), "zero");
  assert.equal(config.signClass(3), "pos");
});

test("cssColor reads Color instances and plain strings", () => {
  assert.equal(config.cssColor({css: "#ff0000"}), "#ff0000");
  assert.equal(config.cssColor("red"), "red");
  assert.equal(config.cssColor(undefined), undefined);
});

test("actorEntry prefers the UUID and falls back to the plain id", () => {
  const actor = {uuid: "Scene.s1.Token.t1.Actor.a1", id: "a1"};
  assert.equal(config.actorEntry({[actor.uuid]: "token", a1: "world"}, actor), "token");
  assert.equal(config.actorEntry({a1: "world"}, actor), "world");
  assert.equal(config.actorEntry({}, actor), undefined);
});

test("loadUIState fills missing buckets and survives broken storage", () => {
  const key = `${MODULE_ID}.ui`;
  stubStorage({[key]: "{not json"});
  assert.deepEqual(config.loadUIState(), {collapsed: {}, locked: {}, tabs: {}, quickbar: {}});

  stubStorage({[key]: JSON.stringify({tabs: {a1: "spells"}})});
  assert.deepEqual(config.loadUIState(), {tabs: {a1: "spells"}, collapsed: {}, locked: {}, quickbar: {}});
});

test("updateUIState persists the change and saveUIState ignores unavailable storage", () => {
  const store = stubStorage();
  config.updateUIState(state => state.locked.a1 = true);
  assert.equal(JSON.parse(store.get(`${MODULE_ID}.ui`)).locked.a1, true);

  stubStorage({}, {failWrites: true});
  assert.doesNotThrow(() => config.saveUIState({locked: {}}));
});

test("defaultBarPosition stacks bars upwards and stays on screen", () => {
  globalThis.window = {innerWidth: 1920, innerHeight: 1080};
  assert.deepEqual(config.defaultBarPosition(), {left: 540, top: 750});
  assert.deepEqual(config.defaultBarPosition(2), {left: 540, top: 420});
  globalThis.window = {innerWidth: 600, innerHeight: 300};
  assert.deepEqual(config.defaultBarPosition(5), {left: 80, top: 80});
});

/* -------------------------------------------- */
/*  spell-favorites.mjs                         */
/* -------------------------------------------- */

test("parseSpellId splits a composition and treats none as empty", () => {
  assert.deepEqual(spells.parseSpellId("spell.flame.ray"), {rune: "flame", gesture: "ray", inflection: ""});
  assert.deepEqual(spells.parseSpellId("spell.flame.ray.none"), {rune: "flame", gesture: "ray", inflection: ""});
  assert.deepEqual(spells.parseSpellId("spell.frost.touch.extended"),
    {rune: "frost", gesture: "touch", inflection: "extended"});
});

test("normalizeSpellId always returns the full form", () => {
  assert.equal(spells.normalizeSpellId("spell.flame.ray"), "spell.flame.ray.none");
  assert.equal(spells.normalizeSpellId("spell.flame.ray.none"), "spell.flame.ray.none");
  assert.equal(spells.normalizeSpellId("spell.flame"), "spell.flame.none.none");
});

test("spellKey is stable across short and full ids and keeps the damage type", () => {
  assert.equal(spells.spellKey({id: "spell.flame.ray"}), spells.spellKey({id: "spell.flame.ray.none"}));
  assert.equal(spells.spellKey({id: "spell.kinesis.ray", damageType: "piercing"}), "s:spell.kinesis.ray.none:piercing");
});

test("getSpellFavorites drops invalid entries and normalizes ids", () => {
  const actor = makeActor({spellFavorites: [
    {id: "spell.flame.ray"}, {id: "bogus"}, null, {id: 5}, {id: "spell.frost.touch.none", label: "Frost"}
  ]});
  assert.deepEqual(spells.getSpellFavorites(actor), [
    {id: "spell.flame.ray.none"},
    {id: "spell.frost.touch.none", label: "Frost"}
  ]);
  assert.deepEqual(spells.getSpellFavorites(makeActor({})), []);
  assert.deepEqual(spells.getSpellFavorites(null), []);
});

/* -------------------------------------------- */
/*  prepare.mjs                                 */
/* -------------------------------------------- */

test("prepareActivation sorts tags into cost chips, target, hands and extras", () => {
  const result = prepare.prepareActivation({
    ap: {label: "2A"},
    fp: {label: "1F", unmet: true},
    target: {label: "Single"},
    hands: "2H",
    range: {label: "10", tooltip: "Range"}
  });
  assert.deepEqual(result.cost, [
    {key: "ap", resource: "action", label: "2A", unmet: false, free: false, amount: 2},
    {key: "fp", resource: "focus", label: "1F", unmet: true, free: false, amount: 1}
  ]);
  assert.equal(result.target, "Single");
  assert.deepEqual(result.hands, {label: "2H", unmet: false});
  assert.deepEqual(result.extra, [{key: "range", label: "10", unmet: false, tooltip: "Range"}]);
  assert.equal(result.unmet, true);
  assert.equal(result.costData, "action:2 focus:1");
});

test("prepareActivation hides a free action cost only when something else is spent", () => {
  const mixed = prepare.prepareActivation({ap: "0A", fp: "1F"});
  assert.deepEqual(mixed.cost.map(c => c.key), ["fp"]);
  assert.equal(mixed.costData, "focus:1");

  const free = prepare.prepareActivation({ap: "0A"});
  assert.deepEqual(free.cost.map(c => [c.key, c.free]), [["ap", true]]);
  assert.equal(free.costData, "");
});

test("prepareActivation shows weapon-dependent costs without previewing them", () => {
  const result = prepare.prepareActivation({ap: "W"});
  assert.equal(result.cost.length, 1);
  assert.ok(Number.isNaN(result.cost[0].amount));
  assert.equal(result.costData, "");
});

test("costData encodes only positive numeric costs", () => {
  assert.equal(prepare.costData([
    {resource: "action", amount: 2}, {resource: "focus", amount: NaN}, {resource: "heroism", amount: 0}
  ]), "action:2");
});

test("tagFragments skips excluded, empty and non-text tags", () => {
  const fragments = prepare.tagFragments({
    a: "One", b: {label: "Two", unmet: true, tooltip: "t"}, c: "", d: null, e: {label: {}}, f: 3
  }, new Set(["a"]));
  assert.deepEqual(fragments, [
    {id: "b", label: "Two", unmet: true, tooltip: "t"},
    {id: "f", label: 3, unmet: false, tooltip: ""}
  ]);
});

test("itemActionIndex keeps the first action per item", () => {
  const index = prepare.itemActionIndex({actions: {
    strike: {item: {id: "i1"}}, other: {item: {id: "i1"}}, move: {}
  }});
  assert.deepEqual([...index], [["i1", "strike"]]);
});

test("orderFavorites follows the saved order, then sorts the rest by name", () => {
  const actor = makeActor({favoriteOrder: ["k:stealth", "a:strike"]});
  const rows = [
    {favKey: "a:strike", name: "Strike"},
    {favKey: "s:spell.frost.touch.none:", name: "Zeta"},
    {favKey: "k:stealth", name: "Stealth"},
    {favKey: "s:spell.flame.ray.none:", name: "Alpha"}
  ];
  assert.deepEqual(prepare.orderFavorites(actor, rows).map(r => r.name), ["Stealth", "Strike", "Alpha", "Zeta"]);
});

test("prepareQuickbarButtons extracts the badge numbers", () => {
  const [strike, move, skill] = prepare.prepareQuickbarButtons([
    {name: "Strike", cost: [
      {resource: "action", label: "2A", free: false, unmet: true},
      {resource: "focus", label: "1F", unmet: false}
    ]},
    {name: "Move", cost: [{resource: "action", label: "0A", free: true}]},
    {name: "Stealth"}
  ]);
  assert.deepEqual([strike.ap, strike.apUnmet, strike.fp, strike.fpUnmet, strike.costText], ["2", true, "1", false, "2A 1F"]);
  assert.deepEqual([move.ap, move.fp, move.costText], ["", "", "0A"]);
  assert.deepEqual([skill.ap, skill.fp, skill.costText], ["", "", ""]);
});

test("prepareActionChips marks the active filter", () => {
  const chips = prepare.prepareActionChips([{id: "spell", label: "Spells", icon: "fa-sparkles"}], "usable");
  assert.deepEqual(chips.map(c => [c.id, c.active]), [["", false], ["usable", true], ["spell", false]]);
  assert.equal(chips[2].iconOnly, true);
});

test("computeResources adds percentages and the pips Crucible renders", () => {
  globalThis.SYSTEM = {RESOURCES: {health: {label: "Health"}, action: {label: "Action"}, heroism: {label: "Heroism"}}};
  const resources = prepare.computeResources({system: {resources: {
    health: {value: 15, max: 20},
    action: {value: 8, max: 8},
    heroism: {value: 2, max: 3}
  }}});
  assert.equal(resources.health.pct, 75);
  assert.equal(resources.health.pips, undefined);
  assert.deepEqual(resources.action.pips.map(p => p.cssClass),
    ["full double", "full double", "full", "full", "full", "full"]);
  assert.deepEqual(resources.heroism.pips.map(p => p.cssClass), ["full", "full", ""]);
  delete globalThis.SYSTEM;
});
