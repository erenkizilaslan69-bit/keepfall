# Dil yerleşim denetimi (masaüstü 1280x720)

Otomatik: `node tools/lang-audit.mjs`. Sayılar: İngilizcede olmayan, o dilin eklediği taşma/kırpılma sayısı (kutuya sığmayan metin, üst kutu tarafından kesilen öğe, ekran dışı). İngilizcenin kendi sayıları tasarım tabanı olarak ayrı satırdadır. Ekran görüntüleri `art/shots/langs/` (git dışı).

| Dil | home | lobby | match | forge-window | castle-soldiers | castle-hire | castle-growth | castle-defense | farm-window | kingdom-panel | oracle-deck | guide | settings | plural |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en (taban) | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| tr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh-CN | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh-TW | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ru | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| es-ES | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| es-419 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| pt-BR | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| de | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| fr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ja | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ko | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pl | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| it | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| uk | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Ayrıntı (dilin eklediği)

### zh-CN · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,706,543,726

### es-ES · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,773,543,793

### es-419 · kingdom-panel
- cut by div.kingdom-panel.paper: `div.kd-oracle` "Bot Morado · Reino de las SombrasMazo: Arquero, Es" konum 46,601,319,721
- offscreen: `div.kd-oracle` "Bot Morado · Reino de las SombrasMazo: Arquero, Es" konum 46,601,319,721

### pt-BR · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,721,543,741

### de · forge-window
- cut by div.win-body: `span.up-line` "Ausbauen +50 % Waffengeschwindigkeit" konum 482,394,754,432
- cut by div.win-body: `span.cost` "10" konum 507,722,543,742

### ja · lobby
- offscreen: `label.field` "あなたの名前" konum 124,746,305,810
- offscreen: `label.check` "空き枠をボットで埋める" konum 503,743,705,764
- offscreen: `span.kf-select-text` "かんたん" konum 514,781,578,803
- offscreen: `button#ready.btn` "準備完了" konum 315,732,365,810
- offscreen: `button#leave.btn` "ルームを出る" konum 375,696,434,810
- offscreen: `button#start.btn.btn-red` "マッチ開始" konum 444,714,493,810
- offscreen: `p#start-hint.muted.small` "1人のプレイヤーを待っています…" konum 827,789,1140,810

### pl · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,752,543,772

### it · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,681,543,701
