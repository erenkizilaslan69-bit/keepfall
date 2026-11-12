# Dil yerleşim denetimi (masaüstü 1280x720)

Otomatik: `node tools/lang-audit.mjs`. Sayılar: İngilizcede olmayan, o dilin eklediği taşma/kırpılma sayısı (kutuya sığmayan metin, üst kutu tarafından kesilen öğe, ekran dışı). İngilizcenin kendi sayıları tasarım tabanı olarak ayrı satırdadır. Ekran görüntüleri `art/shots/langs/` (git dışı).

| Dil | home | lobby | match | forge-window | castle-soldiers | castle-hire | castle-growth | castle-defense | farm-window | kingdom-panel | oracle-deck | guide | settings | plural |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en (taban) | 1 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| tr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh-CN | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh-TW | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ru | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| es-ES | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| es-419 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| pt-BR | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| de | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| fr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ja | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| ko | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pl | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| it | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| uk | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |

## Ayrıntı (dilin eklediği)

### ru · kingdom-panel
- clipped: `p.kd-card-line` "Камни говорят: ты знаешь королевство и набор каждо" kutu 198x34 içerik 198x48

### ru · oracle-deck
- clipped: `p.kd-card-line` "Камни говорят: ты знаешь королевство и набор каждо" kutu 198x34 içerik 198x48

### es-419 · kingdom-panel
- clipped: `p.kd-card-line` "Las sombras marchan, pero no son reales. Los rival" kutu 198x32 içerik 198x48

### es-419 · oracle-deck
- clipped: `p.kd-card-line` "Las sombras marchan, pero no son reales. Los rival" kutu 198x32 içerik 198x48

### pt-BR · kingdom-panel
- clipped: `p.kd-card-line` "Tudo tem um preço: a lealdade de um soldado, a esp" kutu 198x32 içerik 198x48

### pt-BR · oracle-deck
- clipped: `p.kd-card-line` "Tudo tem um preço: a lealdade de um soldado, a esp" kutu 198x32 içerik 198x48

### de · forge-window
- cut by div.win-body: `span.up-line` "Ausbauen +50 % Waffengeschwindigkeit" konum 482,394,754,432

### ja · kingdom-panel
- clipped: `p.kd-card-line` "影は行軍しますが、本物ではありません。ライバルは、あなたを実際より強いと思い込みます。" kutu 198x34 içerik 198x48

### ja · oracle-deck
- clipped: `p.kd-card-line` "影は行軍しますが、本物ではありません。ライバルは、あなたを実際より強いと思い込みます。" kutu 198x34 içerik 198x48

### pl · kingdom-panel
- clipped: `p.kd-card-line` "Kamienie przemawiają: znasz królestwo i talię każd" kutu 198x34 içerik 198x48

### pl · oracle-deck
- clipped: `p.kd-card-line` "Kamienie przemawiają: znasz królestwo i talię każd" kutu 198x34 içerik 198x48

### uk · kingdom-panel
- clipped: `p.kd-card-line` "Каміння говорить: ти знаєш королівство й набір кож" kutu 198x34 içerik 198x48

### uk · oracle-deck
- clipped: `p.kd-card-line` "Каміння говорить: ти знаєш королівство й набір кож" kutu 198x34 içerik 198x48
