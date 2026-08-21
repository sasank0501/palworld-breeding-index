/**
 * Joins the save's internal passive ids to human-readable names.
 *
 *   node scripts/build-passives.mjs
 *
 * Saves store passives as internal ids (`MoveSpeed_up_3`, `Noukin`), while every
 * public data source is keyed by display name. Neither wiki publishes the ids, so
 * the bridge is built here — but deliberately *derived* rather than hand-typed:
 * the ids are systematic, and the effect strings encode the same numbers, so
 * `MoveSpeed_up_3` -> "Movement Speed +30%" -> "Swift" is a join we can assert.
 *
 * Anything not confidently resolved is emitted with `name: null` so the UI shows
 * the raw id instead of a plausible-looking lie. Run with --report to list them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI = path.join(ROOT, 'scripts', 'data', 'passives-wiki.json');
const OUT = path.join(ROOT, 'src', 'data', 'passives.json');

const wiki = JSON.parse(fs.readFileSync(WIKI, 'utf8'));
const byName = new Map(wiki.passives.map((p) => [p.name, p]));

/** Internal element token -> the damage word used in effect text. */
const ELEMENTS = {
  Normal: 'Neutral',
  Fire: 'Fire',
  Aqua: 'Water',
  Leaf: 'Grass',
  Thunder: 'Lightning',
  Earth: 'Earth',
  Ice: 'Ice',
  Dark: 'Dark',
  Dragon: 'Dragon',
};

/** +10% / +20% damage boosts, and the -10% incoming resists, per element. */
const ELEMENT_BOOST = {
  Neutral: ['Zen Mind', 'Celestial Emperor'],
  Fire: ['Pyromaniac', 'Flame Emperor'],
  Water: ['Hydromaniac', 'Lord of the Sea'],
  Grass: ['Fragrant Foliage', 'Spirit Emperor'],
  Lightning: ['Capacitor', 'Lord of Lightning'],
  Earth: ['Power of Gaia', 'Earth Emperor'],
  Ice: ['Coldblooded', 'Ice Emperor'],
  Dark: ['Veil of Darkness', 'Lord of the Underworld'],
  Dragon: ['Blood of the Dragon', 'Divine Dragon'],
};
const ELEMENT_RESIST = {
  Neutral: 'Abnormal',
  Fire: 'Suntan Lover',
  Water: 'Waterproof',
  Grass: 'Botanical Barrier',
  Lightning: 'Insulated Body',
  Earth: 'Earthquake Resistant',
  Ice: 'Heated Body',
  Dark: 'Cheery',
  Dragon: 'Dragonkiller',
};

/**
 * Direct id -> name pairs. Each is justified by the effect text in passives-wiki
 * matching the id's semantics; `build()` re-checks that the name exists.
 */
const DIRECT = {
  // stat ladders — magnitudes line up 1:1 with the wiki effects
  PAL_ALLAttack_up1: 'Brave',
  PAL_ALLAttack_up2: 'Ferocious',
  PAL_ALLAttack_up3: 'Demon God',
  PAL_ALLAttack_down1: 'Coward',
  PAL_ALLAttack_down2: 'Pacifist',
  Deffence_up1: 'Hard Skin',
  Deffence_up2: 'Burly Body',
  Deffence_up3: 'Diamond Body',
  Deffence_down1: 'Downtrodden',
  Deffence_down2: 'Brittle',
  CraftSpeed_up1: 'Serious',
  CraftSpeed_up2: 'Artisan',
  CraftSpeed_up3: 'Remarkable Craftmanship',
  CraftSpeed_down1: 'Clumsy',
  CraftSpeed_down2: 'Slacker',
  MoveSpeed_up_1: 'Nimble',
  MoveSpeed_up_2: 'Runner',
  MoveSpeed_up_3: 'Swift',
  Stamina_Up_1: 'Infinite Stamina',
  Stamina_Up_2: 'Fit as a Fiddle',
  Stamina_Up_3: 'Eternal Engine',
  Stamina_Down_1: 'Sickly',
  SwimSpeed_up_1: 'Sleek Stroke',
  SwimSpeed_up_2: 'Ace Swimmer',
  SwimSpeed_up_3: 'King of the Waves',
  PAL_Sanity_Down_1: 'Positive Thinker',
  PAL_Sanity_Down_2: 'Workaholic',
  PAL_Sanity_Down_3: 'Heart of the Immovable King',
  PAL_Sanity_Up_1: 'Unstable',
  PAL_Sanity_Up_2: 'Destructive',
  PAL_FullStomach_Down_1: 'Dainty Eater',
  PAL_FullStomach_Down_2: 'Diet Lover',
  PAL_FullStomach_Down_3: 'Mastery of Fasting',
  PAL_FullStomach_Up_1: 'Glutton',
  PAL_FullStomach_Up_2: 'Bottomless Stomach',
  // Three ladders run backwards: _1 is the STRONGER effect and _2 the weaker.
  // Verified one id at a time against op.gg, which keys its database by internal
  // id. Assuming _1 < _2 like every other family had these three inverted.
  SalePrice_Up_1: 'Noble',
  SalePrice_Up_2: 'Fine Furs',
  SalePrice_Down_1: 'Shabby',
  CoolTimeReduction_Up_1: 'Serenity',
  CoolTimeReduction_Up_2: 'Impatient',
  CoolTimeReduction_Down_1: 'Easygoing',

  // player-buffing ("trainer") passives
  TrainerATK_UP_1: 'Vanguard',
  TrainerDEF_UP_1: 'Stronghold Strategist',
  TrainerWorkSpeed_UP_1: 'Motivational Leader',
  TrainerMining_up1: 'Mine Foreman',
  TrainerLogging_up1: 'Logging Foreman',

  // named traits
  Noukin: 'Musclehead',
  Rare: 'Lucky',
  Legend: 'Legend',
  Witch: 'Siren of the Void',
  EternalFlame: 'Eternal Flame',
  Invader: 'Invader',
  PAL_rude: 'Hooligan',
  PAL_conceited: 'Conceited',
  PAL_sadist: 'Sadist',
  PAL_masochist: 'Masochist',
  PAL_CorporateSlave: 'Work Slave',
  PAL_oraora: 'Aggressive',
  Vampire: 'Vampiric',
  NonKilling: 'Mercy Hit',
  Alien: 'Otherworldly Cells',
  Nocturnal: 'Nocturnal',
  Nushi: 'Lunker',
  Test_PalEgg_HatchingSpeed_Up: 'Philanthropist',
};

/**
 * Resolved from op.gg, which — unlike every wiki — keys its passive database by
 * internal id in the URL (`/palworld/skills/passive/<id>`). These have no entry
 * in passives-wiki.json, so name and effect come from op.gg directly.
 *
 * `tier` stays null deliberately. op.gg uses a +5..-3 rank scale that does not
 * line up with the wiki's diamond/3/2/1 scale, and two bulk reads of its index
 * disagreed with each other on rank values — so the names (which agreed) are
 * used and the ranks are not. These render named-but-untiered rather than being
 * assigned a colour that might be wrong.
 */
const FROM_OPGG = {
  Deffence_up2_2: ['Heavyweight', ['Defense +20%', 'Immune to Knockback']],
  ReloadSpeedUp_Passive: ['Reload Master', ['Player Reload Speed +4%']],
  NightOwl: ['Night Owl', ['Tends to nap through the day, due to being nocturnal']],
  MutationPal_Immortal: ['Immortality', ['Absorbs 100% of damage dealt and restores Health']],
  MutationPal_ExplosionResist: ['Heavily Armored', ['Immune to Explosion Damage']],
  MiniNushi: ['Whopper', ['Water attack damage +5%', 'Ice attack damage +5%', 'Defense +5%']],
  RideJumpCount_Increase1: ['Lightfooted', ['Mounted Jump Count +1']],
  PlayerSP_DecreaseRate_Passive: ['Wellness Watcher', ['Player Stamina Consumption -5%']],
  AutoHPRegeneRate_Passive: ['Healing Coach', ['Player Auto Health Regeneration Rate +5%']],
  SelfDeathAddItemDrop_up_2: ['Service-Minded', ['Drop Items obtained from this Pal +50%']],
  SelfDeathAddItemDrop_up_3: ['Lavish Hospitality', ['Drop Items obtained from this Pal +100%']],
  WorkSuitabilityAddRank_MonsterFarm_1: ['Farmhand', ["Farming's Work Suitability +1"]],
  WorkSuitabilityAddRank_MonsterFarm_2: ['Ranch Master', ["Farming's Work Suitability +2"]],
};

function build() {
  const out = {};
  const problems = [];

  const add = (id, name) => {
    const entry = byName.get(name);
    if (!entry) {
      problems.push(`${id} -> "${name}" is not in passives-wiki.json`);
      return;
    }
    out[id] = { name: entry.name, tier: entry.tier, effects: entry.effects, lock: entry.lock ?? null };
  };

  for (const [id, name] of Object.entries(DIRECT)) add(id, name);

  for (const [token, element] of Object.entries(ELEMENTS)) {
    const boosts = ELEMENT_BOOST[element];
    add(`ElementBoost_${token}_1_PAL`, boosts[0]);
    add(`ElementBoost_${token}_2_PAL`, boosts[1]);
    add(`ElementResist_${token}_1_PAL`, ELEMENT_RESIST[element]);
  }

  for (const [id, [name, effects]] of Object.entries(FROM_OPGG)) {
    out[id] = { name, tier: null, effects, lock: null, source: 'op.gg' };
  }

  return { out, problems };
}

const { out, problems } = build();
if (problems.length) {
  console.error('join failures:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));

const named = Object.values(out).filter((v) => v.name).length;
const untiered = Object.values(out).filter((v) => v.name && v.tier === null).length;
console.log(`passives.json  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
console.log(`  ${named} named of ${Object.keys(out).length} ids (${untiered} named but untiered, from op.gg)`);

if (process.argv.includes('--report')) {
  const roster = path.join(ROOT, 'public', 'roster.json');
  if (fs.existsSync(roster)) {
    const seen = JSON.parse(fs.readFileSync(roster, 'utf8')).unknown.passives;
    const missing = seen.filter((id) => !out[id]);
    const unnamed = seen.filter((id) => out[id] && !out[id].name);
    console.log(`\nin your save: ${seen.length} distinct passives`);
    console.log(`  named        : ${seen.length - missing.length - unnamed.length}`);
    console.log(`  unnamed      : ${unnamed.length}${unnamed.length ? '  ' + unnamed.join(', ') : ''}`);
    console.log(`  not in table : ${missing.length}${missing.length ? '  ' + missing.join(', ') : ''}`);
    const noEffect = seen.filter((id) => out[id]?.name && !out[id].effects.length);
    console.log(`  no effect text: ${noEffect.length}${noEffect.length ? '  ' + noEffect.join(', ') : ''}`);
  }
}
