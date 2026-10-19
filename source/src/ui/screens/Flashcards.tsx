// Flashcards: begreper, eksempler fra arbeidslivet og modeller, med repetisjon
// etter Leitner-prinsippet. Du vurderer selv om du kunne kortet; kortene du
// ikke kunne, kommer tilbake i samme økt og neste dag.

import { useEffect, useMemo, useState } from 'react';
import { store, useStore } from '../../state/store';
import { awardXp } from '../../learning/game';
import { CARD_TYPES, buildDeck, cardById, cardState, grade, nextState, nextReviewText, pensumRefs, stats, topicsByExam, examCounts, type Card, type CardType, type Grade } from '../../learning/flash';
import { LEVEL_LABEL, ORG_CONCEPT_MAP, modelParts } from '../../families/org';
import type { OrgLevel } from '../../families/org/types';
import { OrgModelView } from '../components/OrgModelView';
import { Icon } from '../components/Icon';
import { Empty, Pill } from '../components/common';

type Scope = 'alle' | 'eksamen' | string;

export function Flashcards() {
  const route = useStore((s) => s.ui.route);
  useStore((s) => s.list('flash'));
  useStore((s) => s.currentSubtasks());
  const r = route.name === 'kort' ? route : undefined;
  const [types, setTypes] = useState<CardType[]>(r?.type ? [r.type] : ['begrep', 'eksempel', 'modell']);
  const [scope, setScope] = useState<Scope>(r?.topic ?? 'alle');
  const [deck, setDeck] = useState<Card[] | null>(null);
  const counts = examCounts();
  const hasExams = counts.size > 0;
  const topics = topicsByExam();
  const filter = (c: Card) => types.includes(c.type) && (scope === 'alle' || (scope === 'eksamen' ? (counts.get(c.topic.id) ?? 0) > 0 : c.topic.id === scope));
  const st = stats(filter);
  const all = stats();
  const start = (extra = false) => {
    const d = buildDeck({ types, topics: scope !== 'alle' && scope !== 'eksamen' ? [scope] : undefined, examOnly: scope === 'eksamen', size: 20, newMax: 10, extra });
    if (d.length) setDeck(d);
    else store.toast('Ingen kort å øve på med dette utvalget.', 'info');
  };
  if (deck) return <Session deck={deck} onDone={() => setDeck(null)} />;
  const byLevel = (['individ', 'gruppe', 'organisasjon', 'ledelse'] as OrgLevel[]).map((lv) => ({ lv, topics: topics.filter((t) => t.level === lv) }));
  const toggle = (t: CardType) => setTypes((cur) => (cur.includes(t) ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : [...cur, t]));
  return (
    <div className="page flash-page">
      <div className="page-head">
        <div className="stack sm">
          <span className="eyebrow">Flashcards</span>
          <h1>Begreper og modeller</h1>
          <p className="muted">Sensor gir uttelling for begreper definert i tråd med pensum og for riktige modeller. Kortene du kan, kommer sjeldnere; de du ikke kan, kommer tilbake.</p>
        </div>
      </div>
      <section className="card raised stack">
        <div className="flash-stats">
          <div>
            <strong>{all.due}</strong>
            <span className="xs muted">å repetere i dag</span>
          </div>
          <div>
            <strong>
              {all.known}
              <small> / {all.total}</small>
            </strong>
            <span className="xs muted">kan du (boks 4+)</span>
          </div>
          <div>
            <strong>{all.total - all.seen}</strong>
            <span className="xs muted">nye kort</span>
          </div>
        </div>
        <fieldset className="stack sm">
          <legend className="small strong">Korttyper</legend>
          <div className="row wrap">
            {CARD_TYPES.map((t) => (
              <button key={t.id} type="button" className={`chip${types.includes(t.id) ? ' on' : ''}`} aria-pressed={types.includes(t.id)} onClick={() => toggle(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="stack sm">
          <span className="small strong">Temaer</span>
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="alle">Alle temaer i pensum</option>
            {hasExams ? <option value="eksamen">Bare temaer som har vært på eksamen</option> : null}
            {byLevel.map(({ lv, topics: ts }) => (
              <optgroup key={lv} label={LEVEL_LABEL[lv]}>
                {ts.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.shortName}
                    {counts.get(t.id) ? ` (${counts.get(t.id)} eksamensspørsmål)` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="row wrap">
          <button className="btn primary" onClick={() => start(false)}>
            <Icon name="layers" size={16} /> {st.due ? `Øv nå (${Math.min(20, st.due)} å repetere${st.total - st.seen ? ' + nye' : ''})` : st.total - st.seen ? 'Øv på nye kort' : 'Øv'}
          </button>
          {!st.due && st.seen ? (
            <button className="btn" onClick={() => start(true)}>
              Repeter likevel
            </button>
          ) : null}
        </div>
        <p className="xs muted">
          {st.total} kort i utvalget · {st.seen} sett · {st.known} kan du. Nye kort kommer fra temaene som er spurt om oftest på eksamenene dine.
        </p>
      </section>
      <section className="stack">
        <h2 className="h3">Fremgang per tema</h2>
        {byLevel.map(({ lv, topics: ts }) => (
          <div key={lv} className="stack sm">
            <span className="eyebrow">{LEVEL_LABEL[lv]}</span>
            <ul className="flash-topics">
              {ts.map((t) => {
                const s = stats((c) => c.topic.id === t.id);
                return (
                  <li key={t.id}>
                    <div className="stack sm" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                      <span className="row" style={{ gap: 6 }}>
                        <strong className="small">{t.shortName}</strong>
                        {counts.get(t.id) ? <Pill tone="accent">{counts.get(t.id)} på eksamen</Pill> : null}
                      </span>
                      <span className="flash-bar" aria-label={`${s.known} av ${s.total} kan du`}>
                        <i className="known" style={{ width: `${(100 * s.known) / Math.max(1, s.total)}%` }} />
                        <i className="seen" style={{ width: `${(100 * (s.seen - s.known)) / Math.max(1, s.total)}%` }} />
                      </span>
                      <span className="xs muted">
                        {s.known} av {s.total} kan du{s.due ? ` · ${s.due} å repetere` : ''}
                      </span>
                    </div>
                    <button
                      className="btn small"
                      onClick={() => {
                        const d = buildDeck({ types, topics: [t.id], size: 20, newMax: 12, extra: true });
                        if (d.length) setDeck(d);
                        else store.toast('Ingen kort med disse korttypene i temaet.', 'info');
                      }}
                    >
                      Øv
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
      <p className="xs muted">Definisjonene og eksemplene er skrevet av appen ut fra fagstoffet, ikke hentet fra lærebøkene. Sjekk ordlyden mot pensum før eksamen; der sensorveiledningene dine viser til kapitler, står de på kortet.</p>
    </div>
  );
}

function Session({ deck: initial, onDone }: { deck: Card[]; onDone: () => void }) {
  const [queue, setQueue] = useState<Card[]>(initial);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [log, setLog] = useState<{ id: string; g: Grade }[]>([]);
  const card = queue[i];
  const done = !card;
  useEffect(() => {
    if (done && log.length) awardXp(log.length, 'Flashcards');
  }, [done]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done || (e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (!flipped) {
          e.preventDefault();
          setFlipped(true);
        }
      } else if (flipped && ['1', '2', '3'].includes(e.key)) rate((['ikke', 'nesten', 'kunne'] as Grade[])[Number(e.key) - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const rate = (g: Grade) => {
    if (!card) return;
    grade(card.id, g);
    setLog((l) => [...l, { id: card.id, g }]);
    // «Kunne ikke»: kortet kommer igjen litt senere i samme økt (én gang).
    if (g === 'ikke' && queue.slice(i + 1).filter((c) => c.id === card.id).length === 0 && log.filter((x) => x.id === card.id).length < 1) {
      const q = [...queue];
      q.splice(Math.min(q.length, i + 4), 0, card);
      setQueue(q);
    }
    setFlipped(false);
    setRevealed(new Set());
    setI((x) => x + 1);
  };
  if (done) {
    const first = new Map<string, Grade>();
    for (const x of log) if (!first.has(x.id)) first.set(x.id, x.g);
    const k = [...first.values()].filter((g) => g === 'kunne').length;
    const miss = [...first.entries()].filter(([, g]) => g !== 'kunne').map(([id]) => cardById(id)).filter((c): c is Card => !!c);
    return (
      <div className="page flash-page">
        <div className="card raised stack" style={{ textAlign: 'center', alignItems: 'center' }}>
          <span className="eyebrow">Økten er ferdig</span>
          <h1>
            {k} av {first.size} kunne du
          </h1>
          <p className="muted">{miss.length ? 'Disse kommer tilbake i morgen:' : 'Alle kortene flyttes opp en boks og kommer tilbake senere.'}</p>
          {miss.length ? (
            <ul className="flash-miss">
              {miss.slice(0, 12).map((c) => (
                <li key={c.id} className="small">
                  {c.type === 'modell' ? c.model?.name : c.concept?.term}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="xs muted">+{log.length} poeng for innsatsen.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={onDone}>
              Ferdig
            </button>
            <button className="btn ghost" onClick={() => store.navigate({ name: 'start' })}>
              Til eksamensplanen
            </button>
          </div>
        </div>
      </div>
    );
  }
  const s = cardState(card.id);
  const preview = (g: Grade) => nextReviewText(nextState(s, g));
  const typeInfo = CARD_TYPES.find((t) => t.id === card.type)!;
  return (
    <div className="page flash-page">
      <div className="row between">
        <button className="btn ghost small" onClick={onDone}>
          <Icon name="x" size={16} /> Avslutt
        </button>
        <span className="small muted" aria-live="polite">
          {i + 1} / {queue.length}
        </span>
      </div>
      <div className="lesson-progress" aria-hidden="true">
        <span style={{ width: `${(100 * i) / queue.length}%` }} />
      </div>
      <article className={`flash-card${flipped ? ' flipped' : ''}`}>
        <div className="row between" style={{ gap: 8 }}>
          <Pill tone="outline">{card.topic.shortName}</Pill>
          <span className="xs muted">
            {typeInfo.label}
            {s ? ` · boks ${s.b}` : ' · nytt'}
          </span>
        </div>
        <Front card={card} flipped={flipped} revealed={revealed} setRevealed={setRevealed} />
        {flipped ? <Back card={card} /> : null}
      </article>
      {!flipped ? (
        <div className="flash-actions">
          <button className="btn primary block" onClick={() => setFlipped(true)}>
            Snu kortet
          </button>
          <span className="xs muted">{typeInfo.hint}</span>
        </div>
      ) : (
        <div className="flash-actions">
          <span className="small strong">Hvor godt kunne du det?</span>
          <div className="flash-grades">
            <button className="btn grade-ikke" onClick={() => rate('ikke')}>
              Kunne ikke
              <small>{preview('ikke')}</small>
            </button>
            <button className="btn grade-nesten" onClick={() => rate('nesten')}>
              Nesten
              <small>{preview('nesten')}</small>
            </button>
            <button className="btn grade-kunne" onClick={() => rate('kunne')}>
              Kunne det
              <small>{preview('kunne')}</small>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Front({ card, flipped, revealed, setRevealed }: { card: Card; flipped: boolean; revealed: Set<string>; setRevealed: (s: Set<string>) => void }) {
  if (card.type === 'modell' && card.model) {
    const m = card.model;
    return (
      <div className="stack">
        <div className="stack sm" style={{ gap: 2 }}>
          <h2 className="flash-term">{m.name}</h2>
          <span className="small muted">{m.author}</span>
        </div>
        {!flipped ? (
          <>
            <p className="small">Hvilke {modelParts(m).length} deler har modellen? Si dem høyt eller skriv dem ned, og trykk på feltene for å sjekke én og én.</p>
            <OrgModelView model={m} quiz revealed={revealed} onReveal={(id) => setRevealed(new Set([...revealed, id]))} />
          </>
        ) : null}
      </div>
    );
  }
  const c = card.concept!;
  if (card.type === 'eksempel')
    return (
      <div className="stack">
        <span className="eyebrow">Situasjon</span>
        <p className="flash-example">{c.example}</p>
        {!flipped ? <p className="small muted">Hvilket begrep fra pensum beskriver dette best?</p> : null}
      </div>
    );
  return (
    <div className="stack sm">
      <h2 className="flash-term">{c.term}</h2>
      {c.aka?.length ? <span className="small muted">Også kalt: {c.aka.join(', ')}</span> : null}
      {!flipped ? <p className="small muted">Forklar begrepet med egne ord, gjerne med et eksempel, før du snur.</p> : null}
    </div>
  );
}

function Back({ card }: { card: Card }) {
  const refs = useMemo(() => pensumRefs(card.topic.id), [card.topic.id]);
  if (card.type === 'modell' && card.model) {
    const m = card.model;
    return (
      <div className="flash-back stack">
        <OrgModelView model={m} />
        <p className="small">{m.summary}</p>
        <p className="small">
          <strong>På eksamen:</strong> {m.examUse}
        </p>
        <PensumNote refs={refs} />
      </div>
    );
  }
  const c = card.concept!;
  const confuse = (c.confuse ?? []).map((id) => ORG_CONCEPT_MAP[id]?.concept).filter(Boolean);
  return (
    <div className="flash-back stack">
      {card.type === 'eksempel' ? <h2 className="flash-term">{c.term}</h2> : null}
      <p className="flash-def">{c.definition}</p>
      {c.author ? <span className="small muted">Knyttet til: {c.author}</span> : null}
      {card.type === 'begrep' ? (
        <p className="small flash-work">
          <b>På jobben:</b> {c.example}
        </p>
      ) : null}
      {confuse.length ? (
        <p className="small">
          <b>Ikke bland med:</b> {confuse.map((x) => `${x!.term} (${x!.definition.charAt(0).toLowerCase()}${x!.definition.slice(1)})`).join('; ')}
        </p>
      ) : null}
      <PensumNote refs={refs} />
    </div>
  );
}

function PensumNote({ refs }: { refs: ReturnType<typeof pensumRefs> }) {
  return (
    <div className="flash-pensum xs">
      <span className="strong">Sjekk mot boka.</span>{' '}
      {refs.length ? (
        <>
          Sensorveiledningene dine viser til:{' '}
          {refs.slice(0, 2).map((r, i) => (
            <span key={i}>
              {i ? ' · ' : ''}
              {r.set ? <em>{r.set}: </em> : null}
              {r.text}
            </span>
          ))}
        </>
      ) : (
        'Formuleringen er appens egen, ikke hentet fra lærebøkene.'
      )}
    </div>
  );
}

export function flashDueCount(): number {
  return stats().due;
}
