/**
 * Cross-check PalDoc's game data against three public sources, and say what is out of date.
 *
 *   node scripts/compare-sources.mjs            # fetch (or reuse the cache), compare, print
 *   node scripts/compare-sources.mjs --refresh  # fetch everything again first
 *   node scripts/compare-sources.mjs --apply    # also add the passives two sources confirm
 *
 * Sources (scripts/lib/sources.mjs says what is read from each, and why that is allowed):
 *   PalSphere    palsphere.app/data/v1, its open-data export. Credit PalSphere wherever its data is used.
 *   paldb.cc     the active-skill, passive-skill and Pals_Table pages, plus the per-pal pages that
 *                `npm run build-pal-extras` cached.
 *   palworld.gg  the /pals list page.
 * Ours also comes from outside: skills.json from PalCalc (game files, July 2026), the rest largely
 * from paldb and the wiki.
 *
 * THE RULE. The sources disagree with each other, and each is wrong somewhere (PalSphere's skill
 * numbers are the Early Access ones; paldb's appetite values differ from everyone's; checked
 * 2026-10-12). So no source is trusted alone. A value of ours changes only when **two independent
 * sources agree on a different value**. One source against ours is reported and left alone, and
 * a three-way split is a dispute, also left alone. The report ends with what the rule found.
 *
 * Only additions that pass the rule are written, and only with --apply: the passives in
 * NEW_PASSIVES below, after checking each is still listed by both PalSphere and paldb.
 */
import fs from 'node:fs';
import path from 'node:path';
import { JOBS, ROOT, compact, element, loadPalSphere, loadPalworldGg, loadPaldb, loadPaldbPals, norm } from './lib/sources.mjs';

const args = new Set(process.argv.slice(2));
const opts = { refresh: args.has('--refresh') };
const R = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));
const mine = { pals: R('src/data/pals.json'), extras: R('src/data/palExtras.json'), skills: R('src/data/skills.json'), passives: R('src/data/passives.json'), combos: R('src/data/combos.json') };

/**
 * Passives that PalSphere and paldb both list and ours lacks (found 2026-10-12, game 1.0.5). Tier is paldb's
 * rank (4 and 5 are both "diamond"; passiveCategories.rankOf splits 5 off by the WorldTree_ prefix).
 * Effect lines are paldb's wording, with PalSphere's where paldb shows an unfilled "0%".
 * Left out on purpose: Tempest Fury (both call it unreleased, "no effect in current game data"), the seven
 * ranch-drop passives (CollectItem_*, PalSphere only) and Sky Strider (paldb only).
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
};

/**
 * Passives with the evidence of a real save instead of a second site: the id is carried by pals in
 * public/demo-roster.json, and paldb names the passive and gives the effect that the id's own number
 * implies (RideJumpCount_Increase1 is Lightfooted, "Mounted Jump Count +1"; Increase2 is "+2").
 * Added only while paldb still lists that name and effect.
 */
const FROM_SAVE = {
  RideJumpCount_Increase2: { name: 'Sky Strider', tier: 'diamond', effects: ['Mounted Jump Count +2'], effect: /Jump Count \+2/ },
};

const ps = await loadPalSphere(opts);
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
say(`\n- PalSphere: game ${ps.manifest.game.version}, extracted ${ps.manifest.extractedAt}`);
say(`- paldb.cc: ${pdb.version}`);
say(`- palworld.gg: pals list page, no version shown`);
say('- Ours: skills from PalCalc (pinned in scripts/build-skills.mjs), pals and passives from paldb and the wiki');

// ---------------------------------------------------------------- active skills
head('Active skills');
const ourSk = new Map(Object.entries(mine.skills).map(([code, v]) => [compact(code), { code, ...v }]));
const psSk = new Map(ps.active.map((a) => [compact(a.codename.replace(/^ACTION_SKILL_/, '')), a]));
const groups = {};
for (const k of new Set([...ourSk.keys(), ...psSk.keys(), ...pdb.skills.keys()])) {
  const g = [ourSk.has(k) && 'ours', psSk.has(k) && 'PalSphere', pdb.skills.has(k) && 'paldb'].filter(Boolean).join(' + ');
  groups[g] = (groups[g] ?? 0) + 1;
}
say(`Skills by who lists them: ${Object.entries(groups).map(([g, n]) => `${g}: ${n}`).join('; ')}`);
const diffs = [];
let psSame = 0;
let psShared = 0;
for (const [k, o] of ourSk) {
  const d = pdb.skills.get(k);
  const p = psSk.get(k);
  if (d) {
    const bits = [];
    if (o.name !== d.name) bits.push(`name ${o.name} / ${d.name}`);
    if (o.power !== d.power) bits.push(`power ${o.power} / ${d.power}`);
    if (o.cooldown !== d.cooldown) bits.push(`cooldown ${o.cooldown} / ${d.cooldown}`);
    if (o.element !== element(d.element)) bits.push(`element ${o.element} / ${d.element}`);
    if (bits.length) diffs.push(`${o.code}: ${bits.join(', ')}`);
  }
  if (p) {
    psShared++;
    if (p.power === o.power && p.cooldown === o.cooldown) psSame++;
    for (const f of ['power', 'cooldown']) {
      const v = outvote(o[f], [d?.[f], p[f]]);
      if (v !== undefined) changes.push(`skill ${o.code} ${f}: ${o[f]} -> ${v}`);
    }
  }
}
say(`- ours vs paldb on the ${[...ourSk.keys()].filter((k) => pdb.skills.has(k)).length} skills both list (name, element, power, cooldown): ${some(diffs)}`);
say(`- PalSphere's power and cooldown equal ours on only ${psSame} of ${psShared} shared skills (paldb differs from ours on ${diffs.length}). Its numbers are the old Early Access ones (Acid Rain 80 / 18 s; the game and paldb say 120 / 8 s), so they are not trusted.`);
const stale = [...psSk.entries()].filter(([k]) => !ourSk.has(k) && !pdb.skills.has(k)).map(([, a]) => `${a.name} (id ${a.codename.replace(/^ACTION_SKILL_/, '')})`);
say(`- Listed by PalSphere alone, under old names the game no longer uses (Sand Blast for Sand Tornado, Draconic Breath for Dragon Breath…): ${some(stale)}`);
const pdbOnly = [...pdb.skills.entries()].filter(([k]) => !ourSk.has(k) && !psSk.has(k)).map(([, d]) => d.name);
say(`- Listed by paldb alone: ${pdbOnly.length}, mostly boss, gym and internal actions (Unique_*, Human_*, *_PartnerSkill) a save's pals do not carry. Not added: ${some(pdbOnly, 6)}`);

// ---------------------------------------------------------------- passives
head('Passive skills');
const psPassive = new Map(ps.passive.map((p) => [p.id, p]));
const ourNames = new Set(Object.values(mine.passives).map((p) => norm(p.name ?? '')));
const candidates = ps.passive.filter((p) => !mine.passives[p.id] && !ourNames.has(norm(p.name)));
const confirmed = candidates.filter((p) => pdb.passives.has(norm(p.name)) && !/unreleased/i.test(p.description ?? ''));
say(`ours ${Object.keys(mine.passives).length} ids; PalSphere ${ps.passive.length}; paldb ${pdb.passives.size} names`);
say(`- missing from ours, listed by PalSphere and paldb, and live: ${confirmed.length}: ${confirmed.map((p) => `${p.name} (${p.id})`).join(', ')}`);
say(`- missing from ours, one source only (not added): ${some(candidates.filter((p) => !confirmed.includes(p)).map((p) => `${p.name} (${/unreleased/i.test(p.description ?? '') ? 'unreleased' : 'PalSphere only'})`))}`);
say(`- in paldb but not in ours or PalSphere: ${some([...pdb.passives.values()].filter((d) => !ourNames.has(norm(d.name)) && !ps.passive.some((p) => norm(p.name) === norm(d.name)) && !/ Lv\. \d|\(Small\)|\(Medium\)|\(Large\)|\+\d$/.test(d.name)).map((d) => d.name))}`);
const tierBad = [];
for (const [id, o] of Object.entries(mine.passives)) {
  const d = pdb.passives.get(norm(o.name ?? ''));
  if (!d) continue;
  const t = d.rank >= 4 ? 'diamond' : d.rank;
  if (o.tier !== t) tierBad.push(`${o.name}: ours ${o.tier}, paldb rank ${d.rank}`);
  const p = psPassive.get(id);
  if (p && norm(p.name) !== norm(o.name)) tierBad.push(`${id}: name ${o.name} / ${p.name}`);
}
say(`- our tiers and names against paldb's ranks and PalSphere's names: ${tierBad.length ? some(tierBad, 10) : 'all agree'}`);
const savePassives = new Set(R('public', 'demo-roster.json').pals.flatMap((p) => p.passives ?? []));
const unnamed = [...savePassives].filter((id) => !mine.passives[id]);
say(`- ids on pals in public/demo-roster.json (a real save) that ours does not name: ${unnamed.length ? unnamed.map((id) => (FROM_SAVE[id] ? `${id} (= ${FROM_SAVE[id].name}, to add)` : id)).join(', ') : 'none'}`);
const fromSaveOk = (id, v) => savePassives.has(id) && pdb.passives.get(norm(v.name))?.text && v.effect.test(pdb.passives.get(norm(v.name)).text);
const missingApply = Object.entries(NEW_PASSIVES).filter(([id, v]) => !mine.passives[id] && !(psPassive.has(id) && pdb.passives.has(norm(v.name))));
if (missingApply.length) say(`\nWARNING: NEW_PASSIVES entries no longer backed by both sites: ${missingApply.map(([id]) => id).join(', ')}`);

// ---------------------------------------------------------------- pals
head('Pals');
const ourPals = new Map(Object.values(mine.pals).map((p) => [norm(p.name), p]));
const psPals = new Map(ps.species.filter((s) => s.isInPaldeck && s.displayName).map((s) => [norm(s.displayName), s]));
say(`ours ${ourPals.size}; PalSphere's Paldeck ${psPals.size}; palworld.gg ${pg.size}; paldb pages ${pdbPals?.size ?? 'not cached'}`);
say(`- names in a source but not in ours: PalSphere ${some([...psPals.keys()].filter((k) => !ourPals.has(k)))}; palworld.gg ${some([...pg.keys()].filter((k) => !ourPals.has(k)))}`);
say(`- names of ours that a source lacks: PalSphere ${some([...ourPals].filter(([k]) => !psPals.has(k)).map(([, p]) => p.name))}; palworld.gg ${some([...ourPals].filter(([k]) => !pg.has(k)).map(([, p]) => p.name))}`);

const tally = { types: [], rank: [], rarity: [], partner: [] };
const workSeen = { PalSphere: {}, paldb: {}, 'palworld.gg': {} };
const foodSeen = { PalSphere: 0, paldb: 0 };
for (const [k, o] of ourPals) {
  const s = psPals.get(k);
  const g = pg.get(k);
  const d = pdbPals?.get(k);
  const x = mine.extras[o.id];
  if (s) {
    if ([...s.elements.map(element)].sort().join() !== [...o.types].sort().join()) tally.types.push(o.name);
    if (s.combiRank !== o.power) tally.rank.push(`${o.name}: ${o.power} / ${s.combiRank}`);
    if (x && s.rarity !== x.rarity) tally.rarity.push(`${o.name}: ${x.rarity} / ${s.rarity}`);
    if (x?.partner?.name && s.partnerSkill?.title !== x.partner.name) tally.partner.push(o.name);
  }
  if (g && x && g.rarity !== x.rarity) tally.rarity.push(`${o.name} (palworld.gg): ${x.rarity} / ${g.rarity}`);
  if (g && [...o.types].sort().join() !== g.elements.join()) tally.types.push(`${o.name} (palworld.gg)`);

  // Work levels, job by job: ours against each source that carries them.
  const own = Object.fromEntries(o.work.map((w) => [w.job, w.level]));
  const sw = s ? Object.fromEntries(s.workSuitability.map((w) => [JOBS[w.key] ?? w.key, w.level])) : undefined;
  const per = { PalSphere: sw, paldb: d?.work, 'palworld.gg': g?.work };
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
  // Appetite.
  if (x) {
    const fs_ = [s?.foodAmount, d?.food];
    if (fs_[0] !== undefined && fs_[0] !== x.food) foodSeen.PalSphere++;
    if (fs_[1] !== undefined && fs_[1] !== x.food) foodSeen.paldb++;
    const v = outvote(x.food, fs_);
    if (v !== undefined) changes.push(`${o.name} food: ${x.food} -> ${v}`);
  }
}
say(`- elements: ${tally.types.length ? some(tally.types) : 'all agree'}; breeding rank (power): ${tally.rank.length ? some(tally.rank) : 'all agree'}; rarity: ${tally.rarity.length ? some(tally.rarity) : 'all agree'}; partner skill names: ${tally.partner.length ? some(tally.partner) : 'all agree'}`);
for (const [src, jobs] of Object.entries(workSeen)) {
  const bits = Object.entries(jobs).map(([j, names]) => `${j} ${names.length}`);
  say(`- work levels where ${src} differs from ours: ${bits.length ? bits.join(', ') + ` (e.g. ${some(Object.values(jobs).flat(), 4)})` : 'none'}`);
}
say(`- appetite where a source differs from ours: PalSphere ${foodSeen.PalSphere} (it has a value for only ${[...psPals.values()].filter((s) => s.foodAmount !== undefined).length} pals), paldb ${foodSeen.paldb}`);

// ---------------------------------------------------------------- breeding
head('Breeding');
const idOf = new Map(Object.values(mine.pals).map((p) => [compact((p.img ?? p.name).replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '')), p.id]));
let agree = 0;
let skipped = 0;
const wrong = [];
for (const u of ps.breeding) {
  const c = idOf.get(compact(u.child));
  const a = idOf.get(compact(u.parentA));
  const b = idOf.get(compact(u.parentB));
  if (!c || !a || !b) {
    skipped++;
    continue;
  }
  if ((mine.combos[c] ?? []).some(([x, y]) => (x === a && y === b) || (x === b && y === a))) agree++;
  else wrong.push(`${u.parentAName} + ${u.parentBName} -> ${u.childName}`);
}
say(`PalSphere's ${ps.breeding.length} special breeding rules: ${agree} are in our matrix, ${wrong.length} are not${wrong.length ? ` (${some(wrong)})` : ''}, ${skipped} involve a pal that is not in the Paldex.`);

// ---------------------------------------------------------------- verdict
head('What the rule found');
say(changes.length ? changes.map((c) => `- ${c}`).join('\n') : '- No value of ours is contradicted by two independent sources.');
const pendingSave = Object.entries(FROM_SAVE).filter(([id, v]) => !mine.passives[id] && fromSaveOk(id, v));
say(`- Additions: ${confirmed.length} passives confirmed by two sources, ${pendingSave.length} by a save and paldb${args.has('--apply') ? ' (writing them now)' : ' (run with --apply to add them)'}.`);

if (args.has('--apply')) {
  const file = path.join(ROOT, 'src', 'data', 'passives.json');
  const out = { ...mine.passives };
  let added = 0;
  for (const [id, v] of Object.entries(NEW_PASSIVES)) {
    if (out[id]) continue;
    if (!(psPassive.has(id) && pdb.passives.has(norm(v.name)))) throw new Error(`${id} (${v.name}) is not listed by both PalSphere and paldb; refusing to add it`);
    out[id] = { name: v.name, tier: v.tier, effects: v.effects, lock: null, source: 'paldb + PalSphere' };
    added++;
  }
  for (const [id, v] of pendingSave) {
    out[id] = { name: v.name, tier: v.tier, effects: v.effects, lock: null, source: 'paldb + a real save' };
    added++;
  }
  fs.writeFileSync(file, JSON.stringify(out));
  say(`\nWrote src/data/passives.json: ${added} added, ${Object.keys(out).length} ids.`);
}
fs.mkdirSync(path.join(ROOT, 'scripts', '.cache', 'sources'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'scripts', '.cache', 'sources', 'report.md'), lines.join('\n') + '\n');
