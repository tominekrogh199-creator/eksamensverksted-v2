// Ferdighetsregister. Ferdighetene er observerbare handlinger, ikke temaer.

import { ORG_SKILLS } from './org';

export interface SkillDef {
  id: string;
  name: string;
  observable: string; // hva studenten må gjøre for at vi skal se ferdigheten
  group: 'grunnlag' | 'likevekt' | 'avgift' | 'prosent' | 'kostnad' | 'arbeidsmarked' | 'mikro' | 'makro' | 'elektro' | 'digital' | 'org';
  prerequisites: string[];
}

export const SKILLS: SkillDef[] = [
  { id: 'alg.innsetting', name: 'Sette inn en verdi i et uttrykk', observable: 'Regner ut 120 − 2 · 20 riktig når P = 20 settes inn.', group: 'grunnlag', prerequisites: [] },
  { id: 'alg.flytte', name: 'Flytte ledd over likhetstegnet', observable: 'Samler ukjente på én side og tall på den andre med riktig fortegn.', group: 'grunnlag', prerequisites: [] },
  { id: 'alg.isolere', name: 'Isolere den ukjente i en lineær likning', observable: 'Går fra 100 = 5P til P = 20 ved å dele begge sider på 5.', group: 'grunnlag', prerequisites: ['alg.flytte'] },
  { id: 'pst.andel', name: 'Regne med prosent og andeler', observable: 'Finner 15 % av 80 og skriver en andel som prosent.', group: 'grunnlag', prerequisites: [] },
  { id: 'graf.lese', name: 'Lese av en rett linje i et diagram', observable: 'Leser av verdien på en akse for et gitt punkt på linjen.', group: 'grunnlag', prerequisites: [] },

  { id: 'lik.betingelse', name: 'Sette opp likevektsbetingelsen', observable: 'Skriver Qd = Qs med de oppgitte uttrykkene.', group: 'likevekt', prerequisites: ['alg.innsetting'] },
  { id: 'lik.losning', name: 'Finne likevektspris og -kvantum', observable: 'Løser likningen og finner både P og Q.', group: 'likevekt', prerequisites: ['lik.betingelse', 'alg.isolere', 'alg.innsetting'] },
  { id: 'lik.kontroll', name: 'Kontrollere likevekten i begge uttrykk', observable: 'Setter prisen inn i både etterspørsel og tilbud og får samme kvantum.', group: 'likevekt', prerequisites: ['alg.innsetting'] },
  { id: 'lik.tolke', name: 'Forklare hva likevekt betyr i modellen', observable: 'Forklarer at etterspurt og tilbudt kvantum er like ved likevektsprisen, uten press på prisen.', group: 'likevekt', prerequisites: ['lik.losning'] },
  { id: 'lik.overskudd', name: 'Finne og tolke overskudd ved en annen pris', observable: 'Beregner Qd og Qs ved en gitt pris og tolker differansen.', group: 'likevekt', prerequisites: ['alg.innsetting'] },
  { id: 'lik.graf', name: 'Tegne og lese tilbud og etterspørsel', observable: 'Plasserer kurvene med pris på loddrett akse og finner skjæringspunktet.', group: 'likevekt', prerequisites: ['graf.lese'] },
  { id: 'lik.parameter', name: 'Finne en ukjent parameter fra en kjent likevekt', observable: 'Setter kjent likevektspris inn og løser for den ukjente konstanten.', group: 'likevekt', prerequisites: ['alg.isolere', 'alg.innsetting'] },

  { id: 'avg.modell', name: 'Modellere en stykkavgift i markedet', observable: 'Skriver tilbudet som funksjon av prisen produsenten sitter igjen med, P − t.', group: 'avgift', prerequisites: ['lik.losning'] },
  { id: 'avg.fordeling', name: 'Beregne og tolke hvem som bærer avgiften', observable: 'Sammenlikner konsumentpris og produsentpris med prisen før avgift.', group: 'avgift', prerequisites: ['avg.modell'] },

  { id: 'pst.endring', name: 'Beregne prosentvis endring med riktig grunnlag', observable: 'Deler endringen på startverdien.', group: 'prosent', prerequisites: ['pst.andel'] },
  { id: 'pst.baklengs', name: 'Regne baklengs fra en prosentvis endring', observable: 'Finner ny verdi eller startverdi med vekstfaktor.', group: 'prosent', prerequisites: ['pst.endring', 'alg.isolere'] },
  { id: 'pst.poeng', name: 'Skille prosent og prosentpoeng', observable: 'Skiller endring i prosentpoeng fra prosentvis endring.', group: 'prosent', prerequisites: ['pst.endring'] },
  { id: 'pst.vekstfaktor', name: 'Bruke vekstfaktor ved flere endringer', observable: 'Multipliserer vekstfaktorer i stedet for å legge sammen prosenter.', group: 'prosent', prerequisites: ['pst.endring'] },
  { id: 'pst.tolke', name: 'Tolke en prosentvis endring', observable: 'Forklarer hvorfor grunnlaget avgjør prosenten.', group: 'prosent', prerequisites: ['pst.endring'] },

  { id: 'kost.fast_var', name: 'Skille faste og variable kostnader', observable: 'Peker ut konstantleddet som faste kostnader og leddet med Q som variable.', group: 'kostnad', prerequisites: [] },
  { id: 'kost.ac', name: 'Beregne gjennomsnittskostnad', observable: 'Regner ut AC = TC/Q ved en gitt mengde.', group: 'kostnad', prerequisites: ['alg.innsetting'] },
  { id: 'kost.mc', name: 'Tolke grensekostnad', observable: 'Forklarer at MC er kostnaden ved én enhet til, og at den er konstant her.', group: 'kostnad', prerequisites: ['kost.fast_var'] },
  { id: 'kost.nullpunkt', name: 'Finne nullpunktsmengden', observable: 'Setter inntekt lik kostnad og løser for Q.', group: 'kostnad', prerequisites: ['alg.isolere'] },
  { id: 'kost.tolke', name: 'Forklare hvordan gjennomsnittskostnaden endres', observable: 'Forklarer at faste kostnader fordeles på flere enheter.', group: 'kostnad', prerequisites: ['kost.ac'] },

  { id: 'disiplin.rent', name: 'Beregne den økonomiske verdien av jobben', observable: 'Trekker innsatskostnad fra lønn og ledighetskostnad fra trygd, og ganger differansen med tiden tapet varer.', group: 'arbeidsmarked', prerequisites: ['alg.innsetting'] },
  { id: 'disiplin.modell', name: 'Forklare arbeidsdisiplinmodellen', observable: 'Forklarer hvorfor lønnen settes over reservasjonslønnen og hvordan ledighet, trygd og overvåking påvirker den.', group: 'arbeidsmarked', prerequisites: [] },
  { id: 'wsps.arbeidsstyrke', name: 'Bruke arbeidsmarkedsbegrepene', observable: 'Skiller arbeidsstyrke, sysselsatte, ledige og befolkning i arbeidsfør alder, og regner ledighetsrate.', group: 'arbeidsmarked', prerequisites: ['pst.andel'] },
  { id: 'wsps.ws', name: 'Forklare lønnssettingskurven (WS)', observable: 'Forklarer at WS viser lønnen som gir innsats, og at den stiger fordi lav ledighet svekker verdien av jobben.', group: 'arbeidsmarked', prerequisites: ['disiplin.modell'] },
  { id: 'wsps.ps', name: 'Forklare prissettingslinjen (PS)', observable: 'Forklarer at PS bestemmes av produktivitet og prispåslag.', group: 'arbeidsmarked', prerequisites: [] },
  { id: 'wsps.likevekt', name: 'Forklare likevekten i WS–PS', observable: 'Viser at reallønnen i likevekt bestemmes av PS, og hvorfor det er ledighet i likevekt.', group: 'arbeidsmarked', prerequisites: ['wsps.ws', 'wsps.ps'] },
  { id: 'wsps.skift', name: 'Analysere skift i WS eller PS', observable: 'Sier hvilken kurve som skifter, hvilken vei, og hva som skjer med ledighet og reallønn.', group: 'arbeidsmarked', prerequisites: ['wsps.likevekt'] },

  { id: 'af.indiff', name: 'Tolke indifferenskurver og MSB', observable: 'Forklarer at kurven viser like gode kombinasjoner og at MSB er villigheten til å bytte.', group: 'mikro', prerequisites: [] },
  { id: 'af.budsjett', name: 'Sette opp og tolke budsjettlinjen', observable: 'Finner konsum ved gitt fritid og forklarer at helningen er timelønnen.', group: 'mikro', prerequisites: ['alg.innsetting'] },
  { id: 'af.optimum', name: 'Forklare optimalt valg (MSB = MTB)', observable: 'Peker ut tangeringspunktet og forklarer hvorfor andre punkter ikke er optimale.', group: 'mikro', prerequisites: ['af.indiff', 'af.budsjett'] },
  { id: 'af.effekter', name: 'Skille inntekts- og substitusjonseffekt', observable: 'Forklarer retningen på hver effekt og hvilken som dominerer.', group: 'mikro', prerequisites: ['af.budsjett'] },
  { id: 'ak.gevinst', name: 'Beregne alternativkostnad og økonomisk gevinst', observable: 'Sammenlikner nettogevinsten av valget med beste alternativ.', group: 'mikro', prerequisites: [] },
  { id: 'marked.skift', name: 'Analysere skift i tilbud og etterspørsel', observable: 'Sier hvilken kurve som skifter og hva som skjer med pris og mengde.', group: 'mikro', prerequisites: [] },
  { id: 'marked.helning', name: 'Forklare hvordan helningen styrer prisutslaget', observable: 'Forklarer at flat tilbudskurve gir små prisutslag, og hvordan etterspørselens helning fordeler en avgift.', group: 'mikro', prerequisites: ['marked.skift'] },
  { id: 'marked.frikonkurranse', name: 'Forklare frikonkurranse og MC = P', observable: 'Forklarer pristaking og at tilbudskurven er marginalkostnaden.', group: 'mikro', prerequisites: [] },
  { id: 'tek.isokost', name: 'Velge teknologi med isokostlinjer', observable: 'Regner kostnaden for hver teknologi og forklarer rollen til relative priser.', group: 'mikro', prerequisites: ['alg.innsetting'] },
  { id: 'tek.produkt', name: 'Tolke produktfunksjon og gjennomsnittsprodukt', observable: 'Regner gjennomsnittsprodukt og forklarer avtagende utbytte.', group: 'mikro', prerequisites: [] },
  { id: 'pa.kontrakt', name: 'Forklare prinsipal–agent og ufullstendige kontrakter', observable: 'Bruker begrepene asymmetrisk informasjon, ufullstendig kontrakt, insentiver og overvåking.', group: 'mikro', prerequisites: [] },
  { id: 'kap.kjennetegn', name: 'Kjennetegn ved kapitalisme og ulikhetsmål', observable: 'Gjenkjenner privat eiendomsrett, markeder og bedrifter, og tolker rich/poor-ratio.', group: 'mikro', prerequisites: [] },

  { id: 'makro.bnp', name: 'Forklare og beregne BNP', observable: 'Definerer BNP og regner med utgiftsmetoden.', group: 'makro', prerequisites: [] },
  { id: 'makro.inflasjon', name: 'Beregne og tolke inflasjon og reallønn', observable: 'Regner reallønnsvekst og forklarer kjøpekraft.', group: 'makro', prerequisites: ['pst.andel'] },
  { id: 'konj.konsum', name: 'Forklare konsum, investering og konsumutjevning', observable: 'Forklarer marginal konsumtilbøyelighet og hvorfor investeringer svinger mest.', group: 'makro', prerequisites: [] },
  { id: 'konj.multiplikator', name: 'Beregne og tolke multiplikatoren', observable: 'Regner 1/(1 − c) og effekten på BNP og konsum.', group: 'makro', prerequisites: ['konj.konsum'] },
  { id: 'el.grunnbegreper', name: 'Regne med ladning, strøm, effekt og energi', observable: 'Bruker q = i·t, p = v·i og w = p·t med riktige prefikser og enheter.', group: 'elektro', prerequisites: [] },
  { id: 'el.fortegn', name: 'Bruke passiv fortegnskonvensjon', observable: 'Avgjør om et element leverer eller mottar effekt ut fra strømretning og polaritet.', group: 'elektro', prerequisites: ['el.grunnbegreper'] },
  { id: 'el.ohm', name: 'Bruke Ohms lov', observable: 'Finner strøm, spenning eller motstand med v = R·i.', group: 'elektro', prerequisites: [] },
  { id: 'el.kirchhoff', name: 'Bruke Kirchhoffs lover', observable: 'Setter opp KCL i noder og KVL rundt sløyfer med konsekvente fortegn.', group: 'elektro', prerequisites: ['el.ohm'] },
  { id: 'el.serieparallell', name: 'Finne ekvivalent motstand', observable: 'Slår sammen serie- og parallellkoblinger steg for steg.', group: 'elektro', prerequisites: ['el.ohm'] },
  { id: 'el.deling', name: 'Bruke spennings- og strømdeling', observable: 'Deler spenning i seriekobling og strøm i parallellkobling riktig, også med last.', group: 'elektro', prerequisites: ['el.serieparallell'] },
  { id: 'el.nodespenning', name: 'Bruke nodespenningsmetoden', observable: 'Velger referansenode, skriver strømmen ut av hver node og løser likningene.', group: 'elektro', prerequisites: ['el.kirchhoff'] },
  { id: 'el.thevenin', name: 'Finne Thevenin- og Norton-ekvivalenter', observable: 'Finner tomgangsspenning og motstand med nullstilte kilder, og tegner ekvivalenten.', group: 'elektro', prerequisites: ['el.serieparallell', 'el.nodespenning'] },
  { id: 'el.maksimaleffekt', name: 'Bruke maksimal effektoverføring', observable: 'Velger RL = RTh og beregner vTh²/(4RTh).', group: 'elektro', prerequisites: ['el.thevenin'] },
  { id: 'el.opamp', name: 'Analysere kretser med ideell operasjonsforsterker', observable: 'Bruker vn = vp og null inngangsstrøm, setter opp KCL og sjekker metning.', group: 'elektro', prerequisites: ['el.nodespenning'] },
  { id: 'el.kondspole', name: 'Regne med kondensatorer og spoler', observable: 'Kombinerer C og L og bruker i = C dv/dt, v = L di/dt og lagret energi.', group: 'elektro', prerequisites: [] },
  { id: 'el.transient', name: 'Analysere førsteordens RC- og RL-kretser', observable: 'Finner startverdi, sluttverdi og tidskonstant og setter opp x(t).', group: 'elektro', prerequisites: ['el.kondspole', 'el.thevenin'] },
  { id: 'el.visere', name: 'Regne med visere og impedans', observable: 'Skriver kilder som visere, bruker jωL og 1/(jωC) og går tilbake til tidsfunksjon.', group: 'elektro', prerequisites: ['el.serieparallell'] },
  { id: 'el.aceffekt', name: 'Beregne effekt i vekselstrømskretser', observable: 'Finner P, Q, S og effektfaktor med effektivverdier.', group: 'elektro', prerequisites: ['el.visere'] },
  { id: 'el.trefase', name: 'Regne med trefasesystemer', observable: 'Skiller linje- og fasestørrelser i stjerne og trekant.', group: 'elektro', prerequisites: ['el.aceffekt'] },
  { id: 'el.filter', name: 'Analysere førsteordens filtre', observable: 'Finner filtertype, maksimal forsterkning og knekkfrekvens.', group: 'elektro', prerequisites: ['el.deling', 'el.transient'] },
  { id: 'el.bode', name: 'Tegne Bode-diagram', observable: 'Tegner asymptoter med ±20 dB/dekade og kurven 3 dB under i knekkpunktet.', group: 'elektro', prerequisites: ['el.filter'] },
  { id: 'dig.tallsystem', name: 'Konvertere mellom tallsystemer', observable: 'Går mellom titalls-, binær- og heksadesimalsystemet og viser fremgangsmåten.', group: 'digital', prerequisites: [] },
  { id: 'dig.toerkomplement', name: 'Regne med toerkomplement', observable: 'Skriver negative tall med gitt antall bit og regner subtraksjon som addisjon.', group: 'digital', prerequisites: ['dig.tallsystem'] },
  { id: 'dig.boolsk', name: 'Forenkle med boolsk algebra', observable: 'Skriver uttrykket for en krets og forenkler med regler og De Morgan.', group: 'digital', prerequisites: [] },
  { id: 'dig.sannhetstabell', name: 'Lage sannhetstabell og SOP/POS', observable: 'Går fra en beskrivelse til sannhetstabell og mintermer.', group: 'digital', prerequisites: [] },
  { id: 'dig.karnaugh', name: 'Minimere med Karnaugh-diagram', observable: 'Plasserer mintermer i Gray-rekkefølge og grupperer så stort som mulig.', group: 'digital', prerequisites: ['dig.sannhetstabell'] },
  { id: 'dig.nand', name: 'Realisere med NAND eller NOR', observable: 'Gjør om SOP til NAND–NAND og tegner kretsen.', group: 'digital', prerequisites: ['dig.boolsk'] },
  { id: 'dig.kombinatorisk', name: 'Bruke multipleksere, dekodere og addere', observable: 'Bruker valgbiter og datainnganger for å realisere en funksjon.', group: 'digital', prerequisites: ['dig.sannhetstabell'] },
  { id: 'dig.vipper', name: 'Forstå vipper og klokkeflanker', observable: 'Beskriver D-, JK- og T-vipper og bruker dem til å lagre tilstand.', group: 'digital', prerequisites: [] },
  { id: 'dig.tilstand', name: 'Designe tilstandsmaskiner og tellere', observable: 'Lager tilstandsdiagram, tabell og uttrykk for D-inngangene og utgangene.', group: 'digital', prerequisites: ['dig.vipper', 'dig.karnaugh'] },
  { id: 'dig.verilog', name: 'Lese og rette enkel Verilog', observable: 'Bruker always @(posedge clk) med «<=» og assign for utganger.', group: 'digital', prerequisites: ['dig.tilstand'] },
  ...ORG_SKILLS,
];

export const SKILL_MAP: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function skillName(id: string): string {
  return SKILL_MAP[id]?.name ?? id;
}

export const BASIC_SKILLS = SKILLS.filter((s) => s.group === 'grunnlag').map((s) => s.id);
