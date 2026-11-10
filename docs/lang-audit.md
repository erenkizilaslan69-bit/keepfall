# Dil yerleşim denetimi (masaüstü 1280x720)

Otomatik: `node tools/lang-audit.mjs`. Sayılar: İngilizcede olmayan, o dilin eklediği taşma/kırpılma sayısı (kutuya sığmayan metin, üst kutu tarafından kesilen öğe, ekran dışı). İngilizcenin kendi sayıları tasarım tabanı olarak ayrı satırdadır. Ekran görüntüleri `art/shots/langs/` (git dışı).

| Dil | home | lobby | match | forge-window | farm-window | kingdom-panel | guide | settings |
|---|---|---|---|---|---|---|---|---|
| en (taban) | 0 | 0 | 0 | 10 | 0 | 7 | 0 | 0 |
| tr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh-CN | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 |
| zh-TW | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ru | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| es-ES | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 |
| es-419 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pt-BR | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| de | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| fr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ja | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ko | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pl | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 |
| it | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 |
| uk | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Ayrıntı (dilin eklediği)

### zh-CN · kingdom-panel
- cut by div.kingdom-panel.paper: `button.btn` "设置报告" konum 42,789,136,825
- offscreen: `button.btn` "设置报告" konum 42,789,136,825

### es-ES · kingdom-panel
- cut by div.kingdom-panel.paper: `button.btn` "Fijar informe" konum 42,825,173,861
- offscreen: `button.btn` "Fijar informe" konum 42,825,173,861

### de · forge-window
- cut by div.win-body: `span.up-line` "Ausbauen +50 % Waffengeschwindigkeit" konum 482,394,754,432

### pl · kingdom-panel
- cut by div.kingdom-panel.paper: `button.btn` "Ustaw raport" konum 42,825,182,861
- offscreen: `button.btn` "Ustaw raport" konum 42,825,182,861

### it · kingdom-panel
- cut by div.kingdom-panel.paper: `button.btn` "Imposta rapporto" konum 42,843,214,879
- offscreen: `button.btn` "Imposta rapporto" konum 42,843,214,879
