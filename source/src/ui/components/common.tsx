import { ReactNode, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { store } from '../../state/store';
import type { CriterionBasis, FieldStatus, SourceRef } from '../../domain/types';

export function Pill({ children, tone, title }: { children: ReactNode; tone?: 'accent' | 'teal' | 'amber' | 'red' | 'blue' | 'outline' | 'dashed' | 'demo'; title?: string }) {
  return (
    <span className={`pill ${tone ?? ''}`} title={title}>
      {children}
    </span>
  );
}

export function DemoBadge({ small }: { small?: boolean }) {
  return (
    <span className="pill demo" title="Syntetisk demomateriale. Ikke en ekte eksamen og ikke dine data." style={small ? { padding: '1px 7px' } : undefined}>
      DEMO
    </span>
  );
}

const BASIS_LABEL: Record<string, { cls: string; label: string; title: string }> = {
  offisielt: { cls: 'offisielt', label: 'Offisielt kriterium', title: 'Hentet fra en koblet sensorveiledning eller et offisielt løsningsforslag.' },
  oppgavekrav: { cls: 'oppgavekrav', label: 'Oppgavekrav', title: 'Står uttrykkelig i oppgaveteksten.' },
  'faglig-tolkning': { cls: 'tolkning', label: 'Faglig tolkning', title: 'Utledet fra oppgaven og faget. Ikke kjent sensorintensjon.' },
  uavklart: { cls: 'uavklart', label: 'Uavklart', title: 'Materialet gir ikke grunnlag for et sikkert svar.' },
  'ai-tolkning': { cls: 'ai', label: 'AI-tolkning', title: 'Foreslått av Claude. Ikke kontrollert og ikke offisiell.' },
  regelbasert: { cls: 'tolkning', label: 'Regelbasert', title: 'Funnet av appens regler for kjente oppgavefamilier.' },
  avlest: { cls: 'oppgavekrav', label: 'Avlest', title: 'Lest direkte fra dokumentet.' },
  offisiell: { cls: 'offisielt', label: 'Offisiell', title: 'Fra offisiell kilde.' },
  kontrollert: { cls: 'kontrollert', label: 'Matematisk kontrollert', title: 'Regnet ut eksakt av appens matematikkmotor.' },
  mangler: { cls: 'uavklart', label: 'Mangler', title: 'Ikke funnet i materialet.' },
  bruker: { cls: 'oppgavekrav', label: 'Rettet av deg', title: 'Du har rettet eller bekreftet dette.' },
};

export function BasisTag({ basis }: { basis: CriterionBasis | FieldStatus | 'ai-tolkning' | 'kontrollert' | string }) {
  const b = BASIS_LABEL[basis] ?? { cls: 'tolkning', label: basis, title: '' };
  return (
    <span className={`basis ${b.cls}`} title={b.title}>
      {b.cls === 'offisielt' ? <Icon name="flag" size={11} stroke={2.4} /> : b.cls === 'ai' ? <Icon name="sparkle" size={11} stroke={2.2} /> : b.cls === 'kontrollert' ? <Icon name="check" size={11} stroke={2.6} /> : b.cls === 'uavklart' ? <Icon name="help" size={11} stroke={2.2} /> : null}
      {b.label}
    </span>
  );
}

export function SourceLink({ src, label, highlight }: { src: SourceRef | undefined; label?: string; highlight?: [number, number, number, number][] }) {
  if (!src) return null;
  const doc = store.get<import('../../domain/types').SourceDoc>('doc', src.docId);
  const page = store.pages(src.docId).find((p) => p.pdfPage === src.pdfPage && p.docVersion === src.docVersion);
  const printed = page?.printedPage && page.printedPage !== String(src.pdfPage) ? `, trykt s. ${page.printedPage}` : '';
  return (
    <button
      type="button"
      className="src-link"
      onClick={() => store.setUi({ source: { docId: src.docId, page: src.pdfPage, highlight, quote: src.quote, label: src.taskLabel } })}
      title={`Åpne originalsiden: ${doc?.fileName ?? 'dokument'}, PDF-side ${src.pdfPage}${printed}`}
    >
      <Icon name="link" size={13} stroke={2.2} />
      {label ?? `${doc?.meta.setLabel ?? doc?.fileName ?? 'Kilde'} · s. ${src.pdfPage}${printed}`}
    </button>
  );
}

export function Notice({ tone, icon, children }: { tone?: 'amber' | 'red' | 'teal' | 'accent' | 'blue'; icon?: string; children: ReactNode }) {
  return (
    <div className={`notice ${tone ?? ''}`} role={tone === 'red' ? 'alert' : undefined}>
      <Icon name={icon ?? (tone === 'red' ? 'alert' : tone === 'amber' ? 'help' : tone === 'teal' ? 'check' : 'info')} size={18} />
      <div className="stack sm" style={{ gap: 4, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

export function Sheet({ title, onClose, children, narrow, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; narrow?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${narrow ? 'narrow' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1} ref={ref}>
        <div className="sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>{typeof title === 'string' ? <h3>{title}</h3> : title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Lukk">
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div style={{ padding: 'var(--s3) var(--s4)', borderTop: '1px solid var(--line)' }}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" role="status" style={{ gap: 8 }}>
      <span className="spinner" aria-hidden="true" />
      {label ? <span className="small muted">{label}</span> : <span className="sr-only">Laster</span>}
    </span>
  );
}

export function Empty({ icon, title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div style={{ width: 52, height: 52, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-2)' }}>
        <Icon name={icon ?? 'info'} size={24} />
      </div>
      <h3>{title}</h3>
      {children ? <p style={{ maxWidth: '52ch' }}>{children}</p> : null}
      {action}
    </div>
  );
}

/** Bekreftelse i selve siden (nettleserens confirm() fungerer ikke i artefakten). */
export function ConfirmButton({ children, confirmText, onConfirm, className }: { children: ReactNode; confirmText: string; onConfirm: () => void; className?: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask)
    return (
      <button className={className ?? 'btn small danger'} onClick={() => setAsk(true)}>
        {children}
      </button>
    );
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="small">{confirmText}</span>
      <button
        className="btn small danger"
        onClick={() => {
          setAsk(false);
          onConfirm();
        }}
      >
        Ja
      </button>
      <button className="btn small ghost" onClick={() => setAsk(false)}>
        Avbryt
      </button>
    </span>
  );
}

export function Certainty({ level, basis }: { level: 'høy' | 'middels' | 'lav'; basis?: string }) {
  const tone = level === 'høy' ? 'teal' : level === 'middels' ? 'amber' : 'red';
  const text = level === 'høy' ? 'Sikkert grunnlag' : level === 'middels' ? 'Noe usikkert' : 'Usikkert';
  return (
    <Pill tone={tone} title={basis}>
      {text}
    </Pill>
  );
}

export function fmtDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
}

export function relTime(iso?: string) {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'nå nettopp';
  if (s < 3600) return `for ${Math.round(s / 60)} min siden`;
  if (s < 86400) return `for ${Math.round(s / 3600)} t siden`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'i går' : `for ${d} dager siden`;
}
