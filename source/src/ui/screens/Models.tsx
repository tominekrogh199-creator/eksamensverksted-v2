// Modeller: alle modellene i pensum som figurer du kan utforske. Trykk på en
// del for forklaring og eksempel fra arbeidslivet, eller skjul navnene og test
// om du husker dem. Modellene er sortert etter hvor ofte temaet er på eksamen.

import { useState } from 'react';
import { store, useStore } from '../../state/store';
import { ORG_MODELS, ORG_MODEL_MAP, LEVEL_LABEL, modelParts } from '../../families/org';
import type { OrgLevel } from '../../families/org/types';
import { examCounts, topicsByExam } from '../../learning/flash';
import { OrgModelView } from '../components/OrgModelView';
import { Icon } from '../components/Icon';
import { Pill } from '../components/common';

export function Models() {
  const route = useStore((s) => s.ui.route);
  useStore((s) => s.currentSubtasks());
  const initial = route.name === 'modeller' ? route.modelId : undefined;
  const [sel, setSel] = useState<string | undefined>(initial);
  const [quiz, setQuiz] = useState(false);
  const [quizKey, setQuizKey] = useState(0);
  const counts = examCounts();
  const topics = topicsByExam();
  const m = sel ? ORG_MODEL_MAP[sel] : undefined;
  if (m) {
    const topic = topics.find((t) => t.id === m.topic);
    const n = counts.get(m.topic) ?? 0;
    const siblings = ORG_MODELS.filter((x) => x.topic === m.topic && x.id !== m.id);
    return (
      <div className="page models-page">
        <button className="btn ghost small" onClick={() => setSel(undefined)}>
          <Icon name="prev" size={16} /> Alle modeller
        </button>
        <div className="stack sm">
          <span className="eyebrow">{topic ? `${LEVEL_LABEL[topic.level]} · ${topic.shortName}` : 'Modell'}</span>
          <h1>{m.name}</h1>
          <span className="small muted">{m.author}</span>
        </div>
        <p>{m.summary}</p>
        <div className="row wrap">
          <button className={`chip${!quiz ? ' on' : ''}`} aria-pressed={!quiz} onClick={() => setQuiz(false)}>
            Utforsk
          </button>
          <button
            className={`chip${quiz ? ' on' : ''}`}
            aria-pressed={quiz}
            onClick={() => {
              setQuiz(true);
              setQuizKey((k) => k + 1);
            }}
          >
            Test deg selv (skjul navnene)
          </button>
        </div>
        <section className="card raised">
          <OrgModelView key={`${m.id}-${quiz ? `q${quizKey}` : 'u'}`} model={m} quiz={quiz} />
        </section>
        <section className="card stack sm">
          <strong>Slik bruker du modellen på eksamen</strong>
          <p className="small">{m.examUse}</p>
          {topic ? (
            <p className="xs muted">
              {n ? `Temaet «${topic.shortName}» har vært spurt om ${n} ${n === 1 ? 'gang' : 'ganger'} i eksamenene dine.` : `Temaet «${topic.shortName}» er ikke spurt om i eksamenene du har lastet opp, men står i pensum.`}
            </p>
          ) : null}
          <div className="row wrap">
            {topic ? (
              <button className="btn small" onClick={() => store.navigate({ name: 'laer', kbId: topic.id })}>
                <Icon name="book" size={15} /> Lær temaet
              </button>
            ) : null}
            <button className="btn small" onClick={() => store.navigate({ name: 'kort', topic: m.topic, type: 'modell' })}>
              <Icon name="layers" size={15} /> Flashcards for modellene
            </button>
          </div>
        </section>
        {!quiz ? (
          <details className="card">
            <summary className="strong small">Alle delene med forklaring</summary>
            <dl className="om-list">
              {modelParts(m).map((p) => (
                <div key={p.id}>
                  <dt>{p.label}</dt>
                  <dd>
                    {p.text}
                    {p.example ? <span className="om-example"> På jobben: {p.example}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
        {siblings.length ? (
          <section className="stack sm">
            <span className="eyebrow">Flere modeller i temaet</span>
            <div className="row wrap">
              {siblings.map((x) => (
                <button key={x.id} className="btn small ghost" onClick={() => setSel(x.id)}>
                  {x.name}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <p className="xs muted">Figurene og eksemplene er laget av appen. Navnene på modellene og forfatterne er de pensum bruker; sjekk detaljene mot boka.</p>
      </div>
    );
  }
  const levels: OrgLevel[] = ['individ', 'gruppe', 'organisasjon', 'ledelse'];
  return (
    <div className="page models-page">
      <div className="page-head">
        <div className="stack sm">
          <span className="eyebrow">Modeller</span>
          <h1>Modellene i pensum</h1>
          <p className="muted">En god modell med riktige navn gir struktur i svaret og viser sensor at du kan teorien. Trykk på en modell for å utforske den.</p>
        </div>
      </div>
      {levels.map((lv) => {
        const ts = topics.filter((t) => t.level === lv && ORG_MODELS.some((x) => x.topic === t.id));
        if (!ts.length) return null;
        return (
          <section key={lv} className="stack sm">
            <h2 className="h3">{LEVEL_LABEL[lv]}</h2>
            <div className="models-grid">
              {ts.flatMap((t) =>
                ORG_MODELS.filter((x) => x.topic === t.id).map((x) => (
                  <button key={x.id} className="model-tile" onClick={() => setSel(x.id)}>
                    <span className="xs muted">{t.shortName}</span>
                    <strong>{x.name}</strong>
                    <span className="xs muted">{x.author}</span>
                    {counts.get(t.id) ? <Pill tone="accent">{counts.get(t.id)} på eksamen</Pill> : null}
                  </button>
                )),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
