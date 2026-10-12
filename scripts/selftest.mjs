/**
 * Self-test: renders every Folio sheet off-screen, in the full layout and as the quickbar, and checks the integrations
 * which depend on Crucible and Ember internals. Meant to be run after every Crucible or Ember update.
 */

import {MODULE_ID, TESTED_VERSIONS} from "./config.mjs";

/**
 * @typedef SelfTestResult
 * @property {string} name
 * @property {string} type
 * @property {boolean} ok
 * @property {string[]} problems
 * @property {number} ms
 */

/**
 * Render one actor with a fresh Folio sheet instance that does not interfere with open sheets.
 * @param {Actor} actor
 * @param {typeof ActorSheetV2} cls
 * @returns {Promise<SelfTestResult>}
 */
async function testActor(actor, cls) {
  const problems = [];
  const started = performance.now();
  const errors = [];
  const onError = event => errors.push(event.message ?? String(event.reason ?? event));
  window.addEventListener("error", onError);
  const originalError = console.error;
  console.error = (...args) => {
    if ( String(args[0]).includes(MODULE_ID) ) errors.push(args.map(a => a?.message ?? String(a)).join(" "));
    originalError.apply(console, args);
  };
  const sheet = new cls({
    document: actor,
    id: `folio-selftest-${foundry.utils.randomID()}`,
    folioSelfTest: true,
    position: {left: -5000, top: -5000}
  });
  try {
    await sheet.render({force: true});
    const el = sheet.element;
    const expected = ["header", "tabs", "play", "inventory", "talents", "training", "spells", "effects", "biography"];
    // Ember adds the attunement tab to heroes
    if ( (actor.type === "hero") && cls.hasAttunement ) expected.push("attunement");
    for ( const part of expected ) {
      if ( !el.querySelector(`[data-application-part="${part}"]`) ) problems.push(_loc("FOLIO.SELFTEST.PartMissing", {part}));
    }
    if ( !el.querySelector(".fo-pool") ) problems.push(_loc("FOLIO.SELFTEST.NoResources"));
    await sheet.toggleQuickbar(true);
    if ( !el.querySelector(".fo-quickbar") ) problems.push(_loc("FOLIO.SELFTEST.QuickbarMissing"));
    if ( el.getBoundingClientRect().width < 300 ) problems.push(_loc("FOLIO.SELFTEST.QuickbarNarrow"));
  } catch(err) {
    problems.push(err.message);
  } finally {
    await sheet.close({animate: false}).catch(() => null);
    window.removeEventListener("error", onError);
    console.error = originalError;
  }
  problems.push(...errors);
  return {name: actor.name, type: actor.type, ok: !problems.length, problems, ms: Math.round(performance.now() - started)};
}

/**
 * A random sample of a list, in random order; the whole list when it is not longer than the limit.
 * @param {Array} list
 * @param {number} limit
 * @param {() => number} [random]
 * @returns {Array}
 */
export function sampleOf(list, limit, random=Math.random) {
  if ( list.length <= limit ) return list.slice();
  const pool = list.slice();
  for ( let i = pool.length - 1; i > 0; i-- ) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit);
}

/* -------------------------------------------- */

/**
 * Check the integration points which rely on Crucible or Ember internals.
 * @returns {string[]}
 */
function checkIntegrations() {
  const problems = [];
  const {HeroSheet, AdversarySheet} = crucible.api.applications ?? {};
  if ( !HeroSheet || !AdversarySheet ) problems.push(_loc("FOLIO.SELFTEST.SheetClasses"));
  const dialog = crucible.api.dice?.SpellCastDialog;
  if ( !dialog ) problems.push(_loc("FOLIO.SELFTEST.SpellDialog"));
  else if ( !Object.hasOwn(dialog.prototype, "_replaceHTML") ) {
    problems.push(_loc("FOLIO.SELFTEST.SpellDialogHook"));
  }
  if ( !crucible.api.models?.CrucibleSpellAction ) problems.push(_loc("FOLIO.SELFTEST.SpellAction"));
  if ( game.modules.get("ember")?.active && !HeroSheet?.PARTS?.attunement ) {
    problems.push(_loc("FOLIO.SELFTEST.Attunement"));
  }
  for ( const key of ["RESOURCES", "DEFENSES", "ABILITIES", "PROFICIENCY", "SKILLS", "DAMAGE_TYPES", "SPELL"] ) {
    if ( !SYSTEM?.[key] ) problems.push(_loc("FOLIO.SELFTEST.SystemConfig", {key}));
  }
  return problems;
}

/**
 * Run the self-test over all heroes and adversaries.
 * @param {object} [options]
 * @param {number} [options.adversaryLimit=Infinity]   Test a random sample of this many adversaries
 * @param {boolean} [options.report=true]               Post a whispered chat report to the current user
 * @returns {Promise<{integrations: string[], results: SelfTestResult[]}>}
 */
export async function runSelfTest({adversaryLimit=Infinity, report=true}={}) {
  const classes = CONFIG.Actor.sheetClasses;
  const heroCls = classes.hero?.[`${MODULE_ID}.FolioHeroSheet`]?.cls;
  const adversaryCls = classes.adversary?.[`${MODULE_ID}.FolioAdversarySheet`]?.cls;
  const integrations = checkIntegrations();
  const results = [];
  ui.notifications.info(_loc("FOLIO.SELFTEST.Started"));
  const heroes = game.actors.filter(a => (a.type === "hero") && !a.isL0);
  const allAdversaries = game.actors.filter(a => a.type === "adversary");
  const adversaries = sampleOf(allAdversaries, adversaryLimit);
  const sample = (adversaries.length < allAdversaries.length)
    ? _loc("FOLIO.SELFTEST.Sample", {tested: adversaries.length, total: allAdversaries.length})
    : "";
  for ( const actor of heroes ) results.push(await testActor(actor, heroCls));
  for ( const actor of adversaries ) results.push(await testActor(actor, adversaryCls));

  const failed = results.filter(r => !r.ok);
  const versions = Object.entries(TESTED_VERSIONS).map(([id, v]) => {
    const current = (id === "core") ? game.version : (id === "crucible" ? game.system.version : game.modules.get(id)?.version);
    return _loc("FOLIO.SELFTEST.Version", {id, current: current ?? "–", tested: v});
  }).join(", ");
  console.group(`${MODULE_ID} | Self-test`);
  console.log(versions);
  if ( sample ) console.log(sample);
  if ( integrations.length ) console.warn("Integrations:", integrations);
  console.table(results.map(r => ({name: r.name, type: r.type, ok: r.ok, ms: r.ms, problems: r.problems.join("; ")})));
  console.groupEnd();

  const summary = _loc("FOLIO.SELFTEST.Summary", {count: results.length, failed: failed.length,
    integrations: integrations.length});
  if ( failed.length || integrations.length ) ui.notifications.warn(summary, {permanent: true});
  else ui.notifications.info(summary);

  if ( report ) {
    const esc = foundry.utils.escapeHTML;
    const list = items => `<ul>${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`;
    let content = `<h3>${_loc("FOLIO.SELFTEST.Title")}</h3><p>${esc(summary)}</p>`;
    if ( sample ) content += `<p><small>${esc(sample)}</small></p>`;
    content += `<p><small>${esc(versions)}</small></p>`;
    if ( integrations.length ) content += `<h4>${_loc("FOLIO.SELFTEST.Integrations")}</h4>${list(integrations)}`;
    if ( failed.length ) {
      content += `<h4>${_loc("FOLIO.SELFTEST.Failed")}</h4>`
        + list(failed.map(r => `${r.name}: ${r.problems.join("; ")}`));
    }
    await ChatMessage.implementation.create({
      content, whisper: [game.user.id], speaker: {alias: game.modules.get(MODULE_ID).title}
    });
  }
  return {integrations, results};
}

