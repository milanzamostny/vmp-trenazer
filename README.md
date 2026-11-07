# VMP trenažér

Offline PWA trenažér na teoretickou zkoušku **Vůdce malého plavidla** (Státní plavební správa ČR) s oficiální sadou otázek M 2015 (407 otázek, 162 obrázků).

## Spuštění

```bash
npm install
npm run dev        # vývojový server na http://localhost:5173
npm run build      # produkční build do dist/ (PWA, funguje offline)
npm run preview    # náhled buildu
```

## Data

| Co | Kde | Jak vzniká |
|---|---|---|
| Otázky ze SPS | `data/m.json` (+ `s.json`, `c.json`) | `npm run parse` z HTML ve `zdroj/` |
| Obrázky | `public/img/` | `npm run parse` (kopie ze složky `*_files`) |
| **Vysvětlení** | `data/explain/m-*.json` | ručně / Claude – **tady se upravují** |

Aplikace si otázky a vysvětlení spojí sama (Vite plugin v `vite.config.ts`), žádný mezikrok není potřeba.

### Úprava vysvětlení

1. Najdi otázku v `data/explain/` – soubory jsou podle rozsahu čísel (`m-170-226.json` = otázky 170–226), klíč je `M-<číslo>`.
2. Uprav pole:
   - `explain` – text vysvětlení (povinné),
   - `mnemo` – pomůcka (volitelné, smaž klíč, pokud ji nechceš),
   - `ref` – předpis,
   - `confidence` – `"high"`, nebo `"check"` (v aplikaci se zobrazí štítek „k ověření“).
3. Při běžícím `npm run dev` se stránka po uložení sama obnoví s novým textem.
4. `npm run check-data` ověří, že každá otázka má vysvětlení a JSON je platný (build bez toho neprojde).

Postup uživatelů (`localStorage`) je vázaný na `id` otázky, takže změna vysvětlení postup nesmaže.

## Aktualizace otázek ze SPS

Stáhni novou stránku ze SPS do `zdroj/` a spusť `npm run parse`. Pak `npm run check-data` ukáže otázky bez vysvětlení.
