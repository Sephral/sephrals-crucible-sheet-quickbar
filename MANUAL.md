# Sephral’s Crucible Sheet & Quickbar Manual

This manual covers the details. For a quick overview see the [README](README.md).

## Installation

Requirements: Foundry VTT 14 and the Crucible system 0.11 or newer. Ember is optional. With it the sheet shows the *Attunement* tab.

1. Install the module from Foundry's module browser (search for *Crucible Sheet & Quickbar*), with its manifest URL `https://github.com/Sephral/sephrals-crucible-sheet-quickbar/releases/latest/download/module.json`, or unpack the release zip into `Data/modules/sephrals-crucible-sheet-quickbar/`. The folder name must match, and `module.json` lies directly inside.
2. Enable the module in the world (*Manage Modules*, GM).
3. Choose the sheet for yourself: right click your character in the actor directory → *Use Sheet & Quickbar (just for me)*.

## Who sees the sheet

Enabling the module changes nothing for anyone. Each user chooses for themselves:

* **For all their characters:** *Configure Settings → Sephral’s Crucible Sheet & Quickbar → Use Sheet & Quickbar for*: all heroes and adversaries, heroes only, only characters chosen one by one, or as set by the GM (default).
* **For a single character:** right click the actor in the actor directory → *Use Sheet & Quickbar (just for me)*, use the ⋮ menu of the Crucible sheet, or open Foundry's *Configure Sheet* dialog, which gets a section *just for you* at the top. The ⋮ menu of this sheet switches back to the standard sheet.
* **For everyone (GM):** *Default for everyone* sets the sheet for heroes, or heroes and adversaries, for all users who follow the GM. The default is *Nobody*.

The choice is personal and never changes the actor. That is why it is not one of the sheet types in Foundry's *Configure Sheet* dialog, whose choices apply to all users. The dialog shows the personal choice in a section of its own instead. Open sheets switch immediately. The other features (turn notice, spellbook strip in Crucible's spell dialog, version notice for the GM) only act for characters the user sees in this sheet. Character creation (level 0) keeps using the system's creation sheet.

## The sheet

* **Header (always visible):** portrait with level and milestone bar, health and wounds, morale and madness with thresholds, action, focus and heroism as clickable pips, active conditions, abilities, defenses (physical with its composition bar), movement, size, stride.
* **Play:** sidebar with equipment, skills (click for a check), resistances, knowledge and languages. Next to it all actions with cost chips, target, search and filters.
* **Inventory, Talents, Training, Spells, Effects, Attunement (Ember, heroes only), Biography.**

The adversary sheet uses the same layout, adapted to Crucible adversaries: taxonomy and archetype, threat rank, level with fractional steps, a star for *important* adversaries (only those show wounds and madness), heroism only when present, no rest buttons.

The module brings German skill and training names (Athletik, Wahrnehmung, Arkanes …).

## Shortcuts and quality of life

| Feature | How |
| --- | --- |
| Use an action or item | Click its icon |
| Roll without the dialog | Shift+click, or the *Quick mode* setting, which reverses it. Targets are still checked like in the dialog (range, count, flanking …) |
| Read a description | Click the name to expand the details inline |
| Open an item sheet | Double click a row |
| Context menu | Right click (use, use immediately, favorite, equip, edit, delete) |
| Search | Search field per tab, Escape clears it |
| Usable now | Hides actions whose cost cannot be paid right now |
| Relative values | Type "-7" or "+5" into a resource field |
| Play and edit mode | Lock in the header. Play mode hides delete and edit controls |
| Recover and rest | Buttons in the header (heroes) |
| Your turn | Glowing portrait, initiative badge and an *End turn* button in the header and the quickbar. Only the GM can end the last turn of a round (a Crucible rule), and the button shows that |
| Next turn | When your hero acts next in the round, the initiative badge and the quickbar get a quiet frame and a short notice appears |
| Delay | After Crucible's *Delay* action an hourglass next to the initiative shows the new and the original initiative |
| Cost preview | Hovering an action pulses the action, focus and heroism pips it costs. Missing pips turn red |
| Conditions | In the header and the quickbar with their remaining rounds. Maintained effects have a gold frame and an ✕ to end them. When their maintenance is due (Crucible 0.11.2) they pulse, and on your own turn a button pays the Focus with Crucible's Maintain action |
| Repeat last spell | Button in the Spells tab and the quickbar |
| Sort favorites | Drag and drop favorites (and quickbar buttons) |
| Pin skills | Pin icon next to a skill: it then appears among the favorites and in the quickbar |
| Charges | −/+ next to charges in the inventory |
| Keyboard | Every clickable element is reachable with Tab. Enter or Space triggers it |
| Keybindings | Switch between sheet and quickbar, end your turn, use quickbar buttons 1 to 9. They have no default keys, because core already uses the digits and Q/E. Assign them under *Configure Controls* |
| Penalties | Negative values red, bonuses green |
| Settings | Gear button in the sheet header (quickbar: in its title bar) opens the module's page in Foundry's settings |

## Quickbar

**Double click the title bar** of the sheet (or use the button in the header) to turn the sheet into a small, translucent bar that can stay open during play. Double click again (or use the arrow button in the bar) to restore the full sheet in its old place. It works for adversaries too.

* Portrait with level and initiative, health and morale as bars with direct input ("-7", "+5"), action, focus and heroism pips, defenses, active conditions, *End turn*.
* Action bar: favorites, spellbook entries and pinned skills in favorite order, with cost or bonus badges. Click to use, Shift+click to use immediately, right click for the menu, hover for Crucible's card. Outside your own turn Crucible adds reactions automatically.
* The dice button expands all skills for direct checks.
* Transparent while the mouse is elsewhere (*Quickbar opacity* setting), fully visible on hover and on your turn (then the frame glows).
* Escape does not close the bar. Mode, position and *open* are remembered per actor in the browser. An open bar reopens after a reload.
* **Targets:** with tokens targeted, a row shows name, physical defense, the three saves, distance and the target's conditions as small icons. The GM also sees health, and the frame color shows hostile or friendly. Click to pan to the token. Buttons that cannot reach this target (too close, too far, not flanked …) are marked red. The ⛔ icon names the reason.

## In combat

* **Players:** when your hero's turn begins, its quickbar opens (if the sheet is closed), glows and announces the turn. An open full sheet stays a full sheet. One turn earlier a short notice says that you are next.
* **GM combat bar:** when an adversary's turn begins, its quickbar opens in a fixed place and its token is selected. The bar follows the next adversary and closes on hero turns. Moving it sets the place. Double click turns it into an ordinary sheet that stays open.
* Adversaries without favorites get their attacks, abilities and *Defend* in the quickbar automatically.
* If a healing effect (for example a healing potion) targets an adversary, the module asks first.

## Spellbook

Composed spells (rune + gesture + optional inflection, and the damage type where it can be chosen) can be saved as presets and cast again with one click. They belong to the character, so they are available on every device.

| Where | What |
| --- | --- |
| Spells tab → *Create Spell* | Builder with live preview (name, cost, target) and an optional custom name. Saves without casting |
| Crucible's spell dialog | *Spellbook* strip: a chip loads a preset, *☆ Save* stores the current combination (for characters the user sees in this sheet) |
| Play tab favorites, Spells tab | Click the icon and the dialog opens filled in. Shift+click casts immediately. The star removes it |
| Rename | Right click → *Rename*, or the pencil in edit mode. Leave it empty to use the spell name |

If the hero no longer knows a component (for example after a talent respec), the entry stays visible, greyed out, and names the missing component. Spells and actions placed on the map (aura, cone, summon …) always open the dialog, because the region is placed there. As usual in Crucible, damage, healing and costs apply once the GM confirms the chat card.

## Settings

All options are in Foundry's settings dialog (*Configure Settings*) on the page of this module. The gear button in the sheet header, or in the title bar of the quickbar, opens that page directly. They appear in this order:

| Topic | Options |
| --- | --- |
| Language | *Follow Foundry* (default), *Deutsch* or *English*, for this module only |
| Sheet | Use Sheet & Quickbar for (as set by the GM, all, heroes only, one by one). For the GM also the default for everyone |
| Display | Color scheme, background and its opacity, compact mode, quickbar opacity, double click on the title bar, remaining rounds on conditions |
| Controls | Quick mode, cost preview, repeat last spell, spellbook in the spell dialog, confirmation before healing adversaries |
| Targets | Target in the quickbar, mark unsuitable actions |
| Combat | Quickbar on your turn, announce your turn, combat bar (GM), fill adversary quickbars (GM) |
| Self test (GM) | Button *Run self-test* at the top of the page |
| Debug file (GM) | Button *Save debug file*, see [Debug file](#debug-file) |

The language is stored per browser, like in every Sephral module. *Follow Foundry* uses Foundry's language, including community translations. A fixed choice switches the module's own texts only, Crucible keeps Foundry's language. Personal options apply per user on every device, world options apply to everyone.

* **Background:** *Transparent* (default, opacity 0.3: the map shows through, blurred), *Solid*, *Crucible* (texture and arena motif of the standard Crucible sheet), *Ember codex* (only with the Ember module). Every variant exists in the dark and the light theme. The quickbar keeps its own background.
* **Compact mode** (default: on) makes type, icons and spacing smaller in the sheet and the quickbar. New sheets open a little smaller, open windows switch immediately.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For Sheet & Quickbar it holds:

* on how many of the last 30 days the module was used
* how often actions are used from the sheet or the quickbar, the quickbar is shown or hidden, skills are rolled, spells are cast or repeated from the spellbook, the quickbar follows the combatant whose turn it is and the keyboard shortcuts are used
* the settings *Color scheme*, *Compact mode* and *Default for everyone* (only the chosen option)
* where errors occur in the module code: file, line and error type, never the error message

No names, chat messages, notes, dice results or other content of the world are sent.

## Migration from Crucible Folio

The module was previously called *Crucible Folio*. On the first start it takes over your settings, spellbooks, favorites and pinned skills once. Nothing is deleted, so you can go back if needed. While *Crucible Folio* is still enabled in the same world, this module waits and asks the GM to disable the old one.

## Self test after updates

Crucible is still before 1.0 and changes between versions. After an update of Foundry, Crucible or Ember the module tells the GM once that newer versions are running. Then click *Run self-test* on the module's settings page. It checks every hero sheet and a sample of adversaries, changes nothing and whispers a report to the GM.

## Debug file

For bug reports, the GM saves one file about all of Sephral’s modules in this world: `Save debug file` in the module settings, or `Save Debug File (Sephral’s Modules)` in the context menu of a chat message. It holds the versions of Foundry, the system and the active modules, the settings of the modules and what they recorded, for Sheet & Quickbar the verified and installed versions of Crucible and Ember, whether the sheets are in use and the quickbars this browser remembers. Macros call `game.modules.get("sephrals-crucible-sheet-quickbar").api.saveDebugFile()`.

The file contains chat text and whispers. Check it before you share it.

## Limitations

* Crucible only. In worlds of other systems the module does nothing.
* Verified with Crucible 0.11.2, Ember 0.6.3 and Foundry 14.369. Run the self test after updates.
* Character creation (level 0) keeps using the system's creation sheet.
* The *Attunement* tab and the *Ember codex* background need the Ember module.
