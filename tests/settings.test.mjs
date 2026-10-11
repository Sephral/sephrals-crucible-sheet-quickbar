import assert from "node:assert/strict";
import test from "node:test";

// settings.mjs and the modules it imports touch these Foundry APIs at import time
globalThis.foundry = {
  utils: {debounce: fn => fn, deepClone: value => structuredClone(value)},
  applications: {api: {ApplicationV2: class {}}}
};

const {FOLLOW_FOUNDRY, UI_LANGUAGES, applyModuleLanguage, forcedLanguage, mergeStrings} =
  await import("../scripts/language.mjs");
const {SETTINGS, labelKey, offeredChoices} = await import("../scripts/settings.mjs");

const definitions = Object.fromEntries(SETTINGS.flatMap(group => Object.entries(group.settings)));

test("the module language comes first and follows Foundry by default", () => {
  assert.deepEqual(Object.keys(SETTINGS[0].settings), ["uiLanguage"]);
  const {uiLanguage} = definitions;
  assert.equal(uiLanguage.scope, "client");
  assert.equal(uiLanguage.default, FOLLOW_FOUNDRY);
  assert.deepEqual(Object.keys(uiLanguage.choices), [FOLLOW_FOUNDRY, "de", "en"]);
  assert.deepEqual(UI_LANGUAGES, ["en", "de"]);
});

test("forcedLanguage only forces the shipped languages", () => {
  assert.equal(forcedLanguage("de"), "de");
  assert.equal(forcedLanguage("en"), "en");
  assert.equal(forcedLanguage(FOLLOW_FOUNDRY), null);
  assert.equal(forcedLanguage("fr"), null);
  assert.equal(forcedLanguage(undefined), null);
});

test("mergeStrings lays the forced file over Foundry's strings", () => {
  const loaded = {Level: "Stufe", TABS: {play: "Spiel", spells: "Zauber"}, Only: "nur geladen"};
  const forced = {Level: "Level", TABS: {play: "Play"}};
  assert.deepEqual(mergeStrings(loaded, forced),
    {Level: "Level", TABS: {play: "Play", spells: "Zauber"}, Only: "nur geladen"});
  assert.deepEqual(loaded.TABS, {play: "Spiel", spells: "Zauber"}, "the loaded strings stay untouched");
  assert.deepEqual(mergeStrings(undefined, forced), forced);
});

test("applyModuleLanguage forces a language and restores Foundry's strings", async () => {
  globalThis.game = {i18n: {translations: {FOLIO: {Level: "Stufe", Name: "Name des Helden"}, CORE: {x: 1}}}};
  globalThis.fetch = async url => {
    assert.match(String(url), /lang\/en\.json$/);
    return {ok: true, json: async () => ({FOLIO: {Level: "Level"}})};
  };
  await applyModuleLanguage("en");
  assert.deepEqual(game.i18n.translations.FOLIO, {Level: "Level", Name: "Name des Helden"});
  assert.deepEqual(game.i18n.translations.CORE, {x: 1});

  await applyModuleLanguage(FOLLOW_FOUNDRY);
  assert.deepEqual(game.i18n.translations.FOLIO, {Level: "Stufe", Name: "Name des Helden"});
  delete globalThis.game;
  delete globalThis.fetch;
});

test("labelKey builds the localization prefix of a setting", () => {
  assert.equal(labelKey("uiLanguage"), "FOLIO.SETTINGS.UiLanguage");
  assert.equal(labelKey("quickbarOpacity"), "FOLIO.SETTINGS.QuickbarOpacity");
});

test("offeredChoices drops choices of inactive modules", () => {
  const {background} = definitions;
  assert.deepEqual(Object.keys(offeredChoices(background, () => false)), ["solid", "crucible", "glass"]);
  assert.deepEqual(Object.keys(offeredChoices(background, id => id === "ember")), ["solid", "crucible", "ember", "glass"]);
  assert.equal(offeredChoices(definitions.compactMode, () => true), undefined);
});

test("only internal bookkeeping stays out of the settings dialog", () => {
  const hidden = Object.entries(definitions).filter(([, def]) => def.hidden).map(([key]) => key);
  assert.deepEqual(hidden, ["sheetActors"]);
});
