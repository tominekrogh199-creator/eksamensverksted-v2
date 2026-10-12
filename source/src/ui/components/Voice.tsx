// Opplesing (talesyntese) og tale til tekst. Mikrofon startes bare når
// studenten trykker, og transkripsjonen kan rettes før den brukes.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

let micBlocked: string | null = null;

export function ttsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function norwegianVoice(): SpeechSynthesisVoice | null {
  if (!ttsAvailable()) return null;
  const vs = window.speechSynthesis.getVoices();
  return vs.find((v) => /^(nb|no|nn)(-|_|$)/i.test(v.lang)) ?? null;
}

export function speak(text: string, opts: { rate?: number; onEnd?: () => void } = {}): () => void {
  if (!ttsAvailable()) {
    opts.onEnd?.();
    return () => {};
  }
  const u = new SpeechSynthesisUtterance(text);
  const v = norwegianVoice();
  if (v) u.voice = v;
  u.lang = v?.lang ?? 'nb-NO';
  u.rate = opts.rate ?? 1;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    opts.onEnd?.();
  };
  u.onend = finish;
  u.onerror = finish;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return () => {
    done = true;
    window.speechSynthesis.cancel();
  };
}

export function SpeakButton({ text, label = 'Les opp' }: { text: string; label?: string }) {
  const [on, setOn] = useState(false);
  const cancel = useRef<() => void>(() => {});
  useEffect(() => () => cancel.current(), []);
  if (!ttsAvailable()) return null;
  return (
    <button
      type="button"
      className="btn small ghost"
      aria-pressed={on}
      onClick={() => {
        if (on) {
          cancel.current();
          setOn(false);
          return;
        }
        setOn(true);
        cancel.current = speak(text, { onEnd: () => setOn(false) });
      }}
      title={norwegianVoice() ? 'Leser opp med norsk stemme' : 'Nettleseren har ingen norsk stemme; teksten leses med standardstemmen'}
    >
      <Icon name="speaker" size={16} />
      {on ? 'Stopp' : label}
    </button>
  );
}

export function sttSupported(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function useDictation(onFinal: (text: string) => void) {
  const [status, setStatus] = useState<'idle' | 'lytter' | 'blokkert' | 'utilgjengelig' | 'feil'>(micBlocked ? 'blokkert' : sttSupported() ? 'idle' : 'utilgjengelig');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(micBlocked);
  const rec = useRef<SR | null>(null);
  const start = useCallback(() => {
    if (micBlocked) return;
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setStatus('utilgjengelig');
      return;
    }
    try {
      const r = new Ctor();
      r.lang = 'nb-NO';
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (e) => {
        let fin = '';
        let tmp = '';
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) fin += res[0].transcript;
          else tmp += res[0].transcript;
        }
        setInterim(tmp);
        if (fin) onFinal(fin.trim());
      };
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
          micBlocked = 'Mikrofonen er ikke tilgjengelig her. Artefaktvisningen på claude.ai gir ikke sider tilgang til mikrofonen. Skriv spørsmålet i stedet.';
          setError(micBlocked);
          setStatus('blokkert');
        } else if (e.error === 'network') {
          setError('Talegjenkjenningen i nettleseren trenger en nettverkstjeneste som ikke er tilgjengelig her.');
          setStatus('feil');
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          setError(`Talegjenkjenning feilet (${e.error}).`);
          setStatus('feil');
        }
      };
      r.onend = () => {
        setInterim('');
        setStatus((s) => (s === 'lytter' ? 'idle' : s));
      };
      rec.current = r;
      setError(null);
      setStatus('lytter');
      r.start();
    } catch {
      setStatus('feil');
      setError('Kunne ikke starte talegjenkjenning.');
    }
  }, [onFinal]);
  const stop = useCallback(() => rec.current?.stop(), []);
  useEffect(() => () => rec.current?.abort(), []);
  return { status, interim, error, start, stop };
}

export function MicButton({ onText }: { onText: (t: string) => void }) {
  const d = useDictation(onText);
  if (d.status === 'utilgjengelig') return <span className="xs faint" title="Nettleseren støtter ikke talegjenkjenning">Tale til tekst: ikke støttet her</span>;
  if (d.status === 'blokkert')
    return (
      <span className="xs faint" title={d.error ?? ''}>
        Tale til tekst: mikrofon blokkert i denne visningen
      </span>
    );
  return (
    <span className="row" style={{ gap: 6 }}>
      <button type="button" className={`icon-btn`} aria-pressed={d.status === 'lytter'} aria-label={d.status === 'lytter' ? 'Stopp opptak' : 'Snakk (tale til tekst)'} onClick={() => (d.status === 'lytter' ? d.stop() : d.start())} style={d.status === 'lytter' ? { background: 'var(--red-soft)', color: 'var(--red)' } : undefined}>
        <Icon name="mic" />
      </button>
      {d.status === 'lytter' ? <span className="xs muted">Lytter … {d.interim}</span> : null}
      {d.error && d.status !== 'lytter' ? <span className="xs" style={{ color: 'var(--amber)' }}>{d.error}</span> : null}
    </span>
  );
}
