import skillsJson from '../../data/skills.json';
import { WorkIcon, displayName, ivTotal, palLabel, speciesName } from '../../components/PalCards.tsx';
import { WORK_LEVEL_CAP, workBonuses, workName, workOrder } from '../../data/work.ts';
import { FOOD_SLOTS, foodFor, levelProgress, partnerSkillFor } from '../../design/palExtras.ts';
import type { ActiveSkill, RosterPal } from '../../types.ts';
import { isFavourite, toggleFavourite } from '../../userdata/edit.ts';
import type { Ctx } from './ctx.ts';
import { FavStar } from './Fav.tsx';
import { PalNote } from './Note.tsx';
import { DEX, LOCATION, PASSIVES, TraitName, byRank, traitClass, traitGlyph } from './shared.tsx';
import { ElementChips, Stage, elementOf, stagger, tierOf, title } from './parts.tsx';

const SKILLS = skillsJson as unknown as Record<string, ActiveSkill>;
const grade = (v: number): string => (v >= 80 ? 'S' : v >= 60 ? 'A' : v >= 30 ? 'B' : 'C');

/** One pal in full: its 3D chibi, potential, passives, techniques and jobs. */
export function PalSheet({
  pal,
  index,
  total,
  onStep,
  onSpecies,
  user,
}: {
  pal: RosterPal;
  /** The player's data for this world, for the star and the note. */
  user?: Ctx['user'];
  /** Position in the list it was opened from, for the previous/next arrows. */
  index: number;
  total: number;
  onStep: (delta: number) => void;
  onSpecies: (id: string) => void;
}) {
  const id = pal.palId ?? '';
  const dex = DEX[id];
  const name = displayName(pal);
  const partner = partnerSkillFor(pal.palId);
  const food = foodFor(pal.palId) ?? 0;
  const xp = levelProgress(pal.level, pal.exp);
  const skills = [...new Set([...(pal.skills?.equipped ?? []), ...(pal.skills?.learned ?? [])])];
  const equipped = new Set(pal.skills?.equipped ?? []);

  const bonuses = workBonuses(pal.passives);
  const base = new Map((dex?.work ?? []).map((w) => [w.job, w.level]));
  const work = [...new Set([...base.keys(), ...bonuses.keys()])]
    .map((job) => ({
      job,
      level: Math.min(WORK_LEVEL_CAP, (base.get(job) ?? 0) + (bonuses.get(job) ?? 0)),
      boosted: bonuses.has(job),
    }))
    .sort((a, b) => workOrder(a.job) - workOrder(b.job));

  return (
    <article className={`sc-doss sc-palsheet tier-${tierOf(id)} e-${elementOf(id)}`} key={pal.instanceId}>
      <header className="sc-doss-hero">
        <div className="sc-doss-stage sc-in" style={stagger(0)}>
          <Stage id={id} pal={pal} picker />
          {total > 1 && (
            <span className="sc-stepper">
              <button onClick={() => onStep(-1)} disabled={index <= 0} aria-label="Previous pal">
                ‹
              </button>
              <small>
                {index + 1} / {total}
              </small>
              <button onClick={() => onStep(1)} disabled={index >= total - 1} aria-label="Next pal">
                ›
              </button>
            </span>
          )}
        </div>

        <div className="sc-doss-head">
          <p className="sc-kicker sc-in" style={stagger(1)}>
            Lv {pal.level} · {tierOf(id)} · {LOCATION[pal.location.kind] ?? pal.location.kind}
          </p>
          <div className="sc-doss-titlerow sc-in" style={stagger(2)}>
            <h1 className="sc-doss-name">
              {name}
              {pal.isBoss && <span className="sc-tag alpha">Alpha</span>}
              {pal.isLucky && <span className="sc-tag lucky">Lucky</span>}
            </h1>
            {user?.data && pal.instanceId && (
              <FavStar name={name} on={isFavourite(user.data, pal.instanceId)} onToggle={() => user.edit((d) => toggleFavourite(d, pal.instanceId, undefined, palLabel(pal)))} />
            )}
          </div>
          <div className="sc-in sc-doss-sub" style={stagger(3)}>
            <ElementChips id={id} labels />
            <button className="sc-link" onClick={() => onSpecies(id)}>
              {pal.nickname ? `${speciesName(pal)} · ` : ''}see species →
            </button>
          </div>
          <div className="sc-xp sc-in" style={stagger(3)} title="Progress to the next level">
            <span style={{ width: `${Math.round(xp * 100)}%` }} />
          </div>

          <div className="sc-ivs big sc-in" style={stagger(4)}>
            {(
              [
                ['Health', pal.ivs.hp],
                ['Attack', pal.ivs.attack],
                ['Defense', pal.ivs.defense],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className={v >= 80 ? 'top' : ''}>
                <span className={`sc-grade g-${grade(v)}`}>{grade(v)}</span>
                <span>{label}</span>
                <i>
                  <b style={{ width: `${v}%` }} />
                </i>
                <em>{v}</em>
              </div>
            ))}
            <p className="sc-iv-total">
              <b>{ivTotal(pal)}</b> / 300 potential
            </p>
          </div>

          {user && pal.instanceId && <PalNote instanceId={pal.instanceId} name={name} label={palLabel(pal)} user={user} />}

          <dl className="sc-facts sc-in" style={stagger(5)}>
            <div>
              <dt>Condensed</dt>
              <dd>{pal.rank > 1 ? '★'.repeat(pal.rank - 1) : '—'}</dd>
            </div>
            <div>
              <dt>Sex</dt>
              <dd>{pal.gender === 'female' ? '♀' : pal.gender === 'male' ? '♂' : '—'}</dd>
            </div>
            <div>
              <dt>Appetite</dt>
              <dd>
                {food || '—'}
                <small>/{FOOD_SLOTS}</small>
              </dd>
            </div>
            <div>
              <dt>Element</dt>
              <dd>{dex?.types.map(title).join(' / ') ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="sc-doss-grid">
        <section className="sc-card wide sc-in" style={stagger(3)}>
          <h2 className="sc-h3">
            Passive skills <span>{pal.passives.length} of 4</span>
          </h2>
          {pal.passives.length === 0 ? (
            <p className="sc-muted">No passives.</p>
          ) : (
            <ul className="sc-passives">
              {byRank(pal.passives).map((pid) => (
                <li key={pid} className={traitClass(pid)}>
                  <b>
                    <i>{traitGlyph(pid)}</i>
                    <TraitName id={pid} />
                  </b>
                  <span>{PASSIVES[pid]?.effects?.length ? PASSIVES[pid].effects.join(' · ') : 'Effect not yet verified.'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {partner && (
          <section className="sc-card sc-in" style={stagger(4)}>
            <h2 className="sc-h3">
              Partner skill <span>Lv {pal.rank}</span>
            </h2>
            <p className="sc-partner-name">{partner.name}</p>
            <p className="sc-partner-desc">{partner.description}</p>
          </section>
        )}

        <section className="sc-card sc-in" style={stagger(5)}>
          <h2 className="sc-h3">
            Work suitability
          </h2>
          {work.length === 0 ? (
            <p className="sc-muted">None.</p>
          ) : (
            <ul className="sc-work">
              {work.map((w) => (
                <li key={w.job} title={w.boosted ? 'Raised by a passive' : undefined}>
                  <WorkIcon job={w.job} />
                  <span>
                    {workName(w.job)}
                    {w.boosted && <sup>▲</sup>}
                  </span>
                  <i aria-label={`${w.level} of ${WORK_LEVEL_CAP}`}>
                    {Array.from({ length: WORK_LEVEL_CAP }, (_, n) => (
                      <b key={n} className={n < w.level ? 'on' : undefined} />
                    ))}
                  </i>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="sc-card wide sc-in" style={stagger(6)}>
          <h2 className="sc-h3">
            Active skills <span>{skills.length} learned</span>
          </h2>
          {skills.length === 0 ? (
            <p className="sc-muted">{pal.skills ? 'None learned.' : 'Re-run npm run import-save to read active skills.'}</p>
          ) : (
            <ul className="sc-skills">
              {skills.map((sid) => {
                const s = SKILLS[sid];
                const el = s && s.element ? s.element : 'neutral';
                return (
                  <li key={sid} className={`e-${el}${equipped.has(sid) ? ' equipped' : ''}`}>
                    <small>{s?.element ?? '?'}</small>
                    <b>{s?.name ?? sid}</b>
                    <span>{s ? `Power ${s.power} · CT ${s.cooldown}s` : ''}</span>
                    {equipped.has(sid) && <em>equipped</em>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}
