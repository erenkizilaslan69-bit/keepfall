# Dil yerleşim denetimi (masaüstü 1280x720)

Otomatik: `node tools/lang-audit.mjs`. Sayılar: İngilizcede olmayan, o dilin eklediği taşma/kırpılma sayısı (kutuya sığmayan metin, üst kutu tarafından kesilen öğe, ekran dışı). İngilizcenin kendi sayıları tasarım tabanı olarak ayrı satırdadır. Ekran görüntüleri `art/shots/langs/` (git dışı).

| Dil | home | lobby | match | forge-window | castle-soldiers | castle-hire | castle-growth | castle-defense | farm-window | kingdom-panel | oracle-deck | guide | settings |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en (taban) | 1 | 0 | 0 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| tr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh-CN | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh-TW | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ru | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| es-ES | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |
| es-419 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |
| pt-BR | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |
| de | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |
| fr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |
| ja | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ko | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pl | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| it | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |
| uk | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |

## Ayrıntı (dilin eklediği)

### ru · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,776,543,796

### es-ES · kingdom-panel
- clipped: `p.kd-card-line` "Todo tiene un precio: la lealtad de un soldado, la" kutu 198x32 içerik 198x48

### es-ES · oracle-deck
- clipped: `p.kd-card-line` "Todo tiene un precio: la lealtad de un soldado, la" kutu 198x32 içerik 198x48

### es-419 · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,703,543,723

### es-419 · kingdom-panel
- clipped: `p.kd-card-line` "Las piedras hablan: conoces el reino y el mazo de " kutu 198x34 içerik 198x48

### es-419 · oracle-deck
- clipped: `p.kd-card-line` "Las piedras hablan: conoces el reino y el mazo de " kutu 198x34 içerik 198x48

### pt-BR · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,721,543,741

### pt-BR · kingdom-panel
- clipped: `p.kd-card-line` "Tudo tem um preço: a lealdade de um soldado, a esp" kutu 198x32 içerik 198x48

### pt-BR · oracle-deck
- clipped: `p.kd-card-line` "Tudo tem um preço: a lealdade de um soldado, a esp" kutu 198x32 içerik 198x48

### de · forge-window
- cut by div.win-body: `span.up-line` "Ausbauen +50 % Waffengeschwindigkeit" konum 482,394,754,432

### de · kingdom-panel
- clipped: `p.kd-card-line` "Die Steine sprechen: Du kennst das Königreich und " kutu 183x32 içerik 183x65

### de · oracle-deck
- clipped: `p.kd-card-line` "Die Steine sprechen: Du kennst das Königreich und " kutu 198x32 içerik 198x65

### fr · kingdom-panel
- clipped: `p.kd-card-line` "Les ombres marchent, mais elles ne sont pas réelle" kutu 198x32 içerik 198x48

### fr · oracle-deck
- clipped: `p.kd-card-line` "Les ombres marchent, mais elles ne sont pas réelle" kutu 198x32 içerik 198x48

### ja · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,743,543,763

### it · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,752,543,772

### it · kingdom-panel
- clipped: `p.kd-card-line` "Le pietre parlano: conosci il regno e il mazzo di " kutu 198x34 içerik 198x48

### it · oracle-deck
- clipped: `p.kd-card-line` "Le pietre parlano: conosci il regno e il mazzo di " kutu 198x34 içerik 198x48

### uk · kingdom-panel
- clipped: `p.kd-card-line` "Тіні марширують, але вони не справжні. Суперники в" kutu 198x34 içerik 198x48

### uk · oracle-deck
- clipped: `p.kd-card-line` "Тіні марширують, але вони не справжні. Суперники в" kutu 198x34 içerik 198x48
