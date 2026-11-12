# Dil yerleşim denetimi (masaüstü 1280x720)

Otomatik: `node tools/lang-audit.mjs`. Sayılar: İngilizcede olmayan, o dilin eklediği taşma/kırpılma sayısı (kutuya sığmayan metin, üst kutu tarafından kesilen öğe, ekran dışı). İngilizcenin kendi sayıları tasarım tabanı olarak ayrı satırdadır. Ekran görüntüleri `art/shots/langs/` (git dışı).

| Dil | home | lobby | match | forge-window | castle-soldiers | castle-hire | castle-growth | castle-defense | farm-window | kingdom-panel | oracle-deck | guide | settings | plural |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en (taban) | 1 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| tr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| zh-CN | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh-TW | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ru | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| es-ES | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| es-419 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| pt-BR | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| de | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| fr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ja | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| ko | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pl | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| it | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 1 | 0 | 0 | 0 |
| uk | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |

## Ayrıntı (dilin eklediği)

### tr · kingdom-panel
- clipped: `p.kd-card-line` "Taşlar konuşur: herkesin krallığını ve destesini b" kutu 198x34 içerik 198x48

### tr · oracle-deck
- clipped: `p.kd-card-line` "Taşlar konuşur: herkesin krallığını ve destesini b" kutu 198x34 içerik 198x48

### es-ES · kingdom-panel
- clipped: `p.kd-card-line` "Las piedras hablan: conoces el reino y el mazo de " kutu 183x34 içerik 183x48

### es-ES · oracle-deck
- clipped: `p.kd-card-line` "Las piedras hablan: conoces el reino y el mazo de " kutu 198x34 içerik 198x48

### es-419 · kingdom-panel
- clipped: `p.kd-card-line` "Todo tiene un precio: la lealtad de un soldado, la" kutu 198x32 içerik 198x48

### es-419 · oracle-deck
- clipped: `p.kd-card-line` "Todo tiene un precio: la lealtad de un soldado, la" kutu 198x32 içerik 198x48

### pt-BR · kingdom-panel
- clipped: `p.kd-card-line` "As sombras marcham, mas não são reais. Os rivais a" kutu 198x32 içerik 198x48

### pt-BR · oracle-deck
- clipped: `p.kd-card-line` "As sombras marcham, mas não são reais. Os rivais a" kutu 198x32 içerik 198x48

### de · forge-window
- cut by div.win-body: `span.up-line` "Ausbauen +50 % Waffengeschwindigkeit" konum 482,394,754,432

### de · kingdom-panel
- clipped: `p.kd-card-line` "Alles hat seinen Preis: die Treue eines Soldaten, " kutu 198x34 içerik 198x48

### de · oracle-deck
- clipped: `p.kd-card-line` "Alles hat seinen Preis: die Treue eines Soldaten, " kutu 198x34 içerik 198x48

### ja · kingdom-panel
- clipped: `p.kd-card-line` "石が語ります。全員の王国とデッキがわかり、からくりも見抜けます。" kutu 198x34 içerik 198x48

### ja · oracle-deck
- clipped: `p.kd-card-line` "石が語ります。全員の王国とデッキがわかり、からくりも見抜けます。" kutu 198x34 içerik 198x48

### pl · kingdom-panel
- clipped: `p.kd-card-line` "Kamienie przemawiają: znasz królestwo i talię każd" kutu 198x34 içerik 198x48

### pl · oracle-deck
- clipped: `p.kd-card-line` "Kamienie przemawiają: znasz królestwo i talię każd" kutu 198x34 içerik 198x48

### it · kingdom-panel
- clipped: `p.kd-card-line` "Le pietre parlano: conosci il regno e il mazzo di " kutu 183x34 içerik 183x48
- cut by div.kingdom-panel.paper: `div.kd-oracle` "Bot Viola · Repubblica dei MercantiMazzo: Arciere," konum 46,601,319,721
- offscreen: `div.kd-oracle` "Bot Viola · Repubblica dei MercantiMazzo: Arciere," konum 46,601,319,721

### it · oracle-deck
- clipped: `p.kd-card-line` "Le pietre parlano: conosci il regno e il mazzo di " kutu 198x34 içerik 198x48

### uk · kingdom-panel
- clipped: `p.kd-card-line` "Тіні марширують, але вони не справжні. Суперники в" kutu 198x34 içerik 198x48

### uk · oracle-deck
- clipped: `p.kd-card-line` "Тіні марширують, але вони не справжні. Суперники в" kutu 198x34 içerik 198x48
