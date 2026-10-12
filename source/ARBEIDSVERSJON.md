# Arbeidsversjon (ikke publisert)

Dette er kildekoden slik den står midt i ombyggingen etter publisert versjon 6.
Den typesjekker, alle 61 tester går gjennom, og `npm run build:root` bygger og kopierer
appen til roten. Den er testet i nettleseren (desktop og mobil) og ligger på GitHub Pages
fra grenen `arbeidsversjon`.

## Gjort i denne versjonen
- Hjem er en rangert eksamensplan (temaene som kommer oftest, først) i stedet for en sti. Uglen er fjernet; roboten Bolt er standard.
- Lær er skrevet om: «Tilbake» husker svarene, kalkulatorkortet følger kalkulatoren du har valgt, poeng bare for innsats (ikke for å bla), quizpoeng bare når du slår din beste.
- Kalkulatoren: regner med full presisjon etter mellomsvar, forstår π, 1e-7 og 2(3+4), prøver å bytte rekkefølge før minnet brukes, og viser «regn i biter» når én tastesekvens ikke holder.
- Svarkontrollen godtar «1 580», «Svar: 1580 kr per døgn», «ca. 1580», «1580,-», utregninger med navn foran (konsum = 230·6 + 200 = 1580) og flere svar uten navn. Avrunding godtar ikke lenger 0 eller 1 for 0,5.
- Læreren gir ikke fasit før levering; kommer svaret likevel fram i chatten, teller deloppgaven som løst med hjelp. «Så løsningen» gjelder per deloppgave.
- Prøveeksamen: egenkontroll-delen tas ut, tekstsvar uten AI vises som «ikke vurdert», levering kan ikke skje to ganger, og det som er skrevet lagres før levering.
- Data: poeng og fremgang slås sammen mellom enheter, utboksen er per bruker, rester etter slettede dokumenter ryddes ved oppstart.

## Gjort 12. oktober 2026
- Svarkontroll: F og c godtas som navn på faste og variable kostnader; feil verdi gir nå «feil», ikke «mangler».
- Egne forklaringer på typiske feil i gjennomsnittskostnad og grensekostnad.
- Lær i regnetemaer har «Prøv selv» og regnequiz (før var leksjonen bare lesing).
- «Slett historikk» nullstiller fremgangen helt; sletting av ny dokumentversjon gjenoppretter forrige.
- Innstillinger har knapper for opprydding og for å laste opp lokale data.
- Tren: «Fortsett der du slapp» øverst, «Start med 3 oppgaver», egen økt er sammenfoldet.
- Arkiv foreslår hvilket eksamenssett en sensorveiledning hører til.

## Ikke ferdig
- Mørk modus er ikke gjennomtestet.
- Publisering som ny hovedversjon (master) er ikke gjort.
