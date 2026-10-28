/**
 * The part of Sheet & Quickbar in the debug file of Sephral's modules: verified and installed versions, whether the
 * sheets are in use and the quickbars this browser remembers. The module reads no chat messages.
 */

import {LEGACY_MODULE_ID, MODULE_ID, TESTED_VERSIONS, loadUIState} from "./config.mjs";
import {registerDebugProvider} from "./debug-file.mjs";
import {folioInUse} from "./sheet-choice.mjs";

/**
 * The state of the module in short.
 * @returns {object}
 */
export function describeState() {
  const ember = game.modules.get("ember");
  const quickbars = Object.values(loadUIState().quickbar ?? {});
  return {
    tested: TESTED_VERSIONS,
    installed: {crucible: game.system.version, ember: ember?.active ? ember.version : null, core: game.version},
    legacyModuleActive: !!game.modules.get(LEGACY_MODULE_ID)?.active,
    sheetsInUse: folioInUse(),
    quickbars: {
      remembered: quickbars.length,
      on: quickbars.filter(entry => entry?.on).length,
      open: quickbars.filter(entry => entry?.on && entry.open).length
    }
  };
}

/**
 * Register the module's part. Call in "init".
 */
export function registerDebug() {
  registerDebugProvider({
    moduleId: MODULE_ID,
    label: () => _loc("FOLIO.DEBUG.Entry"),
    notice: file => _loc("FOLIO.DEBUG.Saved", {file}),
    recent: () => ({details: describeState()})
  });
}
