# Dil yerleşim denetimi (masaüstü 1280x720)

Otomatik: `node tools/lang-audit.mjs`. Sayılar: İngilizcede olmayan, o dilin eklediği taşma/kırpılma sayısı (kutuya sığmayan metin, üst kutu tarafından kesilen öğe, ekran dışı). İngilizcenin kendi sayıları tasarım tabanı olarak ayrı satırdadır. Ekran görüntüleri `art/shots/langs/` (git dışı).

| Dil | home | lobby | match | forge-window | farm-window | kingdom-panel | guide | settings |
|---|---|---|---|---|---|---|---|---|
| en (taban) | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 |
| de | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| ru | 0 | 0 | 0 | 1 | 0 | 10 | 0 | 0 |
| zh-CN | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ja | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Ayrıntı (dilin eklediği)

### de · forge-window
- cut by div.win-body: `span.up-line` "Ausbauen +50 % Waffengeschwindigkeit" konum 482,394,754,432
- cut by div.win-body: `span.cost` "10" konum 507,793,543,813

### ru · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,776,543,796

### ru · kingdom-panel
- cut by div.kingdom-panel.paper: `span` "Лучник" konum 42,729,88,748
- offscreen: `span` "Лучник" konum 42,729,88,748
- cut by div.kingdom-panel.paper: `span` "Щитоносец" konum 42,763,117,782
- offscreen: `span` "Щитоносец" konum 42,763,117,782
- cut by div.kingdom-panel.paper: `span` "Монах" konum 42,797,82,816
- offscreen: `span` "Монах" konum 42,797,82,816
- cut by div.kingdom-panel.paper: `span` "Катапульта" konum 42,831,118,850
- offscreen: `span` "Катапульта" konum 42,831,118,850
- cut by div.kingdom-panel.paper: `button.btn` "Задать донесение" konum 42,860,195,896
- offscreen: `button.btn` "Задать донесение" konum 42,860,195,896
