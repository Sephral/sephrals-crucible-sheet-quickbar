import assert from "node:assert/strict";
import test from "node:test";

// sheet-choice.mjs touches foundry.utils at import time, debug.mjs reads the quickbars this browser remembers and the
// versions at call time
globalThis.foundry = {utils: {debounce: fn => fn}};
globalThis.window = {localStorage: {getItem: () => JSON.stringify({quickbar: {a: {on: true, open: true}, b: {on: true}, c: {}}})}};
globalThis.game = {
  system: {version: "0.11.2"},
  version: "14.369",
  modules: new Map([["ember", {active: true, version: "0.6.3"}]]),
  settings: {get: () => ({})}
};
globalThis._loc = (key, data) => (data ? `${key} ${data.file}` : key);

const {MODULE_ID, TESTED_VERSIONS} = await import("../scripts/config.mjs");
const {describeState, registerDebug} = await import("../scripts/debug.mjs");

test("the debug file part holds versions, sheet use and remembered quickbars", () => {
  assert.deepEqual(describeState(), {
    tested: TESTED_VERSIONS,
    installed: {crucible: "0.11.2", ember: "0.6.3", core: "14.369"},
    legacyModuleActive: false,
    sheetsInUse: false,
    quickbars: {remembered: 3, on: 2, open: 1}
  });
});

test("the module registers its part of the shared debug file", () => {
  registerDebug();
  const provider = globalThis.sephralsDebugFiles.providers.get(MODULE_ID);
  assert.equal(provider.label(), "FOLIO.DEBUG.Entry");
  assert.equal(provider.notice("x.json"), "FOLIO.DEBUG.Saved x.json");
  assert.equal(provider.recent().details.quickbars.remembered, 3);
  assert.equal(provider.message, undefined, "the module reads no chat messages");
});
