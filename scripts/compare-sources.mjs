/**
 * Cross-check PalDoc's game data, and say what is out of date.
 *
 *   node scripts/compare-sources.mjs            # fetch (or reuse the cache), compare, print
 *   node scripts/compare-sources.mjs --refresh  # fetch everything again first
 *   node scripts/compare-sources.mjs --apply    # also add the passives the game's own table confirms
 *
 * What ours is checked against (scripts/lib/sources.mjs says what is read from each):
 *   the game     its own data tables, dumped from a copy of Palworld on this machine by
 *                `dotnet run -- --table …` in scripts/pal-textures (see loadGame). The authority
 *                where it is available: ids, ranks, effect values and English names of passives.
 *   paldb.cc     the active-skill, passive-skill and Pals_Table pages, plus the per-pal pages that
 *                `npm run build-pal-extras` cached.
 *   palworld.gg  the /pals list page.
 * Ours also comes from outside: skills.json from PalCalc (game files, July 2026), the rest largely
 * from paldb and the wiki.
 *
 * THE RULE. The websites disagree with each other, and each is wrong somewhere (paldb's appetite
 * values differ from everyone's; checked 2026-10-12). So no website is trusted alone: a value of
 * ours changes only when **two independent sources agree on a different value**, and one source
 * against ours is reported and left alone. The game's own files are not a website: where the dump
 * is present, what it says about a passive is what the game does.
 *
 * Only additions are written, and only with --apply: the passives in NEW_PASSIVES below, each
 * after checking that the game's table has the id with that name and rank.
 */
import fs from 'node:fs';
import path from 'node:path';
import { JOBS, ROOT, compact, element, loadGame, loadPalworldGg, loadPaldb, loadPaldbPals, norm } from './lib/sources.mjs';

const args = new Set(process.argv.slice(2));
const opts = { refresh: args.has('--refresh') };
const R = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));
const mine = { pals: R('src/data/pals.json'), extras: R('src/data/palExtras.json'), skills: R('src/data/skills.json'), passives: R('src/data/passives.json') };

/**
 * Passives the game has and ours lacked (found 2026-10-12, game 1.0.5). Tier is the game's rank
 * (4 and 5 are both "diamond"; passiveCategories.rankOf splits 5 off by the WorldTree_ prefix).
 * Names are the game's own (DT_SkillNameText_Common); effect lines are worded after paldb's, with
 * the figures the game's table gives. Left out on purpose: Tempest Fury (paldb calls it unreleased).
 */
const NEW_PASSIVES = {
  PAL_SpiritualInst: { name: 'Mentally unstable', tier: -1, effects: ['Work Speed -10%', 'Defense -10%'] },
  SelfDeathAddItemDrop_up_1: { name: 'Sharing is Caring', tier: 1, effects: ['Drop Items obtained from this Pal +15%'] },
  MutationPal_Babysitter: { name: 'Babysitter', tier: 'diamond', effects: ['Egg production speed +30% while at a base', 'Incubation speed +30% for Pals assigned to a Breeding Farm'] },
  OctaviaArmorVampire: { name: 'Blood Is Fuel', tier: 'diamond', effects: ['Absorbs a portion of the damage dealt and restores Health', 'Does not sleep at night and continues to work'] },
  Salvation: { name: 'Savior', tier: 'diamond', effects: ['Neutral attack damage +30%', 'Grass attack damage +30%'] },
  WorldTree_Sanity: { name: 'Hermit Sage', tier: 'diamond', effects: ['SAN depletion -50%', 'Work Speed -20%', 'World Tree resources do not vanish when approached'] },
  WorldTree_DEF: { name: 'Sanctified Meat Shield', tier: 'diamond', effects: ['Defense +50%', 'Attack -30%', 'World Tree resources do not vanish when approached'] },
  WorldTree_ATK: { name: 'Twin-Edged Holy Blade', tier: 'diamond', effects: ['Attack +50%', 'Defense -30%', 'World Tree resources do not vanish when approached'] },
  WorldTree_FullStomach: { name: "World Tree's Bounty", tier: 'diamond', effects: ['Hunger depletion -50%', 'HP -20%', 'World Tree resources do not vanish when approached'] },
  RideJumpCount_Increase2: { name: 'Sky Strider', tier: 'diamond', effects: ['Mounted Jump Count +2'] },
};
const tierOfRank = (rank) => (rank >= 4 ? 'diamond' : rank);

const game = loadGame();
const pdb = await loadPaldb(opts);
const pg = await loadPalworldGg(opts);
const pdbPals = loadPaldbPals();

const lines = [];
const say = (s = '') => (lines.push(s), console.log(s));
const head = (s) => say(`\n## ${s}\n`);
const some = (a, n = 8) => (a.length ? a.slice(0, n).join(' | ') + (a.length > n ? ` … (+${a.length - n})` : '') : 'none');
/** The value two or more of `others` agree on, when it is not `own`: the rule's trigger. */
const outvote = (own, others) => {
  const seen = others.filter((v) => v !== undefined);
  for (const v of new Set(seen)) if (v !== own && seen.filter((x) => x === v).length >= 2) return v;
  return undefined;
};
const changes = [];

say('# PalDoc data cross-check');
say(`\n- the game's own tables: ${game ? `${game.passives.size} passive rows, ${game.names.size} skill names (scripts/pal-textures/out/_tables)` : 'not dumped on this machine (see loadGame in scripts/lib/sources.mjs)'}`);
say(`- paldb.cc: ${pdb.version}`);
say(`- palworld.gg: pals list page, no version shown`);
say('- Ours: skills from PalCalc (pinned in scripts/build-skills.mjs), pals and passives from paldb and the wiki');

// ---------------------------------------------------------------- active skills
head('Active skills');
const ourSk = new Map(Object.entries(mine.skills).map(([code, v]) => [compact(code), { code, ...v }]));
const diffs = [];
for (const [k, o] of ourSk) {
  const d = pdb.skills.get(k);
  if (!d) continue;
  const bits = [];
  if (o.name !== d.name) bits.push(`name ${o.name} / ${d.name}`);
  if (o.power !== d.power) bits.push(`power ${o.power} / ${d.power}`);
  if (o.cooldown !== d.cooldown) bits.push(`cooldown ${o.cooldown} / ${d.cooldown}`);
  if (o.element !== element(d.element)) bits.push(`element ${o.element} / ${d.element}`);
  if (bits.length) diffs.push(`${o.code}: ${bits.join(', ')}`);
}
say(`- ours vs paldb on the ${[...ourSk.keys()].filter((k) => pdb.skills.has(k)).length} skills both list (name, element, power, cooldown): ${some(diffs)}`);
const pdbOnly = [...pdb.skills.entries()].filter(([k]) => !ourSk.has(k)).map(([, d]) => d.name);
say(`- Listed by paldb alone: ${pdbOnly.length}, mostly boss, gym and internal actions (Unique_*, Human_*, *_PartnerSkill) a save's pals do not carry. Not added: ${some(pdbOnly, 6)}`);

// ---------------------------------------------------------------- passives
head('Passive skills');
const ourNames = new Set(Object.values(mine.passives).map((p) => norm(p.name ?? '')));
say(`ours ${Object.keys(mine.passives).length} ids; paldb ${pdb.passives.size} names${game ? `; the game's table ${game.passives.size} rows` : ''}`);
if (game) {
  const gone = Object.keys(mine.passives).filter((id) => !game.passives.has(id));
  say(`- ids of ours the game's table does not have: ${some(gone)}`);
  const named = [];
  const ranked = [];
  for (const [id, o] of Object.entries(mine.passives)) {
    const g = game.passives.get(id);
    if (!g) continue;
    const n = game.names.get(id);
    if (n !== undefined && n !== o.name && norm(n) !== norm(o.name ?? '')) named.push(`${id}: ours "${o.name}", the game "${n}"`);
    if (o.tier !== tierOfRank(g.rank)) ranked.push(`${o.name}: ours ${o.tier}, the game's rank ${g.rank}`);
  }
  say(`- names where ours differs from the game's English text: ${some(named)}`);
  say(`- tiers where ours differs from the game's rank: ${some(ranked)}`);
}
const tierBad = [];
for (const o of Object.values(mine.passives)) {
  const d = pdb.passives.get(norm(o.name ?? ''));
  if (d && o.tier !== tierOfRank(d.rank)) tierBad.push(`${o.name}: ours ${o.tier}, paldb rank ${d.rank}`);
}
say(`- our tiers against paldb's ranks: ${tierBad.length ? some(tierBad, 10) : 'all agree'}`);
say(`- on paldb's page but not in ours: ${some([...pdb.passives.values()].filter((d) => !ourNames.has(norm(d.name)) && !/ Lv\. \d|\(Small\)|\(Medium\)|\(Large\)|\+\d$/.test(d.name)).map((d) => d.name))}`);
const savePassives = new Set(R('public', 'demo-roster.json').pals.flatMap((p) => p.passives ?? []));
say(`- ids on pals in public/demo-roster.json (a real save) that ours does not name: ${some([...savePassives].filter((id) => !mine.passives[id]))}`);
/** A new passive is backed when the game's table has the id with that English name and that rank. */
const backed = (id, v) => !!game && game.passives.has(id) && game.names.get(id) === v.name && tierOfRank(game.passives.get(id).rank) === v.tier;
const pending = Object.entries(NEW_PASSIVES).filter(([id]) => !mine.passives[id]);
if (game) {
  const unbacked = Object.entries(NEW_PASSIVES).filter(([id, v]) => !backed(id, v));
  say(`- NEW_PASSIVES against the game's table: ${unbacked.length ? `NOT BACKED: ${unbacked.map(([id]) => id).join(', ')}` : `all ${Object.keys(NEW_PASSIVES).length} have the id, name and rank the game gives`}`);
}

// ---------------------------------------------------------------- pals
head('Pals');
const ourPals = new Map(Object.values(mine.pals).map((p) => [norm(p.name), p]));
say(`ours ${ourPals.size}; palworld.gg ${pg.size}; paldb pages ${pdbPals?.size ?? 'not cached'}`);
say(`- names on palworld.gg but not in ours: ${some([...pg.keys()].filter((k) => !ourPals.has(k)))}`);
say(`- names of ours that palworld.gg lacks: ${some([...ourPals].filter(([k]) => !pg.has(k)).map(([, p]) => p.name))}`);

const tally = { types: [], rarity: [] };
const workSeen = { paldb: {}, 'palworld.gg': {} };
let foodSeen = 0;
for (const [k, o] of ourPals) {
  const g = pg.get(k);
  const d = pdbPals?.get(k);
  const x = mine.extras[o.id];
  if (g && x && g.rarity !== x.rarity) tally.rarity.push(`${o.name}: ${x.rarity} / ${g.rarity}`);
  if (g && [...o.types].sort().join() !== g.elements.join()) tally.types.push(o.name);

  // Work levels, job by job: ours against each source that carries them.
  const own = Object.fromEntries(o.work.map((w) => [w.job, w.level]));
  const per = { paldb: d?.work, 'palworld.gg': g?.work };
  const jobs = new Set([...Object.keys(own), ...Object.values(per).flatMap((m) => (m ? Object.keys(m) : []))]);
  for (const j of jobs) {
    const votes = [];
    for (const [src, m] of Object.entries(per)) {
      if (!m) continue;
      const v = m[j] ?? 0;
      votes.push(v);
      if (v !== (own[j] ?? 0)) (workSeen[src][j] ??= []).push(o.name);
    }
    const v = outvote(own[j] ?? 0, votes);
    if (v !== undefined) changes.push(`${o.name} ${j}: ${own[j] ?? 0} -> ${v}`);
  }
  if (x && d?.food !== undefined && d.food !== x.food) foodSeen++;
}
say(`- elements against palworld.gg: ${tally.types.length ? some(tally.types) : 'all agree'}; rarity: ${tally.rarity.length ? some(tally.rarity) : 'all agree'}`);
for (const [src, jobs] of Object.entries(workSeen)) {
  const bits = Object.entries(jobs).map(([j, names]) => `${j} ${names.length}`);
  say(`- work levels where ${src} differs from ours: ${bits.length ? bits.join(', ') + ` (e.g. ${some(Object.values(jobs).flat(), 4)})` : 'none'}`);
}
say(`- appetite where paldb differs from ours: ${foodSeen} (one source, so left alone)`);

// ---------------------------------------------------------------- verdict
head('What the check found');
say(changes.length ? changes.map((c) => `- ${c}`).join('\n') : '- No value of ours is contradicted by two independent sources.');
say(`- Additions waiting: ${pending.length}${pending.length ? ` (${pending.map(([id]) => id).join(', ')})${args.has('--apply') ? ', writing them now' : '; run with --apply to add them'}` : ''}.`);

if (args.has('--apply') && pending.length) {
  if (!game) throw new Error("The game's tables are not dumped on this machine, so nothing can be confirmed; see loadGame in scripts/lib/sources.mjs.");
  const file = path.join(ROOT, 'src', 'data', 'passives.json');
  const out = { ...mine.passives };
  for (const [id, v] of pending) {
    if (!backed(id, v)) throw new Error(`${id} (${v.name}): the game's table does not have that id with that name and rank; refusing to add it`);
    out[id] = { name: v.name, tier: v.tier, effects: v.effects, lock: null, source: 'game files' };
  }
  fs.writeFileSync(file, JSON.stringify(out));
  say(`\nWrote src/data/passives.json: ${pending.length} added, ${Object.keys(out).length} ids.`);
}
fs.mkdirSync(path.join(ROOT, 'scripts', '.cache', 'sources'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'scripts', '.cache', 'sources', 'report.md'), lines.join('\n') + '\n');
