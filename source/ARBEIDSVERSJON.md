# Arbeidsversjon (ikke publisert)

Dette er kildekoden slik den står midt i ombyggingen etter publisert versjon 6.
Den typesjekker, alle 54 tester går gjennom, og `npm run build` lager en fungerende
bygg. Den er **ikke testet i nettleseren ennå** og er ikke publisert.

## Gjort i denne versjonen
- Hjem er en rangert eksamensplan (temaene som kommer oftest, først) i stedet for en sti. Uglen er fjernet; roboten Bolt er standard.
- Lær er skrevet om: «Tilbake» husker svarene, kalkulatorkortet følger kalkulatoren du har valgt, poeng bare for innsats (ikke for å bla), quizpoeng bare når du slår din beste.
- Kalkulatoren: regner med full presisjon etter mellomsvar, forstår π, 1e-7 og 2(3+4), prøver å bytte rekkefølge før minnet brukes, og viser «regn i biter» når én tastesekvens ikke holder.
- Svarkontrollen godtar «1 580», «Svar: 1580 kr per døgn», «ca. 1580», «1580,-», utregninger med navn foran (konsum = 230·6 + 200 = 1580) og flere svar uten navn. Avrunding godtar ikke lenger 0 eller 1 for 0,5.
- Læreren gir ikke fasit før levering; kommer svaret likevel fram i chatten, teller deloppgaven som løst med hjelp. «Så løsningen» gjelder per deloppgave.
- Prøveeksamen: egenkontroll-delen tas ut, tekstsvar uten AI vises som «ikke vurdert», levering kan ikke skje to ganger, og det som er skrevet lagres før levering.
- Data: poeng og fremgang slås sammen mellom enheter, utboksen er per bruker, rester etter slettede dokumenter ryddes ved oppstart.

## Ikke ferdig
- Knapper i Innstillinger for opprydding og for å laste opp data lagret bare i nettleseren (funksjonene finnes, knappene ikke).
- Gjenoppretting av forrige versjon når en ny dokumentversjon slettes, og full nullstilling av fremgang ved «Slett historikk».
- Funksjonsstatus-siden og README er ikke oppdatert.
- Nettlesertest (desktop, mobil, mørk modus) og publisering.
