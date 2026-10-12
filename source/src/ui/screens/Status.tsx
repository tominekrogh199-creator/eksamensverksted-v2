// Implementeringsstatus for alle funksjonene i produktbeskrivelsen.

import { store, useStore } from '../../state/store';
import { Pill } from '../components/common';
import { ttsAvailable, norwegianVoice, sttSupported } from '../components/Voice';

type S = 'fungerer' | 'ai' | 'demo' | 'begrenset' | 'ikke';

const LABEL: Record<S, { text: string; tone: 'teal' | 'accent' | 'demo' | 'amber' | 'red' }> = {
  fungerer: { text: 'Fungerer', tone: 'teal' },
  ai: { text: 'Fungerer med AI-tilgang', tone: 'accent' },
  demo: { text: 'Demo med faste data', tone: 'demo' },
  begrenset: { text: 'Begrenset her', tone: 'amber' },
  ikke: { text: 'Ikke implementert', tone: 'red' },
};

const ROWS: { area: string; items: [string, S, string][] }[] = [
  {
    area: 'Første brukerreise',
    items: [
      ['Opprett fag med bare navn; dato, tid og ambisjon senere', 'fungerer', ''],
      ['Last opp flere filer samtidig', 'fungerer', 'Dra og slipp eller filvelger.'],
      ['Gjenkjent år, eksamenstype og dokumenttype som redigerbare forslag', 'fungerer', 'Spør bare når det påvirker analysen.'],
      ['Faktisk framdrift og sider som trenger hjelp', 'fungerer', 'Sju trinn per dokument med status per side.'],
      ['Eksamenskart med anbefalt start', 'fungerer', ''],
      ['Start helt grunnleggende / Finn nivået mitt / Gå rett til oppgaver', 'fungerer', ''],
      ['Tilbakemelding, oppdatert mestring og neste steg etter forsøk', 'fungerer', ''],
      ['Fortsette en avbrutt økt', 'fungerer', 'Forsøk og økter lagres fortløpende.'],
      ['Store analyser uten å holde samme skjerm åpen', 'begrenset', 'Analysen kjører videre mens du bruker andre deler av appen, og fortsetter automatisk neste gang appen åpnes. Det finnes ingen server som jobber mens appen er lukket.'],
    ],
  },
  {
    area: 'Filanalyse og sporbarhet',
    items: [
      ['PDF med tekstlag', 'fungerer', 'pdf.js, med linjeposisjoner for markering.'],
      ['Skannet PDF og JPG/PNG', 'fungerer', 'Tekstgjenkjenning (Tesseract med norsk språkmodell) i nettleseren, uten AI og uten nett. Hvert ord har en sikkerhet, og lav sikkerhet vises. Med AI kan siden i tillegg leses av Claude. Klarer ingen av delene siden, skriver du inn teksten selv.'],
      ['Wiseflow-utskrifter der tekstlaget ikke kan leses', 'fungerer', 'Oppdages automatisk og leses med tekstgjenkjenning. Markert svaralternativ (strek foran bokstaven, hake bak teksten) leses fra pikslene. Testet på ekte utskrifter: fasit funnet for alle flervalgsspørsmål.'],
      ['Tekniske oppgavesett: «Oppgave N» med løsningen rett etter, og oppgavesamlinger med egen løsningsdel', 'fungerer', 'Oppgaven vises som utsnitt av originalen, og løsningsutsnittet holdes skjult til du har levert. Løsningen finnes under overskriften «Løsning», som ny runde a), b) … eller rett etter figuren. Oppgavesamlinger i to spalter (P-1.1 …) kobles til løsningsdelen på nummer, med kapittel som tema. Sluttsvar med enhet leses fra løsningen der det står tydelig (tall med SI-prefiks, også delt av brøker og spalter). Tomme sider og errata-/vedleggsider hoppes over.'],
      ['Eksamensformatet Del 1–3 med sensorveiledningen i samme dokument', 'fungerer', 'Flervalg, kortsvar og langsvar skilles; oppgavetekst og veiledning holdes adskilt. Riktig alternativ leses fra fet skrift, Wiseflow-markering eller en fasitliste, og kilden vises ved fasiten.'],
      ['Kameraopplasting på mobil', 'fungerer', 'Filvelger med kamera. Artefaktvisningen gir ikke direkte kameratilgang.'],
      ['DOCX', 'fungerer', 'Leses med mammoth. DOCX har ikke faste sider; henvisninger går til avsnitt.'],
      ['Fingeravtrykk, duplikater, versjoner', 'fungerer', 'SHA-256. Nesten-like filer spør om duplikat, alternativ versjon eller eget sett.'],
      ['Figurer, tabeller og formler', 'ai', 'Figurer finnes og vises som utsnitt fra originalen ved riktig oppgave, uten AI. Å tolke hva figuren viser (kurver, punkter, tall) krever AI.'],
      ['Oppgaver, deloppgaver, innledning, figurer og avhengigheter', 'fungerer', 'Regelbasert for vanlige formater. AI-segmentering som reserve.'],
      ['Kobling av sensorveiledning på innhold, ikke filnavn', 'fungerer', 'Emnekode, år/termin, oppgavenummer og tall som stemmer. Usikker kobling spør deg.'],
      ['Strukturert analyse per deloppgave (alle felt i beskrivelsen)', 'fungerer', 'Regelbasert for 24 familier i tre fagområder: samfunnsøkonomi (14), elektriske kretser (7: grunnbegreper, motstandsnettverk, kretsanalyse, opamp, RC/RL, vekselstrøm, filtre og Bode) og digitalteknikk (3: tallsystemer, boolsk algebra og Karnaugh, vipper og tilstandsmaskiner). Hvert dokument gjenkjennes bare mot familiene i sitt eget fagområde. Regneoppgaver kontrolleres matematisk. Ukjente oppgavetyper: AI-tolkning, tydelig merket.'],
      ['Dekningskontroll for alle sider og oppgaver', 'fungerer', ''],
      ['Åpne riktig originalside; PDF-side og trykt side', 'fungerer', ''],
      ['Rette feiltolket oppgavetekst uten ny opplasting', 'fungerer', 'Analysen og koblingene oppdateres; historikk beholdes.'],
      ['Erstatte en kilde med ny versjon', 'fungerer', 'Gammel versjon beholdes for sporbarhet.'],
    ],
  },
  {
    area: 'Sammenlikning og prioritering',
    items: [
      ['Samme oppgavenummer på tvers av år', 'fungerer', ''],
      ['Faglige oppgavefamilier i klikkbar matrise', 'fungerer', 'Regelbaserte familier; AI foreslår familier for ukjente oppgaver.'],
      ['Tellere og nevnere, konte, alternative versjoner og duplikater', 'fungerer', ''],
      ['«Generer flere som oppgave N» med valg når familiene er ulike', 'fungerer', ''],
      ['«Dette må svaret vise» med fire grunnlag', 'fungerer', ''],
      ['Konflikt mellom offisiell fasit og matematisk kontroll', 'fungerer', 'Demoen har en bevisst feil i DEMO C sitt vurderingsforslag.'],
      ['Forklarbar prioriteringsregel med overstyring', 'fungerer', ''],
      ['Læringsmål som eksamenene ikke dekker', 'fungerer', 'Kobling mål–familie med nøkkelord. AI-kobling er skrevet, men ikke koblet til grensesnittet.'],
    ],
  },
  {
    area: 'Oppgavegeneratoren',
    items: [
      ['Fire variasjonsnivåer', 'fungerer', '88 maler i 24 familier: regneoppgaver, flervalg med én entydig fasit, «hvilken kurve skifter, og hvilken vei» og forklaringer med vurderingsramme. Tekniske maler bruker SI-enheter med prefiks (4 kΩ, 2,5 mA) og godtar svar innenfor en relativ toleranse.'],
      ['Øve på de originale eksamensspørsmålene', 'fungerer', 'Flervalg rettes mot fasiten i kilden. Kortsvar og Del 3 vurderes mot sensorveiledningens egne punkter: med AI når det er tilgjengelig, ellers som selvvurdering. Tekniske oppgaver: sluttsvaret sjekkes mot svaret lest fra løsningsforslaget (2 % toleranse), og hele løsningen vises som utsnitt etter levering. Stemmer ikke det avleste svaret med utsnittet, gjelder utsnittet.'],
      ['Delferdigheter, gradvis fjernede steg, finn feilen', 'fungerer', ''],
      ['Valg av antall, nivå, tid og familier; ingen nesten-duplikater', 'fungerer', ''],
      ['Uavhengig validering (entydighet, domene, fasit, tekst mot parametere)', 'fungerer', 'Testet på 2 200 genererte oppgaver.'],
      ['Eksamensnære oppgaver (nye oppgaver etter mønster av eksamenene dine)', 'ai', 'AI skriver nye oppgaver i samme format, på samme nivå og fra de samme temaene som eksamenene dine: flervalg, kortsvar, lengre oppgaver og regneoppgaver (kretsen beskrevet i tekst). Temaer som kommer ofte på eksamen og temaer du har slitt med, kommer oftere. Kontroller: riktig struktur, høyst 20 % ordrett likhet med eksemplene, og en uavhengig utregning som må gi samme fasit (flervalg og tallsvar, ±2 %). Merkes «Eksamensnær oppgave (AI)». Ikke kjørt mot en ekte modell i byggemiljøet.'],
      ['Mal-genererte øvingsoppgaver', 'fungerer', 'Ordlyden kommer fra maler og merkes «Generert øvingsoppgave».'],
    ],
  },
  {
    area: 'Læringssti og Lær',
    items: [
      ['Sti med temaene i rekkefølge etter eksamensrelevans', 'fungerer', 'Temaene som finnes i eksamenssettene dine, delt i kapitler etter hvor ofte de kommer (nesten alltid, ofte, av og til, sjelden). Hvert tema viser «på X av Y sett», formatene og fremgangen din.'],
      ['Lær: korte leksjoner med bare det eksamen krever', 'ai', 'Med AI: først analyseres alle eksamensspørsmålene dine om temaet (med fasit og sensorveiledning), så skrives leksjonen ut fra analysen, og til slutt løser et uavhengig kall kontrollspørsmål og quiz uten fasit; spørsmål som ikke stemmer, fjernes. Uten AI: leksjon fra kunnskapsbasen med formler, gjennomregnet eksempel, feller og de ekte flervalgsspørsmålene dine. Ikke kjørt mot en ekte modell i byggemiljøet.'],
      ['Kalkulatoren på eksamen', 'fungerer', 'En simulert vanlig kalkulator (+ − × ÷ √ % = M+ M− MRC, regner fra venstre mot høyre). Appen lager tastetrykkene selv fra regneuttrykket og kjører dem i simulatoren før de vises. «Vis meg» trykker tastene én og én; «Prøv selv» viser neste tast ved behov.'],
      ['Tekst eller visuelt, fokusmodus og interesser', 'fungerer', 'Fargekodede formler og nøkkelord, steg som vises ett om gangen, kort du snur, figurer med glidebrytere. Fokusmodus gir ett kort om gangen og pustepause hvert femte kort. Interessene i «Om meg» brukes i eksemplene når en leksjon lages med AI.'],
      ['Tutorfigur', 'fungerer', 'Ugle, rev, katt eller robot med eget navn. Egne figurer, ikke kjente maskoter.'],
      ['Valgfri quiz, poeng, dager på rad og dagsmål', 'fungerer', 'Poengene er motivasjon og påvirker ikke mestringsbildet.'],
      ['Konkurranse per kapittel mot egen rekord', 'fungerer', '8 spørsmål på tid med fartsbonus, og et «spøkelse» som viser rekordløpet. Spørsmålene kommer fra quizene, de ekte flervalgsspørsmålene dine og kontrollerte maloppgaver.'],
    ],
  },
  {
    area: 'Arbeidsflaten og læreren',
    items: [
      ['Tekst, tall, uttrykk og flere mellomregninger med formelmeny', 'fungerer', ''],
      ['Norsk desimalkomma og avklaring av tvetydige tall', 'fungerer', ''],
      ['SI-enheter i tekniske fag', 'fungerer', 'Formelmenyen viser Ω, kΩ, V, A, mA, W, µF og mH og symbolene i oppgaven. Motoren kontrollerer regningen i stegene, ikke om koblingen eller metoden er riktig valgt; det står i tilbakemeldingen.'],
      ['Bilde av arbeidet på papir', 'ai', 'Bildet lagres alltid. Avlesning av håndskrift krever AI; demoen har en fast avlesning.'],
      ['Interaktiv graf og grafskisse', 'fungerer', 'Tegneoppgaver vurderes automatisk. Kommentar til bilde av skisse krever AI.'],
      ['Sjekk ett steg, hint, «jeg vet ikke», lever', 'fungerer', ''],
      ['Metode og svar vurderes hver for seg', 'fungerer', 'Eksakt kontroll av hver linje; godtar andre gyldige metoder og avrunding.'],
      ['Forklaringer og økonomisk tolkning', 'ai', 'AI-vurdering mot synlig ramme. Uten AI: selvvurdering, som ikke teller som mestring.'],
      ['Målrettet diagnose (siste riktige steg, første avvik)', 'fungerer', 'Deterministisk, med feiltyper som «ganget i stedet for å dele».'],
      ['Hjelpetrinn 1–5 med registrering', 'fungerer', ''],
      ['Fri samtale med læreren', 'ai', 'Hjelpetrinnene og «Står fast på»-valgene svarer med AI når den er tilgjengelig, med oppgaven, sensorveiledningen eller løsningen, vurderingsrammen og arbeidet ditt som grunnlag, og strømmes mens de skrives. Læreren følger appens kontroll av sluttsvaret og sier aldri at et feil svar er riktig. Uten AI: faste svar fra kunnskapsbasen.'],
      ['Forklaringsmåter: kort, steg for steg, graf, analogi, utledning', 'fungerer', ''],
      ['Forstå formelen: utforsk modellene', 'fungerer', '51 formler (23 i samfunnsøkonomi, 22 i elektriske kretser, 6 i digitalteknikk) med antakelser og utledning. WS–PS-modellen som figur med glidebrytere; kalkulatorer for verdien av jobben, budsjettlinjen, isokost, reallønn og multiplikatoren.'],
      ['Opplesing', 'fungerer', 'Nettleserens talesyntese. Norsk stemme avhenger av enheten.'],
      ['Tale til tekst', 'begrenset', 'Implementert med nettleserens talegjenkjenning, men artefaktvisningen på claude.ai blokkerer mikrofonen. Knappen viser da status i stedet.'],
      ['«Vis meg»: styrbar tavlegjennomgang', 'fungerer', 'Steg, markering, graf, teksting, tempo og detaljnivå.'],
      ['Videofil', 'fungerer', 'WebM laget i nettleseren og bekreftet avspillbar. Teksting, ikke lyd.'],
    ],
  },
  {
    area: 'Mestring og eksamensmodus',
    items: [
      ['Ferdighetsprofil med evidens og synlige regler', 'fungerer', 'Fem nivåer, ingen prosenter.'],
      ['Korrigering ved feil avlesning eller AI-vurdering', 'fungerer', ''],
      ['Øktoppsummering: selv / med hjelp / neste', 'fungerer', ''],
      ['Eksamensmodus uten hjelp, med tid og hjelpemidler', 'fungerer', 'Uferdige prøver kan fortsettes. Et hvilket som helst analysert sett kan tas som prøve.'],
      ['Ny prøve i samme format som eksamen', 'ai', 'Like mange flervalg, kortsvar, lengre oppgaver eller regneoppgaver som omtrent halvparten av det nyeste settet, laget som eksamensnære oppgaver. Uten AI: varianter av oppgavetypene fra malene.'],
      ['Reservert sett holdt utenfor trening, generering og hint', 'fungerer', ''],
      ['Vurdering per oppgave og ferdighet, reparasjonsøkt', 'fungerer', 'Treningspoeng skilles fra offisielle poeng.'],
    ],
  },
  {
    area: 'Plattform',
    items: [
      ['Privat lagring per bruker med synk', 'fungerer', 'Plattformens database, privat område per bruker. Endringer legges først i en utboks i nettleseren og sendes med høyst tre samtidige skrivinger; avviser databasen dem (travel, nett borte), prøves de på nytt, og ved neste åpning sendes det som ikke rakk å bli lagret. Statusen øverst viser Lagret / Lagrer / Venter på nett / Ikke lagret. Endringer fra andre enheter hentes jevnlig. Testet med en simulert database som avviser alle skrivinger.'],
      ['Originalfiler i skyen', 'fungerer', 'Valgfritt per fag, av som standard. Utsnitt forstørres ved klikk.'],
      ['Eksport og sletting', 'fungerer', ''],
      ['Instrukser i opplastede filer og svar behandles som data', 'fungerer', 'Tekst som ligner instrukser («ignorer systemet …») flagges synlig i arkivet og endrer ingenting. I AI-kall merkes data som data, svar valideres mot skjema, og AI får ingen verktøy. Vurdering av regneoppgaver gjøres av matematikkmotoren, ikke av AI. Demo: emnebeskrivelsen har en slik testlinje.'],
      ['API-nøkler', 'fungerer', 'Ingen nøkler i klienten. Claude nås via plattformens innebygde tilgang på brukerens konto.'],
    ],
  },
];

export function Status() {
  const ui = useStore((s) => s.ui);
  const p = store.platform;
  const live: [string, string][] = [
    ['Visning', p?.inViewer ? 'Claude-artefakt' : 'Frittstående nettleser'],
    ['Lagring', ui.storageKind],
    ['AI (tekst)', p?.sample ? (ui.aiStatus === 'avslått' ? 'avslått' : 'tilgjengelig') : 'ikke tilgjengelig'],
    ['AI (bilder)', p?.imageLimits ? `ja, opptil ${p.imageLimits.maxCount} per forespørsel` : 'nei'],
    ['Fillager', p?.assets ? 'ja' : 'nei'],
    ['Nedlasting', p?.downloads ? 'ja' : 'nei'],
    ['Opplesing', ttsAvailable() ? (norwegianVoice() ? `ja (${norwegianVoice()!.name})` : 'ja, uten norsk stemme') : 'nei'],
    ['Tale til tekst', sttSupported() ? 'nettleseren støtter det, men mikrofon kan være blokkert' : 'ikke støttet'],
    ['Videoopptak', typeof MediaRecorder !== 'undefined' ? 'ja' : 'nei'],
  ];
  return (
    <div className="page">
      <div className="page-head">
        <div className="stack sm">
          <span className="eyebrow">Implementeringsstatus</span>
          <h1>Hva som virker, og hvor grensene går</h1>
          <p className="muted">«Fungerer» betyr implementert og kjørt i testene under byggingen. «Fungerer med AI-tilgang» betyr implementert og koblet til Claude via plattformen, men ikke kjørt mot en ekte modell under byggingen. Da ble bare kodeveien testet.</p>
        </div>
      </div>
      <section className="card stack sm">
        <h3>Akkurat nå, i denne visningen</h3>
        <div className="status-grid">
          {live.map(([k, v]) => (
            <div key={k} className="srow">
              <span>{k}</span>
              <span className="small muted">{v}</span>
            </div>
          ))}
        </div>
      </section>
      {ROWS.map((g) => (
        <section key={g.area} className="card stack sm">
          <h3>{g.area}</h3>
          <div className="status-grid">
            {g.items.map(([t, s, note]) => (
              <div key={t} className="srow">
                <div className="stack sm" style={{ gap: 2 }}>
                  <span>{t}</span>
                  {note ? <span className="xs muted">{note}</span> : null}
                </div>
                <Pill tone={LABEL[s].tone}>{LABEL[s].text}</Pill>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
