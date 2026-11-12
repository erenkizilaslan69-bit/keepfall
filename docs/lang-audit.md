# Dil yerleşim denetimi (masaüstü 1280x720)

Otomatik: `node tools/lang-audit.mjs`. Sayılar: İngilizcede olmayan, o dilin eklediği taşma/kırpılma sayısı (kutuya sığmayan metin, üst kutu tarafından kesilen öğe, ekran dışı). İngilizcenin kendi sayıları tasarım tabanı olarak ayrı satırdadır. Ekran görüntüleri `art/shots/langs/` (git dışı).

| Dil | home | lobby | match | forge-window | castle-soldiers | castle-hire | castle-growth | castle-defense | farm-window | kingdom-panel | oracle-deck | guide | settings | plural |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en (taban) | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| tr | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh-CN | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh-TW | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ru | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| es-ES | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| es-419 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| pt-BR | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| de | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| fr | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 3 | 1 | 0 | 0 | 0 |
| ja | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ko | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| pl | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| it | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| uk | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |

## Ayrıntı (dilin eklediği)

### tr · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,718,543,738

### zh-CN · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,706,543,726

### zh-TW · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,706,543,726

### ru · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,705,543,725

### es-ES · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,703,543,723

### es-ES · kingdom-panel
- clipped: `p.kd-card-line` "Las piedras hablan: conoces el reino y el mazo de " kutu 198x34 içerik 198x48

### es-ES · oracle-deck
- clipped: `p.kd-card-line` "Las piedras hablan: conoces el reino y el mazo de " kutu 198x34 içerik 198x48

### es-419 · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,773,543,793

### es-419 · kingdom-panel
- clipped: `p.kd-card-line` "Todo tiene un precio: la lealtad de un soldado, la" kutu 198x32 içerik 198x48

### es-419 · oracle-deck
- clipped: `p.kd-card-line` "Todo tiene un precio: la lealtad de un soldado, la" kutu 198x32 içerik 198x48

### pt-BR · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,721,543,741

### pt-BR · kingdom-panel
- clipped: `p.kd-card-line` "Tudo tem um preço: a lealdade de um soldado, a esp" kutu 198x32 içerik 198x48

### pt-BR · oracle-deck
- clipped: `p.kd-card-line` "Tudo tem um preço: a lealdade de um soldado, a esp" kutu 198x32 içerik 198x48

### de · forge-window
- cut by div.win-body: `span.up-line` "Ausbauen +50 % Waffengeschwindigkeit" konum 482,394,754,432

### de · kingdom-panel
- clipped: `p.kd-card-line` "Alles hat seinen Preis: die Treue eines Soldaten, " kutu 198x34 içerik 198x48

### de · oracle-deck
- clipped: `p.kd-card-line` "Alles hat seinen Preis: die Treue eines Soldaten, " kutu 198x34 içerik 198x48

### fr · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,829,543,849

### fr · kingdom-panel
- clipped: `p.kd-card-line` "Les pierres parlent : tu connais le royaume et le " kutu 183x34 içerik 183x65
- cut by div.kingdom-panel.paper: `div.kd-oracle` "Bot Violet · Les IntrigantsDeck : Archer, Porte-bo" konum 46,601,319,721
- offscreen: `div.kd-oracle` "Bot Violet · Les IntrigantsDeck : Archer, Porte-bo" konum 46,601,319,721

### fr · oracle-deck
- clipped: `p.kd-card-line` "Les pierres parlent : tu connais le royaume et le " kutu 198x34 içerik 198x48

### ko · kingdom-panel
- clipped: `p.kd-card-line` "그림자는 행군하지만 실체가 없어요. 라이벌은 내가 실제보다 강하다고 생각해요." kutu 198x34 içerik 198x48

### ko · oracle-deck
- clipped: `p.kd-card-line` "그림자는 행군하지만 실체가 없어요. 라이벌은 내가 실제보다 강하다고 생각해요." kutu 198x34 içerik 198x48

### it · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,681,543,701

### uk · forge-window
- cut by div.win-body: `span.cost` "10" konum 507,686,543,706

### uk · kingdom-panel
- clipped: `p.kd-card-line` "Каміння говорить: ти знаєш королівство й набір кож" kutu 198x34 içerik 198x48

### uk · oracle-deck
- clipped: `p.kd-card-line` "Каміння говорить: ти знаєш королівство й набір кож" kutu 198x34 içerik 198x48
