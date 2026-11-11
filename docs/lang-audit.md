# Dil yerleşim denetimi (masaüstü 1280x720)

Otomatik: `node tools/lang-audit.mjs`. Sayılar: İngilizcede olmayan, o dilin eklediği taşma/kırpılma sayısı (kutuya sığmayan metin, üst kutu tarafından kesilen öğe, ekran dışı). İngilizcenin kendi sayıları tasarım tabanı olarak ayrı satırdadır. Ekran görüntüleri `art/shots/langs/` (git dışı).

| Dil | home | lobby | match | forge-window | farm-window | kingdom-panel | oracle-deck | guide | settings |
|---|---|---|---|---|---|---|---|---|---|
| en (taban) | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 |
| tr | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |
| zh-CN | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| zh-TW | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| ru | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 0 | 0 |
| es-ES | 0 | 0 | 0 | 1 | 0 | 3 | 1 | 0 | 0 |
| es-419 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |
| pt-BR | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 0 | 0 |
| de | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| fr | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| ja | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 |
| ko | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pl | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| it | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 0 | 0 |
| uk | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Ayrıntı (dilin eklediği)

### tr · kingdom-panel
- clipped: `p.kd-card-line` "Taşlar konuşur: herkesin krallığını ve destesini b" kutu 198x34 içerik 198x48

### tr · oracle-deck
- clipped: `p.kd-card-line` "Taşlar konuşur: herkesin krallığını ve destesini b" kutu 198x34 içerik 198x48

### zh-CN · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,706,543,726

### zh-TW · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,706,543,726

### ru · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,705,543,725

### ru · kingdom-panel
- clipped: `p.kd-card-line` "Тени маршируют, но они не настоящие. Соперники при" kutu 198x34 içerik 198x65

### ru · oracle-deck
- clipped: `p.kd-card-line` "Тени маршируют, но они не настоящие. Соперники при" kutu 198x34 içerik 198x65

### es-ES · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,773,543,793

### es-ES · kingdom-panel
- clipped: `p.kd-card-line` "Las piedras hablan: conoces el reino y el mazo de " kutu 183x34 içerik 183x48
- cut by div.kingdom-panel.paper: `div.kd-oracle` "Bot Morado · Los IntrigantesMazo: Arquero, Lancero" konum 46,601,319,721
- offscreen: `div.kd-oracle` "Bot Morado · Los IntrigantesMazo: Arquero, Lancero" konum 46,601,319,721

### es-ES · oracle-deck
- clipped: `p.kd-card-line` "Las piedras hablan: conoces el reino y el mazo de " kutu 198x34 içerik 198x48

### es-419 · kingdom-panel
- clipped: `p.kd-card-line` "Las sombras marchan, pero no son reales. Los rival" kutu 198x32 içerik 198x48

### es-419 · oracle-deck
- clipped: `p.kd-card-line` "Las sombras marchan, pero no son reales. Los rival" kutu 198x32 içerik 198x48

### pt-BR · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,791,543,811

### pt-BR · kingdom-panel
- clipped: `p.kd-card-line` "Tudo tem um preço: a lealdade de um soldado, a esp" kutu 198x32 içerik 198x48

### pt-BR · oracle-deck
- clipped: `p.kd-card-line` "Tudo tem um preço: a lealdade de um soldado, a esp" kutu 198x32 içerik 198x48

### de · forge-window
- cut by div.win-body: `span.up-line` "Ausbauen +50 % Waffengeschwindigkeit" konum 482,394,754,432
- cut by div.win-body: `span.cost` "10" konum 507,722,543,742

### fr · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,810,543,830

### ja · kingdom-panel
- clipped: `p.kd-card-line` "石が語ります。全員の王国とデッキがわかり、からくりも見抜けます。" kutu 198x34 içerik 198x48

### ja · oracle-deck
- clipped: `p.kd-card-line` "石が語ります。全員の王国とデッキがわかり、からくりも見抜けます。" kutu 198x34 içerik 198x48

### it · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,752,543,772

### it · kingdom-panel
- clipped: `p.kd-card-line` "Le ombre marciano, ma non sono reali. I rivali ti " kutu 198x34 içerik 198x48

### it · oracle-deck
- clipped: `p.kd-card-line` "Le ombre marciano, ma non sono reali. I rivali ti " kutu 198x34 içerik 198x48
