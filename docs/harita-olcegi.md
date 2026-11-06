# Harita ölçeği deneyi (2026-11-06, dev; bayrak arkasında, varsayılan KAPALI = 1,0)

Amaç: kaleler daha ferah olsun, oyun dengesi aynı kalsın. Kararı sen vereceksin; varsayılan değişmedi.

## Nasıl açılır
- Bir ziyaret için adrese `?mapscale=1.3` (herhangi bir derleme, 0,8–2 arası): `http://192.168.1.3:5090/?debug=1&mapscale=1.5`.
- Derlemeye gömmek: `VITE_MAP_SCALE=1.3 npm run build` (5090 şu an bu şekilde 1,3 ile derlendi; adreste `?mapscale=1` yazarsan eski görünüm).
- Sunucu config'inde `map.scale` (varsayılan 1) var ama yalnız sayıyı taşır ve doğrular: istemcinin ölçeği modül yüklenirken sabitlendiği için sunucudan okunmaz (VITE/adres). İkisi tutarsa denetim yok.

## Nasıl çalışıyor (neden denge aynı)
Sunucu her şeyi KARO cinsinden sayar (konumlar, hızlar, görüş yarıçapları). İstemci karo→piksel çevirisini `TILE` ile yapar. `TILE = 64 × MAP_SCALE` olunca haritadaki her mesafe, yol, orman, sis ve görüş yarıçapı otomatik o oranda uzun çizilir; hızlar da karo/sn olduğu için piksel hızı aynı oranda artar ve **yolculuk süresi (ETA) değişmez** (rota uzunluğu karo / hız). Sunucu koduna ve kurallara dokunulmadı. Test: `The_map_scale_is_only_a_picture_and_changes_no_journey_time` (aynı rotanın march/scout süresi map.scale 1 ve 1,3'te aynı; hızlar, görüş yarıçapları aynı).
- Bölge içi (kale) piksel yerleşimi (`layout.ts`: kale, kapı, kamp, boşta işçi alanı, binalar, işçi yerleri, etiketler; `Walls.GATE_Y`; `CourtyardFloor` yolları ve alanları; King devriyesi; işçi yolları) aynı oranla ölçeklenir; **sprite boyutları aynı kalır** (kale resmi, evler, askerler), araları açılır. L1–L4 binaları aynı düzenin ×ölçek hali: ferah, sur dışına taşan yok (L4 eski yerleşim yine). Zemin dokusu ×ölçek (tilemap katmanı ölçeklenir, sınırlar temiz).
- Kamera: başlangıç yakınlığı ve rakip kale odağı ölçekle bölünür (kale yine bütün görünür), en küçük yakınlık harita boyundan hesaplanır, en büyük (1,5) aynı. Mini harita karo cinsinden: aynı.
- Doku sınırı: deniz dalgası ve köpük şeritleri 2048 px parçalara bölündü (1,3'te 4659 px olacaktı; bazı telefonların GPU'su 4096'yı geçmez).

## Ölçüm (başsız Chrome, kale + harita görünümü; FPS makine/yazılım çizici: yalnız göreli)
| map.scale | texMB | doku sayısı | en büyük doku | sahne nesnesi | FPS (kale / harita) |
|---|---|---|---|---|---|
| 1,0 | 201 | 200 | 4160 (asker sayfası) | 399 | 25,1 / 28,4 |
| 1,3 | 218 (+%8) | 219 | 4160 | 465 (+%17) | 25,2 / 28,4 |
| 1,5 | 225 (+%12) | 223 | 4160 | 487 (+%22) | 25,9 / 31,1 |
Nesne artışı ek harita süsleri ve büyüyen alan; FPS farkı ölçülemedi (ölçüm gürültüsü içinde). Gerçek telefonda (5090) bakılmalı.

## Görüntüler (`art/shots/mapscale/`, repoya girmez)
`temas-1-1.3-1.5.png`: harita genel, kale L1, kale L4, yürüyen ordu; sütunlar 1,0 / 1,3 / 1,5.

## Sınama (1,3 ile)
`corner-check` 12/12 (sur dahil), `movers-stall-check` geçti, rehberli maç x1: aşağıda/raporda; `dotnet test` 284/284; `tsc` temiz; `run-smoke` (varsayılan ölçek). Bilinen: ölçek >1'de kale içinde etiketler ve bina yerleşimi gözle denendi, ama ayrıntılı çakışma denetimi (`layout-check`) piksel ölçüleriyle ölçeksiz tasarlandı.

## Dikkat / bilinmeyenler
- Kale resmi aynı boyutta kaldığı için büyük ölçekte kale küçük kalır, etrafı daha boş görünür: istersen kale/bina sprite'larına ayrı küçük bir büyütme (ör. ×1,15) eklenebilir (denenmedi).
- Harita süsleri sayıca sabit olduğu için büyük ölçekte seyrelir.
- Bayrak yalnız istemcide: çok oyunculu odada herkes aynı ölçekte görmek zorunda değil (oyuna etkisi yok), ama ekran görüntüsü karşılaştırmaları ölçeğe bağlıdır.
