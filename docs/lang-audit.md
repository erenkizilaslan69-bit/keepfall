# Dil yerleşim denetimi (masaüstü 1280x720)

Otomatik: `node tools/lang-audit.mjs`. Sayılar: İngilizcede olmayan, o dilin eklediği taşma/kırpılma sayısı (kutuya sığmayan metin, üst kutu tarafından kesilen öğe, ekran dışı). İngilizcenin kendi sayıları tasarım tabanı olarak ayrı satırdadır. Ekran görüntüleri `art/shots/langs/` (git dışı).

| Dil | home | lobby | match | forge-window | castle-soldiers | castle-hire | castle-growth | castle-defense | farm-window | kingdom-panel | oracle-deck | guide | settings | plural |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en (taban) | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| tr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh-CN | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh-TW | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ru | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| es-ES | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| es-419 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pt-BR | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| de | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| fr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ja | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ko | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pl | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| it | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 0 |
| uk | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Ayrıntı (dilin eklediği)

### de · forge-window
- cut by div.win-body: `span.up-line` "Ausbauen +50 % Waffengeschwindigkeit" konum 482,402,754,440

### it · kingdom-panel
- cut by div.kingdom-panel.paper: `div.kd-oracle` "Bot Viola · Gli IntrigantiMazzo: Arciere, Spadacci" konum 46,618,319,738
- offscreen: `div.kd-oracle` "Bot Viola · Gli IntrigantiMazzo: Arciere, Spadacci" konum 46,618,319,738
- cut by div.kingdom-panel.paper: `span` "La tua probabilità di vincere (con i soldati a cas" konum 46,675,315,730
- offscreen: `span` "La tua probabilità di vincere (con i soldati a cas" konum 46,675,315,730
- cut by div.kingdom-panel.paper: `b` "serve un rapporto di un esploratore" konum 46,693,315,730
- offscreen: `b` "serve un rapporto di un esploratore" konum 46,693,315,730
