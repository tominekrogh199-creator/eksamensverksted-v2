// Organisasjonsnivå: organisasjonsteori, kultur, endring og kompetanseendring.

import type { OrgTopic } from './types';

const INN = (t: string) => ({ del: 'Innledning', tekst: t });
const DEF = (t: string) => ({ del: 'Definisjon', tekst: t });
const TEO = (t: string) => ({ del: 'Teori og modell', tekst: t });
const EKS = (t: string) => ({ del: 'Eksempel', tekst: t });
const DRO = (t: string) => ({ del: 'Forskning og drøfting', tekst: t });
const AVS = (t: string) => ({ del: 'Avslutning', tekst: t });

export const ORGTEORI: OrgTopic = {
  id: 'org-teori',
  name: 'Organisasjonsteori: klassiske og humanistiske perspektiver',
  shortName: 'Organisasjonsteori',
  level: 'organisasjon',
  description: 'Klassisk organisasjonsteori (Webers byråkrati, Taylor og Fayol) og humanistiske perspektiver (Hawthorne-studiene, human relations og human resources).',
  signals: [
    [/organisasjonsteori/i, 5],
    [/byråkrati|weber|taylor|fayol|scientific management/i, 5],
    [/humanistisk|human relations|hawthorne|teori x|teori y|mcgregor/i, 5],
  ],
  minScore: 4,
  intents: [
    {
      id: 'org-teori.klassisk',
      label: 'Klassisk organisasjonsteori og byråkrati',
      match: [/klassisk|byråkrati|weber|taylor|fayol/i],
      specific: true,
      assignment: 'Gjøre rede for hva som kjennetegner klassisk organisasjonsteori, med vekt på Webers byråkratimodell.',
      keyPoints: [
        'Plasserer klassisk organisasjonsteori historisk (tidlig 1900-tall) og forklarer grunntanken: å finne den mest effektive, rasjonelle måten å organisere arbeid på.',
        'Beskriver Webers byråkrati som idealtype: hierarki, arbeidsdeling og spesialisering, skriftlige regler og prosedyrer, upersonlig og likebehandlende saksbehandling, ansettelse og forfremmelse etter kompetanse, og skille mellom person og stilling.',
        'Nevner rasjonell-legal autoritet (i motsetning til tradisjonell og karismatisk).',
        'Nevner gjerne Taylor (scientific management) og Fayol (administrative prinsipper) som andre klassiske retninger.',
        'Drøfter styrker (forutsigbarhet, rettferdighet, effektivitet i stabile omgivelser) og svakheter (rigiditet, lite motivasjon, regler blir mål i seg selv).',
      ],
      outline: [
        INN('Avgrens til de klassiske organisasjonsteoriene og byråkratimodellen.'),
        DEF('Klassisk organisasjonsteori: tidlige teorier om hvordan organisasjoner kan utformes rasjonelt for maksimal effektivitet.'),
        TEO('Webers byråkratiske kjennetegn, rasjonell-legal autoritet, og Taylor og Fayol.'),
        EKS('Skatteetaten: klare regler, tydelig hierarki, saksbehandling uten hensyn til hvem søkeren er.'),
        DRO('Byråkratiet sikrer likebehandling, men kan bli rigid og demotiverende; humanistiske perspektiver kom som en reaksjon.'),
        AVS('Mange av byråkratiets prinsipper lever videre i dagens organisasjoner.'),
      ],
      estMinutes: 36,
    },
    {
      id: 'org-teori.humanistisk',
      label: 'Humanistiske perspektiver på organisasjonsteori',
      match: [/humanistisk|human relations|hawthorne|human resources|mcgregor/i],
      specific: true,
      assignment: 'Gjøre rede for hva som kjennetegner humanistiske perspektiver på organisasjonsteori.',
      keyPoints: [
        'Forklarer at humanistiske perspektiver vokste fram som reaksjon på klassisk teori, og ser mennesket som et sosialt vesen med behov for anerkjennelse, tilhørighet og utvikling.',
        'Beskriver Hawthorne-studiene (Mayo og medarbeidere): sosiale forhold, uformelle grupper og oppmerksomhet påvirket produktiviteten mer enn fysiske arbeidsforhold.',
        'Beskriver human relations-skolen og den senere human resources-retningen, f.eks. Maslow (behovshierarkiet) og McGregor (teori X og teori Y).',
        'Viser konsekvenser for ledelse: medvirkning, trivsel, motivasjon og deltakende ledelse.',
        'Drøfter kritikk: svak empiri i Hawthorne-studiene og at harmonisynet kan undervurdere interessekonflikter.',
      ],
      outline: [
        INN('Avgrens til humanistiske perspektiver og kontrasten til klassisk teori.'),
        DEF('Humanistiske perspektiver: organisasjonsteorier som vektlegger menneskelige og sosiale behov som nøkkel til effektivitet.'),
        TEO('Hawthorne-studiene, human relations, Maslow og McGregors teori X og Y.'),
        EKS('En fabrikk innfører selvstyrte grupper og medvirkning i planleggingen, og trivsel og kvalitet øker.'),
        DRO('Perspektivet ga ledelse et nytt menneskesyn, men studiene er kritisert for svak metode.'),
        AVS('Perspektivet ligger til grunn for moderne tanker om medvirkning og motivasjon.'),
      ],
      estMinutes: 36,
    },
  ],
  concepts: [
    { id: 'ot-klassisk', term: 'Klassisk organisasjonsteori', definition: 'Tidlige teorier (ca. 1900–1930) om hvordan organisasjoner kan utformes rasjonelt for størst mulig effektivitet, med vekt på struktur, regler og spesialisering.', example: 'En fabrikk på 1920-tallet deler produksjonen i små, standardiserte oppgaver med faste regler for hvert ledd.', confuse: ['ot-humanistisk'] },
    { id: 'ot-byrakrati', term: 'Byråkrati', author: 'Weber', definition: 'Idealtype for organisering med hierarki, arbeidsdeling, skriftlige regler, upersonlig likebehandling, ansettelse etter kompetanse og skille mellom person og stilling.', example: 'I Nav behandles alle søknader etter samme regelverk, avgjørelser dokumenteres skriftlig, og saksbehandleren har myndighet bare i kraft av stillingen.' },
    { id: 'ot-legal', term: 'Rasjonell-legal autoritet', author: 'Weber', definition: 'Makt som oppleves legitim fordi den bygger på lover, regler og en formell stilling, ikke på tradisjon eller personlig karisma.', example: 'De ansatte følger skolesjefens instruks fordi den er gitt i tråd med reglementet og stillingen hans.' },
    { id: 'ot-taylor', term: 'Scientific management', aka: ['taylorisme'], author: 'Taylor', definition: 'Systematisk studie av arbeidsoperasjoner (tids- og bevegelsesstudier) for å finne den mest effektive måten å utføre dem på, med standardisering og akkordlønn.', example: 'Lagersjefen tar tiden på hver bevegelse ved plukking og innfører én fast, raskeste metode for alle.' },
    { id: 'ot-fayol', term: 'Administrativ teori', author: 'Fayol', definition: 'Teori om ledelsens funksjoner (planlegge, organisere, koordinere, kommandere og kontrollere) og prinsipper som enhetlig ledelse.', example: 'Den nye daglige lederen lager en fast plan for hvordan han skal planlegge, organisere og kontrollere arbeidet i hver avdeling.' },
    { id: 'ot-humanistisk', term: 'Humanistiske perspektiver', definition: 'Organisasjonsteorier som vektlegger menneskers sosiale og psykologiske behov, motivasjon og medvirkning som nøkkel til effektivitet.', example: 'Ledelsen innfører medarbeidersamtaler, selvstyrte grupper og trivselsmål for å øke produktiviteten.', confuse: ['ot-klassisk'] },
    { id: 'ot-hawthorne', term: 'Hawthorne-studiene', author: 'Mayo mfl.', definition: 'Studier ved Western Electric (1920–30-tallet) som viste at sosiale forhold, uformelle normer og oppmerksomhet påvirket produktiviteten mer enn fysiske arbeidsforhold.', example: 'Produktiviteten steg både når lyset ble skrudd opp og ned, fordi arbeiderne merket at noen brydde seg om dem.' },
    { id: 'ot-hr', term: 'Human relations', definition: 'Retning som vokste ut av Hawthorne-studiene, og som vektlegger trivsel, sosiale relasjoner og uformelle grupper i arbeidslivet.', example: 'Ledelsen begynner å ta hensyn til vennskap og uformelle normer i arbeidsgruppene når de setter sammen skift.' },
    { id: 'ot-xy', term: 'Teori X og teori Y', author: 'McGregor', definition: 'To menneskesyn hos ledere: teori X antar at folk er late og må kontrolleres; teori Y antar at folk vil ta ansvar og kan motiveres av meningsfullt arbeid.', example: 'Den ene lederen stempler inn og ut og sjekker alt (X); den andre gir målene og lar teamet selv finne veien (Y).' },
  ],
  models: ['m-byrakrati', 'm-xy', 'm-orgteori'],
  traps: [
    { label: 'Byråkrati er ikke et skjellsord her', explanation: 'I faget er byråkrati Webers idealtype med bestemte kjennetegn. Beskriv kjennetegnene nøytralt før du drøfter svakheter.' },
    { label: 'Human relations og human resources', explanation: 'Human relations (Hawthorne) vektlegger trivsel og sosiale relasjoner; human resources (Maslow, McGregor) vektlegger utvikling og ansvar.' },
  ],
  mnemonic: 'Weber: HARULS – Hierarki, Arbeidsdeling, Regler, Upersonlighet, Likebehandling via kompetanse, Skriftlighet.',
  structure: ['Plasser perspektivet historisk', 'Grunntanker og menneskesyn', 'Kjennetegn og teoretikere med riktige navn', 'Eksempel', 'Styrker og svakheter'],
};

export const KULTUR: OrgTopic = {
  id: 'org-kultur',
  name: 'Organisasjonskultur',
  shortName: 'Organisasjonskultur',
  level: 'organisasjon',
  description: 'Hvordan organisasjonskultur defineres (Schein), hvordan kulturen kommer til uttrykk, og sammenhengen mellom kultur og prestasjoner.',
  signals: [
    [/organisasjonskultur|bedriftskultur/i, 6],
    [/\bkultur/i, 3],
    [/schein|artefakt|grunnleggende antakelser/i, 4],
  ],
  minScore: 3,
  intents: [
    {
      id: 'org-kultur.uttrykk',
      label: 'Organisasjonskultur og hvordan den kommer til uttrykk',
      match: [/kultur(?!.*prestasjon)/i],
      assignment: 'Definere organisasjonskultur og beskrive måter kulturen kommer til uttrykk på.',
      keyPoints: [
        'Definerer organisasjonskultur med Schein: et mønster av grunnleggende antakelser som gruppen har lært ved å løse problemer med ekstern tilpasning og intern integrasjon, og som læres bort til nye medlemmer som den riktige måten å tenke og føle på.',
        'Beskriver Scheins tre nivåer: artefakter (synlige uttrykk), uttalte verdier og grunnleggende antakelser.',
        'Gir konkrete uttrykk: språk og sjargong, historier og myter, ritualer og seremonier, symboler, kleskode, fysiske omgivelser, normer og belønningssystemer.',
        'Viser hvordan ledere former og overfører kultur (hva de gir oppmerksomhet, hvordan de reagerer på kriser, rollemodellering, belønning, rekruttering).',
        'Gir eksempler fra en arbeidsplass.',
      ],
      outline: [
        INN('Avgrens til organisasjonskultur som felles mønster av antakelser, verdier og uttrykk.'),
        DEF('Scheins definisjon: grunnleggende antakelser lært gjennom ekstern tilpasning og intern integrasjon, og overført til nye medlemmer.'),
        TEO('Tre nivåer: artefakter, uttalte verdier, grunnleggende antakelser (isfjellet).'),
        EKS('Et teknologiselskap med åpent landskap, hettegensere og fredagspils (artefakter), uttalt verdi «vi deler alt», og en ubevisst antakelse om at den som jobber mest, er mest verdt.'),
        DRO('Artefakter er lette å se, men vanskelige å tolke uten å kjenne de underliggende antakelsene.'),
        AVS('Kulturen kommer til uttrykk overalt, men forstås først når man ser alle tre nivåene.'),
      ],
      estMinutes: 36,
    },
    {
      id: 'org-kultur.prestasjon',
      label: 'Organisasjonskultur og prestasjoner',
      match: [/kultur.*prestasjon|prestasjon.*kultur/i],
      specific: true,
      assignment: 'Definere organisasjonskultur og drøfte om det er sammenhenger mellom kultur og prestasjoner.',
      keyPoints: [
        'Definerer organisasjonskultur (Schein) og beskriver nivåene kort.',
        'Skiller sterk og svak kultur, og forklarer at en sterk kultur gir felles retning og koordinering.',
        'Drøfter forskning: sterke kulturer presterer bedre når verdiene passer omgivelsene og strategien; tilpasningsdyktige kulturer presterer best over tid (Kotter og Heskett), mens en sterk, rigid kultur kan hemme endring.',
        'Nevner gjerne konkurrerende verdier-rammeverket (klan, adhokrati, marked, hierarki) eller lignende modeller som kobler kulturtyper til effektivitet.',
        'Nyanserer: vanskelig å måle kultur og å vise årsakssammenheng.',
      ],
      outline: [
        INN('Avgrens til kultur som forklaring på forskjeller i prestasjoner mellom organisasjoner.'),
        DEF('Organisasjonskultur etter Schein, og forskjellen på sterk og svak kultur.'),
        TEO('Sterk kultur, tilpasningsdyktig kultur og konkurrerende verdier-rammeverket.'),
        EKS('En butikkjede med sterk kundeservicekultur slår konkurrentene, men sliter da netthandelen krever nye måter å jobbe på.'),
        DRO('Sammenhengen avhenger av samsvar mellom kultur, strategi og omgivelser; årsaksretningen er usikker.'),
        AVS('Kultur kan være et konkurransefortrinn, men også en brems.'),
      ],
      estMinutes: 36,
    },
  ],
  concepts: [
    { id: 'ku-def', term: 'Organisasjonskultur', author: 'Schein', definition: 'Et mønster av grunnleggende antakelser som en gruppe har lært ved å løse problemer med ekstern tilpasning og intern integrasjon, som har fungert godt nok til å bli ansett som gyldige og læres bort til nye medlemmer.', example: 'Nyansatte på verkstedet lærer raskt at «her sier vi fra om feil med en gang», uten at noen har skrevet det ned.' },
    { id: 'ku-artefakter', term: 'Artefakter', author: 'Schein', definition: 'Kulturens synlige uttrykk: arkitektur, kleskode, språk, ritualer, historier, logoer og hvordan folk oppfører seg.', example: 'Alle på kontoret går med joggesko, sitter i åpent landskap og feirer hver kontrakt med å ringe i en bjelle.', confuse: ['ku-verdier', 'ku-antakelser'] },
    { id: 'ku-verdier', term: 'Uttalte verdier', author: 'Schein', definition: 'Det organisasjonen sier at den står for: verdier, mål, strategier og filosofi.', example: 'På veggen og i årsrapporten står det at selskapet er «åpent, modig og kundenært».', confuse: ['ku-artefakter', 'ku-antakelser'] },
    { id: 'ku-antakelser', term: 'Grunnleggende antakelser', author: 'Schein', definition: 'Ubevisste, selvsagte oppfatninger om hvordan ting er og bør gjøres; kulturens kjerne.', example: 'Ingen har sagt det, men alle «vet» at den som går hjem før seks, ikke er seriøs.', confuse: ['ku-artefakter', 'ku-verdier'] },
    { id: 'ku-subkultur', term: 'Subkultur', definition: 'En egen kultur i en del av organisasjonen, f.eks. en avdeling eller yrkesgruppe, som avviker fra hovedkulturen.', example: 'På sykehuset har akuttmottaket en mye mer direkte og uformell tone enn resten av huset.' },
    { id: 'ku-sterk', term: 'Sterk kultur', definition: 'En kultur der verdiene er tydelige, delt av mange og holdt sterkt fast ved.', example: 'I familiebedriften kan alle fortelle hva bedriften står for, og nesten alle handler etter det.' },
    { id: 'ku-tilpasning', term: 'Tilpasningsdyktig kultur', author: 'Kotter & Heskett', definition: 'En kultur som verdsetter endring, læring og å tilpasse seg kunder og omgivelser; knyttet til god prestasjon over tid.', example: 'Mediehuset la raskt om til digitale abonnement fordi kulturen belønnet eksperimentering.' },
    { id: 'ku-cvf', term: 'Konkurrerende verdier-rammeverket', aka: ['Competing Values Framework'], author: 'Cameron & Quinn', definition: 'Modell som plasserer kulturer etter fleksibilitet–kontroll og internt–eksternt fokus: klan, adhokrati, marked og hierarki.', example: 'Gründerbedriften har adhokratikultur (fleksibel og utadvendt), mens forsikringsselskapet har hierarkikultur (kontroll og indre orden).' },
    { id: 'ku-ritual', term: 'Ritualer og seremonier', definition: 'Gjentatte, planlagte handlinger som uttrykker og forsterker kulturens verdier.', example: 'Hver fredag deler teamet ukas beste kundehistorie og gir en kake til den som sto bak.' },
  ],
  models: ['m-schein', 'm-cvf'],
  traps: [
    { label: 'Verdier på veggen er ikke hele kulturen', explanation: 'Uttalte verdier er bare ett nivå. De grunnleggende antakelsene kan være noe helt annet.' },
    { label: 'Sterk kultur = bedre resultater?', explanation: 'Bare når kulturen passer strategien og omgivelsene. En sterk og rigid kultur kan hindre nødvendig endring.' },
  ],
  mnemonic: 'Isfjellet: Artefakter over vann – Verdier i vannkanten – Antakelser dypt under.',
  structure: ['Scheins definisjon', 'Tre nivåer', 'Hvordan kulturen kommer til uttrykk / sammenheng med prestasjon', 'Eksempel', 'Nyansering'],
};

export const ENDRING: OrgTopic = {
  id: 'org-endring',
  name: 'Endring og omstilling',
  shortName: 'Endring og omstilling',
  level: 'organisasjon',
  description: 'Planlagt endring i organisasjoner: Lewins tre faser, Kotters åtte steg, motstand mot endring og hvordan den håndteres.',
  signals: [
    [/endring|omstilling|endringsledelse/i, 3],
    [/lewin|kotters? (?:åtte|8)|motstand mot endring|tine opp/i, 5],
  ],
  minScore: 5,
  intents: [
    {
      id: 'org-endring.prosess',
      label: 'Planlagt endring og motstand',
      match: [/endring|omstilling/i],
      assignment: 'Forklare hvordan planlagt endring kan gjennomføres, og hvordan motstand mot endring kan forstås og håndteres.',
      keyPoints: [
        'Beskriver Lewins tre faser: tine opp, endre og fryse (stabilisere), og kraftfeltanalysen (drivkrefter og motkrefter).',
        'Beskriver Kotters åtte steg, f.eks. skape en følelse av at det haster, bygge en styrende koalisjon, visjon, kommunikasjon, fjerne hindringer, kortsiktige gevinster, konsolidere og forankre i kulturen.',
        'Forklarer årsaker til motstand (usikkerhet, tap, vaner, mistillit, uenighet) og tiltak (informasjon, medvirkning, støtte, forhandling).',
      ],
      outline: [
        INN('Avgrens til planlagt endring i organisasjoner.'),
        DEF('Endring: overgangen fra en nåværende til en ønsket tilstand.'),
        TEO('Lewin (tine opp–endre–fryse) og Kotters åtte steg.'),
        EKS('Sykehuset innfører digital journal: forklarer hvorfor, involverer superbrukere og feirer de første gevinstene.'),
        DRO('Motstand er ofte rasjonell; medvirkning og tydelig kommunikasjon reduserer den.'),
        AVS('Endring lykkes når den planlegges som en prosess, ikke en hendelse.'),
      ],
      estMinutes: 36,
    },
  ],
  concepts: [
    { id: 'en-lewin', term: 'Lewins tre faser', author: 'Lewin', definition: 'Endring skjer ved å tine opp (skape behov for endring), endre (innføre det nye) og fryse (stabilisere den nye praksisen).', example: 'Butikkjeden viser de ansatte hvorfor kassene må bort, innfører selvbetjening, og lager nye rutiner så det ikke glir tilbake.' },
    { id: 'en-kraftfelt', term: 'Kraftfeltanalyse', author: 'Lewin', definition: 'Kartlegging av drivkrefter for endring og motkrefter mot endring; endring skjer når drivkreftene styrkes eller motkreftene svekkes.', example: 'Ledergruppen lister fordelene med hjemmekontor og alle grunnene til at noen er imot, og jobber med de største motkreftene.' },
    { id: 'en-kotter', term: 'Kotters åtte steg', author: 'Kotter', definition: 'Modell for endringsledelse: skape en følelse av at det haster, bygge en styrende koalisjon, utvikle visjon, kommunisere, fjerne hindringer, skape kortsiktige gevinster, konsolidere og forankre i kulturen.', example: 'Direktøren viser tallene som truer bedriften, samler et sterkt endringsteam og lager en tydelig visjon før noe endres.' },
    { id: 'en-motstand', term: 'Motstand mot endring', definition: 'Ansattes uvilje eller handlinger mot en endring, ofte på grunn av usikkerhet, frykt for tap, vaner, mistillit eller faglig uenighet.', example: 'Lærerne protesterer mot den nye plattformen fordi de frykter merarbeid og ikke ble spurt.' },
    { id: 'en-medvirkning', term: 'Medvirkning', definition: 'At de som berøres av endringen, får delta i utformingen av den.', example: 'Sykepleierne er med på å teste og forbedre det nye vaktsystemet før det innføres.' },
  ],
  models: ['m-lewin', 'm-kotter8'],
  traps: [
    { label: 'Motstand er ikke bare negativt', explanation: 'Motstand kan avdekke svakheter i planen. Vis at du kan se det fra de ansattes side.' },
  ],
  mnemonic: 'Lewin: Tine – Endre – Fryse (som en isbit).',
  structure: ['Definer endring', 'Lewin og Kotter', 'Motstand og tiltak', 'Eksempel'],
};

export const KOMPETANSE: OrgTopic = {
  id: 'org-kompetanse',
  name: 'Strategi for kompetanseendring',
  shortName: 'Kompetanseendring',
  level: 'organisasjon',
  description: 'Hva kompetanse er, strategisk kompetanseledelse og fasene i en prosess for kompetanseendring.',
  signals: [
    [/kompetanse/i, 4],
    [/kompetanseendring|kompetanseledelse|kompetansegap|kompetansebehov/i, 5],
  ],
  minScore: 4,
  intents: [
    {
      id: 'org-kompetanse.faser',
      label: 'Strategi for kompetanseendring og faser',
      match: [/kompetanse/i],
      assignment: 'Forklare hva som menes med strategi for kompetanseendring, og hvilke konkrete faser som er sentrale for å sikre prosessen.',
      keyPoints: [
        'Definerer kompetanse som kunnskaper, ferdigheter, evner og holdninger som gjør det mulig å utføre oppgaver i tråd med mål.',
        'Forklarer at strategi for kompetanseendring betyr å utvikle organisasjonens kompetanse planmessig ut fra hva strategien krever.',
        'Beskriver fasene: kartlegge mål og framtidig kompetansebehov, kartlegge dagens kompetanse, finne gapet, velge tiltak og evaluere.',
        'Beskriver tiltakene: anskaffe, utvikle, mobilisere og avvikle kompetanse (f.eks. Lai).',
        'Peker på hva som sikrer prosessen: forankring i ledelsen, medvirkning, kommunikasjon og oppfølging.',
      ],
      outline: [
        INN('Avgrens til planlagt utvikling av organisasjonens kompetanse ut fra strategien.'),
        DEF('Kompetanse: kunnskaper, ferdigheter, evner og holdninger som gjør det mulig å utføre oppgaver i tråd med mål.'),
        TEO('Faser: behov → dagens kompetanse → gapanalyse → tiltak (anskaffe, utvikle, mobilisere, avvikle) → evaluering.'),
        EKS('En bank som skal digitalisere, kartlegger IT-kompetansen, ansetter dataanalytikere, lærer opp rådgivere og flytter folk dit kompetansen trengs.'),
        DRO('Prosessen lykkes best når den forankres i ledelsen og de ansatte involveres.'),
        AVS('Kompetanseendring er en løpende prosess, ikke et engangsprosjekt.'),
      ],
      estMinutes: 36,
    },
  ],
  concepts: [
    { id: 'ko-def', term: 'Kompetanse', definition: 'Kunnskaper, ferdigheter, evner og holdninger som gjør det mulig å utføre oppgaver og funksjoner i tråd med mål.', example: 'Rådgiveren kan regelverket, er flink til å forklare det, og møter kundene med respekt.' },
    { id: 'ko-strategisk', term: 'Strategisk kompetanseledelse', author: 'Lai', definition: 'Planlegging, gjennomføring og evaluering av tiltak for å sikre at organisasjonen har den kompetansen som trengs for å nå målene.', example: 'Ledergruppen setter kompetanse som fast punkt i strategiarbeidet og lager en treårsplan for hvilke ferdigheter som skal bygges.' },
    { id: 'ko-gap', term: 'Kompetansegap', definition: 'Avstanden mellom kompetansen organisasjonen trenger og den den har i dag.', example: 'Kartleggingen viser at bedriften trenger ti personer med dataanalyse, men bare har to.' },
    { id: 'ko-anskaffe', term: 'Anskaffe kompetanse', definition: 'Hente inn kompetanse utenfra, f.eks. gjennom rekruttering, innleie eller samarbeid.', example: 'Kommunen ansetter tre nye sykepleiere med spesialutdanning i demens.', confuse: ['ko-utvikle', 'ko-mobilisere', 'ko-avvikle'] },
    { id: 'ko-utvikle', term: 'Utvikle kompetanse', definition: 'Bygge kompetansen til dem som allerede er ansatt, f.eks. med opplæring, jobbrotasjon og mentorordninger.', example: 'Alle rådgiverne tar et nettkurs i ny regnskapsprogramvare og får en mentor de første månedene.', confuse: ['ko-anskaffe', 'ko-mobilisere', 'ko-avvikle'] },
    { id: 'ko-mobilisere', term: 'Mobilisere kompetanse', definition: 'Ta i bruk kompetansen organisasjonen allerede har på en bedre måte, f.eks. gjennom organisering, motivasjon og rett person på rett plass.', example: 'En økonom som har lært programmering på fritiden, flyttes inn i digitaliseringsprosjektet.', confuse: ['ko-anskaffe', 'ko-utvikle', 'ko-avvikle'] },
    { id: 'ko-avvikle', term: 'Avvikle kompetanse', definition: 'Fase ut kompetanse som ikke lenger trengs, f.eks. gjennom omplassering, naturlig avgang eller nedbemanning.', example: 'Når papirarkivet legges ned, blir arkivmedarbeiderne omskolert eller tilbudt pensjonsordning.', confuse: ['ko-anskaffe', 'ko-utvikle', 'ko-mobilisere'] },
  ],
  models: ['m-kompetanse', 'm-kompetanse-tiltak'],
  traps: [
    { label: 'Ikke bare kurs', explanation: 'Opplæring (utvikle) er bare ett av fire tiltak. Ta med anskaffe, mobilisere og avvikle.' },
    { label: 'Sjekk fasene mot kapittelet', explanation: 'Fasene her følger en vanlig modell for strategisk kompetanseledelse. Sjekk navnene mot pensumkapittelet før eksamen.' },
  ],
  mnemonic: 'Fire tiltak: Anskaffe – Utvikle – Mobilisere – Avvikle (AUMA).',
  structure: ['Definer kompetanse og kompetanseendring', 'Faser i prosessen', 'Fire typer tiltak', 'Hva sikrer prosessen', 'Eksempel'],
};

export const ORGANISASJON_TOPICS: OrgTopic[] = [ORGTEORI, KULTUR, ENDRING, KOMPETANSE];
