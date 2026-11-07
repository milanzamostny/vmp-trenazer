# Plán pro Claude Code: VMP trenažér s plnou oficiální sadou otázek

Cíl: offline webová aplikace (PWA, funguje na mobilu i bez signálu), ve které jsou **všechny oficiální otázky SPS** (M/M20: 411, S/S20: ~170, C: 215) včetně obrázků značek. Ke každé otázce bude vysvětlení, testy budou ve stejném formátu jako u SPS a chyby se budou opakovat systémem kartiček.

Zdroj otázek: **soubor stažený ze SPS, který už máš uložený ve složce projektu.** Claude Code nic ze sítě stahovat nemusí, otázky načte z lokálního souboru.

---

## 0. Příprava (5 min)

Struktura projektu:
```
vmp-trenazer/
└── zdroj/                   ← SEM dej stažené soubory SPS
    ├── otazky-M.html        ← povinné (M / M20, 411 otázek)
    ├── otazky-S.html        ← volitelné (plachetnice)
    ├── otazky-C.html        ← volitelné (moře)
    └── otazky-M_files/      ← obrázky, pokud jsi uložil „celou stránku“
```

```bash
mkdir -p vmp-trenazer/zdroj
# zkopíruj stažený soubor do vmp-trenazer/zdroj/ (název může být libovolný .html / .htm)
cd vmp-trenazer && git init && claude
```

Jiná složka nebo jiný název? Stačí v promptu na konci změnit řádek `ZDROJ = ./zdroj`.

Pak do Claude Code vlož **prompt z konce tohoto souboru**. Kroky 1–6 níže popisují, co Claude Code udělá a co máš kontrolovat.

---

## 1. Načtení otázek z lokálního souboru

Claude Code napíše skript `scripts/parse-sps.ts`, který projde všechny `.html`/`.htm` soubory ve složce `ZDROJ` a z každého vytáhne otázky.

Na co si má dát pozor:
- **Zjistit, která sada to je.** Podle nadpisu stránky („Soubory otázek pro způsobilost …“) a podle zkratek sad rozpozná M / S / C. Ověří i počty (M = 411, S ≈ 170, C = 215). Pokud v souboru najde „Vůdce plavidla EU“ (zkratky A1EU/B1EU, otázky o Hamburgu), **zastaví se a řekne ti to**: je to jiná zkouška a soubor by bylo potřeba stáhnout znovu.
- **Kódování.** Uložená stránka je nejspíš ve `windows-1250`. Skript ho rozpozná z `<meta charset>` a převede do UTF-8, aby nevznikly rozsypané znaky (ř, ů…).
- **Správná odpověď je na stránce vždy jako a)** (označená „Správná odpověď“). Uloží se jako `correct` a aplikace pak možnosti náhodně zamíchá.
- **Obrázky.** Pokud vedle HTML existuje složka `*_files`, zkopíruje obrázky do `public/img/`. Pokud ne (uloženo „jen HTML“), stáhne je z `http://www.spspraha.cz/zkousky/images/…` (na tvém PC má internet), anebo vypíše seznam otázek s chybějícím obrázkem.
- **Kontrola úplnosti.** Každá otázka má mít text a přesně 3 odpovědi, čísla v sadě bez děr. Skript vypíše počty podle sad a 5 ukázek, než se pokračuje.

Výstup: `data/m.json` (případně `s.json`, `c.json`) ve tvaru
```json
{ "id": "M-A1-053", "set": "A1 2015", "num": 53, "topic": "Plavební provoz",
  "q": "…", "correct": "…", "wrong": ["…","…"], "img": "img/ii1c.jpg" }
```
Když SPS sadu někdy změní, stáhneš nový soubor do `zdroj/` a spustíš `npm run parse`.

## 2. Vysvětlení ke každé otázce

- Claude Code vygeneruje `explain` (2–4 věty, česky) po dávkách zhruba 25 otázek. U každého vysvětlení uvede, **o jaký předpis se opírá** (vyhláška č. 67/2015 Sb., o pravidlech plavebního provozu; zákon č. 114/1995 Sb., o vnitrozemské plavbě; u první pomoci aktuální doporučení ERC).
- Ke každému vysvětlení přidá pole `confidence: "high" | "check"`. Otázky s hodnotou `check` si projdeš ručně (v aplikaci budou mít štítek).
- U chytáků vysvětlit, **proč jsou špatné možnosti špatně** (např. „380° neexistuje“, „noc není snížená viditelnost“).
- Navíc vytvořit `mnemo` (pomůcku), kde to dává smysl: 50–10–3 m pro plavce, ¼–1–4 s pro zvuky, 225/112,5/135° pro světla.

## 3. Aplikace

Stack: **Vite + TypeScript, bez frameworku** (nebo Preact), PWA (`vite-plugin-pwa`), data v JSON a postup v `localStorage`/IndexedDB.

Obrazovky:
1. **Přehled**: formát zkoušky, tahák s čísly a statistika podle okruhů (kde máš nejvíc chyb).
2. **Procvičování**: výběr kategorie (M / S / C) a okruhu. Po odpovědi hned správně/špatně a vysvětlení.
3. **Test nanečisto**: přesný formát SPS (počet otázek, časomíra, hranice). Během testu bez nápovědy, na konci rozbor všech chyb.
4. **Chyby / kartičky**: Leitnerův systém s 5 přihrádkami. Špatná odpověď vrací otázku do přihrádky 1, otázka je „naučená“ až v přihrádce 5.
5. **Prohlížení sady**: všechny otázky se správnou odpovědí a fulltextové hledání.
6. **„Projeď všechno“**: systematicky projde všech 411 otázek, aby tě u zkoušky nepřekvapila žádná, kterou jsi nikdy neviděl(a).

Detaily: tmavý režim, velká tlačítka pro mobil, ovládání klávesami A/B/C a Enter na počítači, export a import postupu (JSON) pro přenos mezi zařízeními.

### Cílová zařízení: PC, iPad a mobil
- **Responzivní layout**: mobil v jednom sloupci; iPad a PC (≥ 820 px) se širším obsahem, na PC volitelně otázka vlevo a vysvětlení vpravo. Velké dotykové plochy (min. 44 px) kvůli iPadu.
- **PC**: klávesy A/B/C nebo 1/2/3 pro odpověď, Enter/→ další, ← zpět, efekty při najetí myší.
- **iPad (Safari)**: PWA s `apple-touch-icon`, `apple-mobile-web-app-capable` a manifestem, instaluje se přes Sdílet → Přidat na plochu. Pozor: Safari maže data webu, který se 7 dní nepoužil. Aplikace nainstalovaná na plochu tohle omezení nemá, proto v aplikaci k instalaci vybízet. Otestovat na šířce na výšku i na šířku a se Split View.
- **Synchronizace postupu**: minimálně export a import kódu nebo souboru JSON. Volitelně synchronizace přes soukromý GitHub Gist nebo Supabase, aby šlo procvičovat střídavě na PC a iPadu.
- Testovat v Chrome/Edge (PC), Safari (iPad) a Playwrightem s emulací iPadu.

## 4. Testy a kontrola dat

- Unit testy (Vitest): parser nad uloženým souborem v `zdroj/` (počty otázek, každá otázka má 1 správnou a 2 špatné odpovědi, obrázky existují), skládání testu (správný počet, žádné duplikáty), vyhodnocení (hranice 30/35 atd.) a Leitner.
- Skript `scripts/validate.ts` zkontroluje, že ke každé otázce existuje vysvětlení a žádné vysvětlení netvrdí jinou správnou odpověď než SPS. Tuhle kontrolu nech Claude Code udělat **samostatným průchodem** (nový subagent, který vysvětlení nepsal).

## 5. Nasazení

- GitHub Pages (`gh repo create vmp-trenazer --public`, akce pro build), případně Netlify nebo Cloudflare Pages.
- Na mobilu „Přidat na plochu“ a pak to funguje offline jako aplikace.

## 6. Pořadí práce a odhad

| Krok | Co | Odhad |
|---|---|---|
| 1 | Parser lokálního souboru + JSON + obrázky + kontrola | 20–30 min |
| 2 | Vysvětlení (dávky) + tvoje kontrola `check` položek | 1–2 h (většinu udělá Claude) |
| 3 | UI: procvičování, test, chyby | 45 min |
| 4 | Leitner, statistiky, PWA | 30 min |
| 5 | Testy + nasazení | 20 min |

---

## Prompt pro Claude Code (zkopíruj celý)

```
Postav mi offline PWA trenažér na teoretickou zkoušku Vůdce malého plavidla (Státní plavební správa ČR).

ZDROJ = ./zdroj

1) Oficiální soubor otázek SPS už mám stažený jako HTML ve složce ZDROJ (výše) – nic ze SPS nestahuj
   kromě případných chybějících obrázků. Napiš scripts/parse-sps.ts (npm run parse), který:
   - načte všechny .html/.htm soubory v ZDROJ, rozpozná kódování (pravděpodobně windows-1250) a převede do UTF-8,
   - podle nadpisu a zkratek sad určí, zda jde o M/M20 (čekám 411 otázek), S/S20 (~170) nebo C (215);
     pokud je to sada "Vůdce plavidla EU" (A1EU/B1EU…), ZASTAV a řekni mi to – je to špatný soubor,
   - u každé otázky vezme text, 3 odpovědi a správnou (na stránce vždy a), označená "Správná odpověď"),
   - obrázky zkopíruje z přiložené složky *_files do public/img; pokud chybí, zkusí je stáhnout
     z http://www.spspraha.cz/zkousky/images/<název>, jinak je vypíše jako chybějící,
   - zapíše data/{m,s,c}.json: id, set, num, topic, q, correct, wrong[2], img,
   - zkontroluje úplnost (3 odpovědi, souvislá čísla, žádné prázdné texty).
   Nejdřív mi ukaž počty podle sad a 5 ukázkových otázek, a teprve po mém potvrzení pokračuj.

2) Ke každé otázce vygeneruj v dávkách po ~25 pole "explain" (2–4 věty česky: proč je správná
   odpověď správně a proč jsou chytáky špatně, s odkazem na vyhlášku 67/2015 Sb. nebo zákon 114/1995 Sb.,
   u první pomoci na doporučení ERC), volitelně "mnemo" a "confidence": "high" nebo "check".
   Nikdy neměň správnou odpověď ze SPS. Pak samostatným subagentem zkontroluj, že žádné
   vysvětlení neodporuje správné odpovědi, a vypiš mi seznam položek "check".

3) Aplikace: Vite + TypeScript (bez těžkého frameworku), vite-plugin-pwa, česky, mobile-first, tmavý režim.
   Obrazovky: Přehled (formát zkoušek M 35/30 min/≥30, S 14/10/≥11, C 28/25/≥24 + tahák čísel +
   statistika po okruzích), Procvičování (výběr sady a okruhu, okamžitá zpětná vazba s vysvětlením),
   Test nanečisto (přesný formát SPS, časomíra, bez nápovědy, na konci rozbor chyb),
   Chyby (Leitner 5 přihrádek), Prohlížení se hledáním, režim "projeď všechny otázky".
   Možnosti odpovědí náhodně míchej. Postup ukládej do localStorage + export/import JSON.
   Musí běžet na PC, iPadu i mobilu: responzivní layout (iPad na výšku i na šířku), klávesy
   A/B/C/1/2/3/Enter/šipky na PC, instalovatelná PWA i na iPadu (apple-touch-icon, manifest,
   výzva "Přidat na plochu" kvůli 7denní mazací politice Safari). Ověř Playwrightem s emulací iPadu a desktopu.

4) Vitest testy pro parser, skládání testu, vyhodnocení a Leitner. npm run build musí projít.

5) Připrav nasazení na GitHub Pages (workflow), ale push udělej až po mém potvrzení.

Pracuj po krocích, po každém kroku krátce shrň a ukaž, co mám zkontrolovat.
```
