// Meg: fremgang, interesser, læringsmåte, tutorfigur, kalkulator og dagsmål.

import { useEffect, useState } from 'react';
import type { LearnerProfile, CalculatorKind } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { profile, saveProfile, game, levelOf, streakNow } from '../../learning/game';
import { Mascot, MASCOTS } from '../components/Mascot';
import { StatBar } from '../components/Game';
import { Icon } from '../components/Icon';
import { aiAvailable } from '../../ai/client';

const INTEREST_CHOICES = ['Mote og klær', 'Trening', 'Kampsport', 'Musikk', 'Sosiale medier', 'Gründer og business', 'Mat og kafé', 'Reise', 'Gaming', 'Film og serier', 'Fotball', 'Natur og friluft', 'Skuespill', 'Bøker'];

const STYLES: { id: LearnerProfile['learnStyle']; title: string; text: string; icon: string }[] = [
  { id: 'tekst', title: 'Tekst', text: 'Korte forklaringer og steg for steg.', icon: 'doc' },
  { id: 'visuell', title: 'Visuelt', text: 'Farger, figurer og ting du kan leke med.', icon: 'graph' },
  { id: 'blanding', title: 'Blanding', text: 'Litt av begge, der det passer best.', icon: 'layers' },
];

const CALCS: { id: CalculatorKind; title: string; text: string }[] = [
  { id: 'enkel', title: 'Vanlig enkel kalkulator', text: '+ − × ÷ √ % = og M+ M− MRC. Ingen parenteser.' },
  { id: 'casio', title: 'Casio fx-991 (vitenskapelig)', text: 'Med parenteser, brøk og potenser.' },
  { id: 'texas', title: 'Texas (TI-30X / BA II Plus)', text: 'Med parenteser.' },
];

export function AboutMe() {
  const p = useStore(() => profile());
  const course = useStore((s) => s.course());
  useStore((s) => s.get('game', 'spill'));
  const [custom, setCustom] = useState('');
  // Navnefeltet har egen tilstand, så det kan tømmes mens du skriver et nytt navn.
  const [mname, setMname] = useState(p.mascotName);
  useEffect(() => setMname(p.mascotName), [p.mascotName]);
  const defaults = [...MASCOTS.map((x) => x.defaultName), 'Uglis'];
  const g = game();
  const lv = levelOf(g.xp);
  const toggle = (i: string) => saveProfile({ interests: p.interests.includes(i) ? p.interests.filter((x) => x !== i) : [...p.interests, i] });
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div className="stack sm">
          <span className="eyebrow">Meg</span>
          <h1>Fremgang og innstillinger for læring</h1>
          <p className="muted">Valgene her styrer Lær-delen: eksemplene, hvordan det vises, hvem som forklarer, og hvilken kalkulator du øver på.</p>
        </div>
      </div>
      <section className="card stack">
        <div className="row between">
          <h3>Fremgang</h3>
          <span className="small muted">
            {g.xp} poeng totalt · nivå {lv.level} · beste rekke {g.bestStreak} {g.bestStreak === 1 ? 'dag' : 'dager'}
          </span>
        </div>
        <StatBar />
        <p className="xs muted">Poeng er for motivasjon. Hva du faktisk kan, vises i «Min utvikling» og bygger bare på oppgaver du har løst selv.{streakNow(g) ? '' : ' Øv litt i dag for å starte en ny rekke.'}</p>
        <div>
          <button className="btn small" onClick={() => store.navigate({ name: 'utvikling' })}>
            <Icon name="target" size={14} /> Se hva du mestrer
          </button>
        </div>
      </section>
      <section className="card stack">
        <h3>Hva heter du?</h3>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Kallenavn (valgfritt)" value={p.nickname ?? ''} onChange={(e) => saveProfile({ nickname: e.target.value || undefined })} aria-label="Kallenavn" />
      </section>
      <section className="card stack">
        <h3>Interessene dine</h3>
        <p className="small muted">Eksemplene i Lær kan handle om det du liker, mens tallene og spørsmålstypen er som på eksamen.</p>
        <div className="chips">
          {[...INTEREST_CHOICES, ...p.interests.filter((i) => !INTEREST_CHOICES.includes(i))].map((i) => (
            <button key={i} className={`chip${p.interests.includes(i) ? ' on' : ''}`} onClick={() => toggle(i)} aria-pressed={p.interests.includes(i)}>
              {p.interests.includes(i) ? <Icon name="check" size={14} /> : null} {i}
            </button>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const v = custom.trim();
            if (v && !p.interests.includes(v)) saveProfile({ interests: [...p.interests, v.slice(0, 40)] });
            setCustom('');
          }}
        >
          <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Legg til noe annet, f.eks. Brasiliansk jiu-jitsu" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Egen interesse" />
          <button className="btn" type="submit" disabled={!custom.trim()}>
            <Icon name="plus" size={16} /> Legg til
          </button>
        </form>
        <textarea className="input" rows={2} placeholder="Noe mer om deg som kan gjøre eksemplene relevante? (valgfritt)" value={p.interestsNote ?? ''} onChange={(e) => saveProfile({ interestsNote: e.target.value.slice(0, 300) || undefined })} aria-label="Mer om deg" />
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={p.personalize} onChange={(e) => saveProfile({ personalize: e.target.checked })} /> Bruk interessene mine i eksemplene
        </label>
        <p className="xs muted">Interessene lagres privat på kontoen din og sendes til Claude bare når en leksjon lages og dette er slått på.{aiAvailable() ? '' : ' AI er ikke tilgjengelig her nå, så leksjonene bygges fra kunnskapsbasen og bruker ikke interessene.'}</p>
      </section>
      <section className="card stack">
        <h3>Hvordan vil du lære?</h3>
        <p className="xs muted">Styrer hvordan kortene vises (diagrammer og figurer åpne eller lukket), og hvilken type kort AI legger vekt på neste gang en leksjon lages.</p>
        <div className="grid-3">
          {STYLES.map((s) => (
            <button key={s.id} className={`choice${p.learnStyle === s.id ? ' selected' : ''}`} onClick={() => saveProfile({ learnStyle: s.id })} aria-pressed={p.learnStyle === s.id}>
              <span className="icon">
                <Icon name={s.icon} />
              </span>
              <strong>{s.title}</strong>
              <span className="small muted">{s.text}</span>
            </button>
          ))}
        </div>
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={p.focusMode} onChange={(e) => saveProfile({ focusMode: e.target.checked })} /> Fokusmodus: kortere leksjoner med mindre tekst, større tutor og en kort pause hvert femte kort
        </label>
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={p.sound} onChange={(e) => saveProfile({ sound: e.target.checked })} /> Lyd når du svarer riktig og fullfører
        </label>
      </section>
      <section className="card stack">
        <h3>Tutoren din</h3>
        <div className="mascot-pick">
          {MASCOTS.map((m) => (
            <button
              key={m.id}
              className={`mascot-tile${p.mascot === m.id ? ' on' : ''}`}
              onClick={() => saveProfile({ mascot: m.id, mascotName: defaults.includes(p.mascotName) ? m.defaultName : p.mascotName })}
              aria-pressed={p.mascot === m.id}
            >
              <Mascot kind={m.id} mood={p.mascot === m.id ? 'jubler' : 'glad'} size={84} />
              <span className="small">{m.label}</span>
            </button>
          ))}
        </div>
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="mname">Navnet på tutoren</label>
          <input
            id="mname"
            className="input"
            value={mname}
            maxLength={24}
            onChange={(e) => setMname(e.target.value)}
            onBlur={() => saveProfile({ mascotName: mname.trim() || MASCOTS.find((m) => m.id === p.mascot)?.defaultName || 'Bolt' })}
          />
        </div>
      </section>
      <section className="card stack">
        <h3>Kalkulatoren du har på eksamen</h3>
        <div className="stack sm">
          {CALCS.map((c) => (
            <label key={c.id} className={`radio-card${p.calculator === c.id ? ' on' : ''}`}>
              <input type="radio" name="calc" checked={p.calculator === c.id} onChange={() => saveProfile({ calculator: c.id })} />
              <span className="stack sm" style={{ gap: 0 }}>
                <strong className="small">{c.title}</strong>
                <span className="xs muted">{c.text}</span>
              </span>
            </label>
          ))}
        </div>
        {course ? (
          <label className="row small" style={{ gap: 8 }}>
            Annen kalkulator i {course.name}:
            <select className="input" style={{ width: 'auto' }} value={course.settings.calculator ?? ''} onChange={(e) => store.upsert({ ...course, settings: { ...course.settings, calculator: (e.target.value || undefined) as CalculatorKind | undefined } })}>
              <option value="">Samme som over</option>
              {CALCS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <p className="xs muted">Kalkulatorkortene i Lær viser nøyaktig hvilke taster du trykker. Prosenttasten oppfører seg litt ulikt fra merke til merke; appen viser derfor den sikre måten (gange med 0,15 i stedet for 15 %).</p>
      </section>
      <section className="card stack">
        <h3>Dagsmål</h3>
        <div className="chips">
          {[
            [10, 'Rolig'],
            [20, 'Vanlig'],
            [30, 'Seriøs'],
            [50, 'Intens'],
          ].map(([n, l]) => (
            <button key={n} className={`chip${p.dailyGoal === n ? ' on' : ''}`} onClick={() => saveProfile({ dailyGoal: Number(n) })} aria-pressed={p.dailyGoal === n}>
              {l} · {n} poeng
            </button>
          ))}
        </div>
        <p className="xs muted">En ny leksjon gir 20 poeng, pluss 5 for hvert kontrollspørsmål du får riktig på første forsøk og hver utregning du taster riktig. En oppgave du løser selv gir 15 poeng (5 med hjelp). Quizen gir poeng når du slår din beste.</p>
      </section>
    </div>
  );
}
