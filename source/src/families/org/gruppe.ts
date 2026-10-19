// Gruppenivå og samspill: tillit og rettferdighet, mobbing og trakassering,
// grupper og team, og mangfold.

import type { OrgTopic } from './types';

const INN = (t: string) => ({ del: 'Innledning', tekst: t });
const DEF = (t: string) => ({ del: 'Definisjon', tekst: t });
const TEO = (t: string) => ({ del: 'Teori og modell', tekst: t });
const EKS = (t: string) => ({ del: 'Eksempel', tekst: t });
const DRO = (t: string) => ({ del: 'Forskning og drøfting', tekst: t });
const AVS = (t: string) => ({ del: 'Avslutning', tekst: t });

export const TILLIT: OrgTopic = {
  id: 'org-tillit',
  name: 'Tillit og rettferdighet i organisasjoner',
  shortName: 'Tillit og rettferdighet',
  level: 'gruppe',
  description: 'Tillit som villighet til å være sårbar, hva som gjør noen tillitsverdige, og organisatorisk rettferdighet (distributiv, prosedural og interaksjonell).',
  signals: [
    [/\btillit/i, 5],
    [/rettferdighet|urettferdig/i, 5],
    [/distributiv|prosedural|interaksjonell/i, 3],
  ],
  minScore: 4,
  intents: [
    {
      id: 'org-tillit.tillit',
      label: 'Tillit i organisasjonssammenheng',
      match: [/\btillit/i],
      specific: true,
      assignment: 'Forklare hva som menes med tillit i organisasjoner, hva tillit bygger på og hvilke konsekvenser den har.',
      keyPoints: [
        'Definerer tillit som villighet til å gjøre seg sårbar overfor en annen part, basert på positive forventninger til den andres intensjoner og atferd.',
        'Forklarer hva som gjør noen tillitsverdige: evne (kompetanse), velvilje og integritet (Mayer, Davis og Schoorman), og tillitsgiverens egen tilbøyelighet til å stole på andre.',
        'Nevner nivåer eller typer av tillit (f.eks. mellom kolleger, til leder, til organisasjonen; kalkulert og relasjonell tillit).',
        'Drøfter konsekvenser: bedre samarbeid og informasjonsdeling, mindre behov for kontroll, mer OCB og villighet til endring; tillitsbrudd er kostbare.',
        'Gir eksempel fra arbeidslivet.',
      ],
      outline: [
        INN('Avgrens til tillit mellom mennesker i organisasjoner (kolleger, leder–medarbeider, til organisasjonen).'),
        DEF('Tillit: villighet til å være sårbar overfor en annen, basert på positive forventninger til den andres intensjoner eller atferd.'),
        TEO('Tillitsverdighet bygger på evne, velvilje og integritet; tillit kan bygges og brytes.'),
        EKS('En leder som gir medarbeiderne fullmakt til å godkjenne refusjoner uten kontroll, viser tillit; medarbeiderne svarer med ansvarlighet.'),
        DRO('Tillit gir lavere kontrollkostnader og mer samarbeid; et tillitsbrudd (f.eks. løftebrudd) tar lang tid å reparere.'),
        AVS('Tillit er en ressurs organisasjonen må bygge bevisst gjennom ledelse og rettferdige prosesser.'),
      ],
      estMinutes: 36,
    },
    {
      id: 'org-tillit.rettferdighet',
      label: 'Rettferdighet i organisasjonssammenheng',
      match: [/rettferdighet/i],
      specific: true,
      assignment: 'Forklare hva som menes med rettferdighet i organisasjoner, med de ulike formene og konsekvensene.',
      keyPoints: [
        'Definerer organisatorisk rettferdighet som ansattes opplevelse av hvor rettferdig de blir behandlet i organisasjonen.',
        'Beskriver distributiv rettferdighet (fordeling av goder og byrder, f.eks. likeverdsteorien), prosedural rettferdighet (rettferdige prosedyrer: konsistens, upartiskhet, korrekt informasjon, mulighet for å si sin mening og klage) og interaksjonell rettferdighet (respektfull behandling og ærlig informasjon).',
        'Viser at interaksjonell rettferdighet ofte deles i interpersonlig og informasjonell.',
        'Drøfter konsekvenser: tilfredshet, forpliktelse, tillit, OCB og mindre kontraproduktiv atferd; en rettferdig prosess gjør at folk lettere aksepterer et dårlig utfall.',
        'Gir eksempel fra arbeidslivet.',
      ],
      outline: [
        INN('Avgrens til opplevd rettferdighet blant ansatte og hvorfor den betyr noe.'),
        DEF('Organisatorisk rettferdighet: ansattes opplevelse av hvor rettferdig de blir behandlet.'),
        TEO('Distributiv, prosedural og interaksjonell (interpersonlig og informasjonell) rettferdighet.'),
        EKS('Ved nedbemanning aksepterer de ansatte utvalget bedre når kriteriene er åpne, alle får uttale seg og lederne forklarer beslutningen med respekt.'),
        DRO('Prosedural rettferdighet henger særlig sammen med holdninger til organisasjonen og lederen.'),
        AVS('Rettferdighet er noe ledere kan påvirke direkte gjennom prosesser og måten de behandler folk på.'),
      ],
      estMinutes: 36,
    },
  ],
  concepts: [
    { id: 'tl-def', term: 'Tillit', author: 'Mayer, Davis & Schoorman', definition: 'Villighet til å gjøre seg sårbar overfor en annen part, basert på positive forventninger til den andres intensjoner eller atferd.', example: 'Teamlederen lar Amir presentere hennes forslag for ledelsen uten å kontrollere hva han sier.' },
    { id: 'tl-evne', term: 'Evne (tillitsverdighet)', definition: 'Den andres kompetanse og ferdigheter på området tilliten gjelder.', example: 'Kollegene stoler på Petra når det gjelder skatteregler, fordi hun er den dyktigste på feltet.' },
    { id: 'tl-velvilje', term: 'Velvilje', definition: 'Oppfatningen av at den andre ønsker en vel og ikke bare er ute etter egen gevinst.', example: 'Medarbeiderne vet at lederen vil dem vel, fordi hun har stått opp for dem i vanskelige saker.' },
    { id: 'tl-integritet', term: 'Integritet', definition: 'Oppfatningen av at den andre følger prinsipper man selv godtar, er ærlig og holder det den lover.', example: 'Sjefen har alltid gjort det han har sagt, også når det kostet ham noe.' },
    { id: 'tl-tilboyelighet', term: 'Tilbøyelighet til tillit', definition: 'En personlig, generell tendens til å stole på andre mennesker.', example: 'Lene stoler på nye kolleger fra første dag, mens Kim trenger måneder.' },
    { id: 'rf-org', term: 'Organisatorisk rettferdighet', definition: 'Ansattes opplevelse av hvor rettferdig de blir behandlet i organisasjonen.', example: 'I medarbeiderundersøkelsen svarer de fleste at beslutninger om turnus tas på en rettferdig måte.' },
    { id: 'rf-distributiv', term: 'Distributiv rettferdighet', definition: 'Opplevd rettferdighet i fordelingen av utfall som lønn, bonus, oppgaver og forfremmelse.', example: 'Alle i teamet fikk samme bonus, men Selma, som gjorde mest, opplevde det som urettferdig.', confuse: ['rf-prosedural', 'rf-interaksjonell'] },
    { id: 'rf-prosedural', term: 'Prosedural rettferdighet', author: 'Leventhal; Thibaut & Walker', definition: 'Opplevd rettferdighet i prosedyrene som brukes for å ta beslutninger: konsistente, upartiske, basert på riktig informasjon, med mulighet til å si sin mening og klage.', example: 'Ved forfremmelsen fikk alle søkerne samme intervju og samme kriterier, og kunne be om begrunnelse.', confuse: ['rf-distributiv', 'rf-interaksjonell'] },
    { id: 'rf-interaksjonell', term: 'Interaksjonell rettferdighet', author: 'Bies & Moag', definition: 'Opplevd rettferdighet i hvordan man blir behandlet av beslutningstakere: med respekt og verdighet (interpersonlig) og med ærlige forklaringer (informasjonell).', example: 'Lederen tok seg tid til å forklare hvorfor Ole ikke fikk jobben, og gjorde det med respekt.', confuse: ['rf-distributiv', 'rf-prosedural'] },
    { id: 'rf-voice', term: 'Stemmerett i prosessen', aka: ['voice'], definition: 'Å få legge fram sitt syn før en beslutning tas; øker opplevd prosedural rettferdighet.', example: 'Før ny vaktordning ble innført, fikk alle sykepleierne komme med innspill i et møte.' },
  ],
  models: ['m-tillit', 'm-rettferdighet'],
  traps: [
    { label: 'Tre former for rettferdighet', explanation: 'Fordelingen (distributiv), prosessen (prosedural) og behandlingen (interaksjonell). Bruk riktige navn.' },
    { label: 'Tillit er ikke det samme som rettferdighet', explanation: 'Rettferdighet er en viktig kilde til tillit, men de er ulike begreper. Spør oppgaven om ett av dem, hold deg til det.' },
  ],
  mnemonic: 'Rettferdighet: Hva jeg får (distributiv), Hvordan det avgjøres (prosedural), Hvordan jeg blir behandlet (interaksjonell).',
  structure: ['Definer begrepet', 'Komponenter (evne–velvilje–integritet / tre former for rettferdighet)', 'Konsekvenser for organisasjonen', 'Eksempel'],
};

export const MOBBING: OrgTopic = {
  id: 'org-mobbing',
  name: 'Mobbing og trakassering',
  shortName: 'Mobbing og trakassering',
  level: 'gruppe',
  description: 'Hva mobbing og trakassering på arbeidsplassen er, hvordan mobbing utvikler seg, årsaker og hvordan virksomheter kan forebygge og håndtere det.',
  signals: [
    [/mobbing|mobbe/i, 6],
    [/trakassering|seksuell trakassering|utilbørlig/i, 5],
  ],
  minScore: 4,
  intents: [
    {
      id: 'org-mobbing.forebygge',
      label: 'Mobbing og trakassering: definisjon og forebygging',
      match: [/mobbing|trakassering/i],
      assignment: 'Definere mobbing (og trakassering) på arbeidsplassen og forklare hvordan virksomheter best kan forebygge det.',
      keyPoints: [
        'Definerer mobbing: at en person gjentatte ganger og over tid utsettes for negative handlinger fra en eller flere, i en situasjon der personen har vanskelig for å forsvare seg (ubalanse i makt). En enkeltstående konflikt mellom likeverdige er ikke mobbing.',
        'Definerer trakassering som uønsket, krenkende, skremmende, fiendtlig, nedverdigende eller ydmykende atferd, herunder seksuell trakassering; kan også være enkelthendelser.',
        'Beskriver typer negative handlinger (arbeidsrelaterte, personrettede, fysisk skremmende) og eskaleringsprosessen.',
        'Forklarer årsaker, særlig arbeidsmiljøhypotesen: rollekonflikt, høyt stress, uklare forventninger og passiv (laissez-faire) ledelse.',
        'Foreslår forebygging på flere nivåer: tydelige retningslinjer og nulltoleranse, god ledelse og godt psykososialt arbeidsmiljø, tidlig konflikthåndtering, varslingsrutiner, rask og rettferdig håndtering og oppfølging av den utsatte.',
      ],
      outline: [
        INN('Avgrens til mobbing og trakassering mellom personer på arbeidsplassen og virksomhetens ansvar.'),
        DEF('Mobbing: gjentatte negative handlinger over tid mot en person som har vanskelig for å forsvare seg. Trakassering: uønsket, krenkende atferd.'),
        TEO('Typer handlinger, eskalering fra konflikt til utstøting, og arbeidsmiljøhypotesen.'),
        EKS('En ansatt blir systematisk holdt utenfor lunsjer og møter, får de dårligste vaktene og blir latterliggjort på chatten over flere måneder.'),
        DRO('Forebygging: policy og ledere som griper inn tidlig, kartlegging, trygge varslingskanaler og faste rutiner for undersøkelse og oppfølging.'),
        AVS('Mobbing skader helse og drift; aktiv ledelse er det viktigste forebyggende tiltaket.'),
      ],
      estMinutes: 36,
    },
  ],
  concepts: [
    { id: 'mb-def', term: 'Mobbing på arbeidsplassen', author: 'Einarsen mfl.', definition: 'At en person gjentatte ganger og over tid blir utsatt for negative handlinger fra en eller flere, i en situasjon der personen har vanskelig for å forsvare seg.', example: 'I et halvt år har Frida blitt latterliggjort på møter, holdt utenfor sosiale treff og fått beskjeder for sent, og hun føler at hun ikke kan gjøre noe med det.', confuse: ['mb-konflikt', 'mb-trakassering'] },
    { id: 'mb-konflikt', term: 'Konflikt (vs. mobbing)', definition: 'Uenighet eller motsetning mellom parter som er noenlunde jevnbyrdige; blir mobbing først når den ene havner i en underlegen posisjon og blir utsatt for gjentatte negative handlinger.', example: 'To like sterke kolleger krangler høylytt om hvordan prosjektet skal gjennomføres.', confuse: ['mb-def'] },
    { id: 'mb-trakassering', term: 'Trakassering', definition: 'Uønsket atferd som har som formål eller virkning å være krenkende, skremmende, fiendtlig, nedverdigende eller ydmykende; kan være en enkelthendelse.', example: 'En kollega kommer med nedsettende kommentarer om en ansatts religion foran kundene.', confuse: ['mb-def'] },
    { id: 'mb-seksuell', term: 'Seksuell trakassering', definition: 'Uønsket seksuell oppmerksomhet som er plagsom eller krenkende, verbalt, ikke-verbalt eller fysisk.', example: 'En leder kommenterer stadig kroppen til en ung medarbeider og sender henne meldinger sent på kvelden.' },
    { id: 'mb-arbeid', term: 'Arbeidsrelaterte negative handlinger', definition: 'Handlinger rettet mot jobben, som å ta fra noen oppgaver, gi urimelige frister, holde tilbake informasjon eller overdreven kontroll.', example: 'Siden konflikten har lederen fratatt Kjell alle ansvarsoppgaver og gir ham bare rutinearbeid med umulige frister.' },
    { id: 'mb-person', term: 'Personrettede negative handlinger', definition: 'Handlinger rettet mot personen, som ryktespredning, utfrysing, ydmykelse, erting og sårende bemerkninger.', example: 'Kolleger sprer rykter om Lina og slutter å snakke når hun kommer inn på pauserommet.' },
    { id: 'mb-eskalering', term: 'Eskalering av mobbing', definition: 'Mobbing utvikler seg ofte gradvis: fra uklare negative handlinger, via systematisk mobbing og stigmatisering, til at personen blir utstøtt.', example: 'Det startet med spydige kommentarer, ble til utfrysing, og endte med at Hans ble sett på som «problemet» og sluttet.' },
    { id: 'mb-arbeidsmiljo', term: 'Arbeidsmiljøhypotesen', author: 'Leymann', definition: 'Forklaring på mobbing som legger vekt på dårlige arbeidsforhold: rollekonflikt, høyt stress, dårlig organisering og passiv ledelse.', example: 'I avdelingen med uklare roller, stort press og en leder som aldri griper inn, oppstår det flere mobbesaker enn i resten av bedriften.' },
    { id: 'mb-varsling', term: 'Varsling', definition: 'Å si fra om kritikkverdige forhold i virksomheten, f.eks. mobbing eller trakassering, gjennom egne rutiner.', example: 'Kollegaen som så det som skjedde, sier ifra om de kritikkverdige forholdene til ledelsen gjennom kanalen bedriften har satt opp for det.' },
  ],
  models: ['m-mobbing-eskalering', 'm-forebygging'],
  traps: [
    { label: 'En krangel er ikke mobbing', explanation: 'Mobbing krever gjentatte handlinger over tid og en ubalanse der den utsatte ikke kan forsvare seg.' },
    { label: 'Glemmer trakassering', explanation: 'Nyere pensum legger vekt på trakassering ved siden av mobbing. Definer begge når spørsmålet nevner begge.' },
  ],
  mnemonic: 'Mobbing: Gjentatt – Over tid – Ubalanse (G-O-U).',
  structure: ['Definer mobbing og trakassering', 'Typer handlinger og eskalering', 'Årsaker', 'Forebygging på flere nivåer', 'Eksempel'],
};

export const GRUPPER: OrgTopic = {
  id: 'org-grupper',
  name: 'Grupper og team',
  shortName: 'Grupper og team',
  level: 'gruppe',
  description: 'Hva grupper og team er, gruppeutvikling, normer og roller, gruppeprosesser (sosial loffing, gruppetenkning) og hva som gjør team effektive.',
  signals: [
    [/\bteam|gruppe(?!tenkning)/i, 3],
    [/gruppetenkning|sosial loffing|tuckman|gruppeutvikling|teamarbeid|kohesjon/i, 5],
  ],
  minScore: 5,
  intents: [
    {
      id: 'org-grupper.effektive',
      label: 'Grupper, team og effektivitet',
      match: [/team|gruppe/i],
      assignment: 'Forklare hva grupper og team er, hvordan de utvikler seg og hva som gjør dem effektive.',
      keyPoints: [
        'Definerer gruppe (to eller flere som samhandler, er gjensidig avhengige og oppfatter seg som en gruppe) og team (gruppe med felles mål og felles ansvar for resultatet).',
        'Beskriver gruppeutvikling (Tuckman: forming, storming, norming, performing).',
        'Forklarer gruppeprosesser: normer, roller, kohesjon, sosial loffing og gruppetenkning.',
        'Forklarer hva som gir effektive team: tydelig mål, riktig sammensetning, psykologisk trygghet og god teamledelse.',
      ],
      outline: [
        INN('Avgrens til arbeidsgrupper og team i organisasjoner.'),
        DEF('Gruppe og team, og forskjellen mellom dem.'),
        TEO('Tuckmans faser, normer og roller, sosial loffing og gruppetenkning.'),
        EKS('Et prosjektteam krangler i starten om roller (storming), lager så felles spilleregler (norming) og leverer godt (performing).'),
        DRO('Psykologisk trygghet er en sterk forklaring på hvorfor noen team lærer og presterer bedre.'),
        AVS('Team blir effektive når struktur, mål og klima er på plass.'),
      ],
      estMinutes: 36,
    },
  ],
  concepts: [
    { id: 'gr-gruppe', term: 'Gruppe', definition: 'To eller flere personer som samhandler, er gjensidig avhengige og oppfatter seg selv som en gruppe.', example: 'De fem som jobber i kantinen, deler oppgaver, har egne vitser og kaller seg «kantinegjengen».', confuse: ['gr-team'] },
    { id: 'gr-team', term: 'Team', definition: 'En gruppe med felles mål, gjensidig avhengige oppgaver og felles ansvar for resultatet.', example: 'De fem utviklerne har ett felles mål om å levere appen innen mars, er avhengige av hverandres arbeid og blir målt på det samme resultatet.', confuse: ['gr-gruppe'] },
    { id: 'gr-tuckman', term: 'Tuckmans faser for gruppeutvikling', author: 'Tuckman', definition: 'Grupper utvikler seg gjennom forming (bli kjent), storming (konflikt), norming (felles normer) og performing (effektivt arbeid); senere lagt til adjourning (oppløsning).', example: 'Det nye teamet var høflig første uke, kranglet om ansvar i uke tre og har nå funnet en arbeidsform som fungerer.' },
    { id: 'gr-normer', term: 'Gruppenormer', definition: 'Uskrevne regler for hvilken atferd som er forventet og akseptert i gruppen.', example: 'Ingen i teamet sender e-post etter klokka seks, selv om det ikke står noe sted.' },
    { id: 'gr-kohesjon', term: 'Kohesjon', definition: 'Hvor sterkt medlemmene føler seg knyttet til gruppen og ønsker å bli i den.', example: 'Turnusgjengen på sykehjemmet står sammen, trives sammen og vil ikke bytte avdeling.' },
    { id: 'gr-loffing', term: 'Sosial loffing', author: 'Ringelmann; Latané', definition: 'Tendens til å yte mindre når man jobber i gruppe enn alene, særlig når den enkeltes bidrag ikke synes.', example: 'I gruppeoppgaven skriver to personer nesten alt, mens de tre andre «henger med».' },
    { id: 'gr-gruppetenkning', term: 'Gruppetenkning', author: 'Janis', definition: 'Når ønsket om enighet i en sammensveiset gruppe blir så sterkt at kritisk vurdering av alternativer uteblir.', example: 'Ingen i ledergruppen tør å stille spørsmål ved den karismatiske direktørens oppkjøp, og alle advarsler blir avfeid.' },
    { id: 'gr-roller', term: 'Roller i grupper', definition: 'Forventninger til hvilken atferd et medlem skal ha i gruppen, formelt eller uformelt (f.eks. leder, idéskaper, kontrollør).', example: 'I teamet er det alltid Iben som kommer med ideene og Mats som sjekker at alt er korrekt.' },
  ],
  models: ['m-tuckman'],
  traps: [
    { label: 'Gruppe vs. team', explanation: 'Alle team er grupper, men ikke alle grupper er team. Teamet har felles mål og felles ansvar.' },
  ],
  mnemonic: 'Tuckman: Form – Storm – Norm – Perform.',
  structure: ['Definer gruppe og team', 'Gruppeutvikling', 'Gruppeprosesser', 'Effektive team', 'Eksempel'],
};

export const MANGFOLD: OrgTopic = {
  id: 'org-mangfold',
  name: 'Mangfold og mangfoldsledelse',
  shortName: 'Mangfold',
  level: 'gruppe',
  description: 'Hva mangfold i organisasjoner er, hvorfor organisasjoner må ta det på alvor, mangfoldsklima, inkludering og mangfoldsledelse.',
  signals: [
    [/mangfold/i, 6],
    [/inkluder|diskriminering|etnisk|likestilling/i, 2],
  ],
  minScore: 4,
  intents: [
    {
      id: 'org-mangfold.klima',
      label: 'Mangfoldsklima og mangfoldsledelse',
      match: [/mangfolds?-?\s*klima|mangfolds?-?\s*ledelse/i],
      specific: true,
      assignment: 'Forklare hva mangfoldsklima er og hva som kjennetegner arbeidsplasser med god mangfoldsledelse.',
      keyPoints: [
        'Definerer mangfoldsklima som de ansattes felles oppfatning av at organisasjonen verdsetter mangfold, behandler alle rettferdig og inkluderer alle, gjennom sine policyer, praksiser og prosedyrer.',
        'Forklarer inkludering: å oppleve tilhørighet samtidig som man blir verdsatt for den man er.',
        'Beskriver mangfoldsledelse: systematisk arbeid for å rekruttere, beholde, utvikle og utnytte mangfoldet, f.eks. rettferdige rekrutterings- og forfremmelsesrutiner, inkluderende ledere, opplæring, mentorordninger, forpliktelse fra toppledelsen og oppfølging med tall.',
        'Viser at et godt mangfoldsklima henger sammen med bedre trivsel, lavere turnover og at mangfoldets fordeler faktisk tas ut.',
        'Gir eksempler.',
      ],
      outline: [
        INN('Avgrens til mangfold på arbeidsplassen og hvordan det ledes.'),
        DEF('Mangfoldsklima: ansattes felles oppfatning av at organisasjonen verdsetter mangfold og behandler og inkluderer alle rettferdig.'),
        TEO('Kategorisering–elaborering: mangfold kan gi både bedre beslutninger og mer konflikt; klima og ledelse avgjør hva som skjer.'),
        EKS('En kommune bruker anonymiserte søknader, setter sammen intervjupaneler med ulik bakgrunn og har mentorordning for nyansatte.'),
        DRO('God mangfoldsledelse kjennetegnes av rettferdige HR-praksiser, inkluderende ledere og at forskjeller brukes aktivt i problemløsning.'),
        AVS('Mangfold gir gevinster først når klimaet er inkluderende.'),
      ],
      estMinutes: 36,
    },
    {
      id: 'org-mangfold.hvorfor',
      label: 'Mangfold og hvorfor det må tas på alvor',
      match: [/mangfold/i],
      assignment: 'Definere mangfold i organisasjoner og forklare hvorfor organisasjoner må ta mangfold på alvor.',
      keyPoints: [
        'Definerer mangfold som forskjeller mellom medlemmene i en enhet på egenskaper som kan føre til at de oppfatter hverandre som ulike.',
        'Skiller overflatemangfold (synlige, demografiske kjennetegn) fra dypmangfold (verdier, holdninger, personlighet, kunnskap).',
        'Gir begrunnelser: lovkrav og rettferdighet, en arbeidsstyrke som blir mer mangfoldig, bedre beslutninger og kreativitet, bredere rekrutteringsgrunnlag og kundeforståelse.',
        'Drøfter at mangfold også kan gi konflikter og svakere samhold (sosial kategorisering og likhetstiltrekning) hvis det ikke ledes godt.',
      ],
      outline: [
        INN('Avgrens til mangfold blant ansatte og hvorfor det er en lederoppgave.'),
        DEF('Mangfold: forskjeller mellom medlemmer på egenskaper som får dem til å oppfatte hverandre som ulike; overflate- og dypmangfold.'),
        TEO('Informasjonsperspektivet (flere ressurser) mot sosial kategorisering (inn- og utgrupper).'),
        EKS('Et team med ulik faglig og kulturell bakgrunn finner flere løsninger, men trenger tydelige spilleregler for å unngå klikkdannelse.'),
        DRO('Effekten avhenger av ledelse og klima; rettslige krav (likestillings- og diskrimineringsloven) gjør det også til en plikt.'),
        AVS('Mangfold må tas på alvor både av etiske, juridiske og prestasjonsmessige grunner.'),
      ],
      estMinutes: 36,
    },
  ],
  concepts: [
    { id: 'mg-def', term: 'Mangfold', author: 'van Knippenberg & Schippers', definition: 'Forskjeller mellom medlemmene i en enhet på egenskaper som kan føre til at de oppfatter hverandre som ulike.', example: 'Avdelingen har ansatte fra seks land, mellom 22 og 64 år, med bakgrunn fra økonomi, IT og sykepleie.' },
    { id: 'mg-overflate', term: 'Overflatemangfold', definition: 'Forskjeller i synlige, demografiske kjennetegn som kjønn, alder og etnisitet.', example: 'På bildet av ledergruppen ser man med en gang at det er både kvinner og menn i ulike aldre.', confuse: ['mg-dyp'] },
    { id: 'mg-dyp', term: 'Dypmangfold', definition: 'Forskjeller i egenskaper som ikke synes direkte, som verdier, holdninger, personlighet og kunnskap.', example: 'To kolleger som ligner på hverandre, viser seg å ha helt ulike syn på risiko og arbeidsmåter.', confuse: ['mg-overflate'] },
    { id: 'mg-klima', term: 'Mangfoldsklima', definition: 'Ansattes felles oppfatning av at organisasjonen verdsetter mangfold og behandler og inkluderer alle rettferdig, gjennom policyer, praksiser og prosedyrer.', example: 'De ansatte sier at det ikke betyr noe for karrieren hvor man kommer fra, og at alle blir hørt på møtene.' },
    { id: 'mg-inkludering', term: 'Inkludering', author: 'Shore mfl.', definition: 'Opplevelsen av å høre til i gruppen samtidig som man blir verdsatt for det som gjør en unik.', example: 'Den nye kollegaen fra Polen blir invitert med i alt, og teamet spør henne aktivt om erfaringene fra markedet der.' },
    { id: 'mg-ledelse', term: 'Mangfoldsledelse', definition: 'Systematisk arbeid for å rekruttere, beholde, utvikle og utnytte mangfoldet i organisasjonen.', example: 'Bedriften har anonymiserte søknader, mentorprogram og måler hvem som blir forfremmet, år for år.' },
    { id: 'mg-kategorisering', term: 'Sosial kategorisering', author: 'Tajfel & Turner (sosial identitet)', definition: 'Tendens til å dele folk inn i inngrupper («oss») og utgrupper («dem»), som kan gi fordommer, konflikt og svakere samhold.', example: 'I lunsjen sitter de norske og de utenlandske ingeniørene ved hvert sitt bord, og det snakkes om «de andre».' },
    { id: 'mg-likhet', term: 'Likhetstiltrekning', aka: ['similarity–attraction'], author: 'Byrne', definition: 'Tendens til å like og velge folk som ligner på oss selv.', example: 'Lederen ansetter igjen en kandidat som har samme utdanning og hobbyer som ham selv.' },
    { id: 'mg-informasjon', term: 'Informasjonsperspektivet på mangfold', definition: 'Synet på at mangfold gir flere perspektiver, mer kunnskap og bedre beslutninger når informasjonen deles og bearbeides.', example: 'Teamet med folk fra salg, produksjon og økonomi oppdager en svakhet i planen som ingen ville sett alene.' },
  ],
  models: ['m-mangfold'],
  traps: [
    { label: 'Mangfold er ikke automatisk positivt', explanation: 'Mangfold kan gi både bedre beslutninger og mer konflikt. Ledelse og klima avgjør utfallet.' },
    { label: 'Mangfoldsklima er en felles oppfatning', explanation: 'Det handler om hvordan de ansatte oppfatter organisasjonens praksis, ikke bare om hvor mange ulike folk som jobber der.' },
  ],
  mnemonic: 'Overflate = det du ser. Dyp = det du må bli kjent med.',
  structure: ['Definer mangfold (overflate/dyp)', 'Hvorfor ta det på alvor', 'Mangfoldsklima og inkludering', 'Mangfoldsledelse i praksis', 'Eksempel'],
};

export const GRUPPE_TOPICS: OrgTopic[] = [TILLIT, MOBBING, GRUPPER, MANGFOLD];
