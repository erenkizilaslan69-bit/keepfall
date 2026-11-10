# Kameraman (yönetmen) modu

Arkadaş testlerinden ve botlu maçlardan fragman / mağaza görüntüsü almak için gizli izleyici + kendi kendini yöneten kamera + kayıt aracı.

## Ne yapar
- **Gizli izleyici** (`src/Keepfall.Server/Games/Director.cs`, hub `DirectorRooms` / `DirectorWatch`): oyuncu değildir (koltuk almaz, lobide ve oyuncu listesinde görünmez, komut gönderemez, maçı etkilemez). Düşen oyuncuların gördüğü tüm-dünya resmini **canlı** (gecikmesiz) ve sissiz alır; hayalet ordular yalnız ona işaretli gelir (`fake`). Sayfa, odanın ilk insan oyuncusunun kalesi etrafında kurulur (yalnız çizim için; her kale çizilir).
- **Sinematik kamera** (`client/src/director.ts`): olayları puanlar ve en ilgincine yumuşakça (easeInOutCubic, uzaklığa göre 1,1–2,6 sn) gider, olay bitene kadar izler. Puanlar: kale düşüşü 120, üç taraflı kuşatma 105, kapı savaşı 80, hayalet ordu 70, yolda karşılaşma 60, büyük ordu yola çıkışı (≥8 asker) 40; büyüklüğe göre artı puan. Bir çekim en az 5 sn sürer; daha iyisi ancak 25 puan farkla araya girer.
  - **Yakın çekim, tam sayı zoom** (1, 2, 3; ekran pikseli / dünya pikseli, `--force-device-scale-factor=1` ile 1920 genişlikte piksel sanatı keskin kalır): savaşta oynatmadaki canlı askerlerin kutusu (`BattlePlayer.bounds`, +40 px pay) ekranın ~%60'ını dolduracak en yakın kademe, %90'ı aşmaz; sığmayınca hemen geri çekilir, yaklaşmak için 2 sn bekler. Askerler sahaya çıkmadan önceki varsayılan: yol çatışması 3, kapı savaşı / kuşatma / kale düşüşü / ordu çıkışı / hayalet ordu 2. Kale düşüşü kalenin biraz üstüne bakar (patlama ve duman).
  - **Boşta**: önce son ilginç yerde 12 sn hafifçe salınır, sonra yoldaki en büyük orduyu 20 sn izler (zoom 2), ordu yoksa ayakta kalan kaleleri sırayla (zoom 1); boş araziye gitmez. Boştaki geçişler yavaş (3,5–7 sn).
  - Arayüz, fare imleci ve dünya etiketleri (bina tabelaları, oyuncu adları, "yağmalandı", ordu sayı rozetleri; `.ui-labels`) gizli (`ui/director.css`). Kale/sur dumanı artık herkes için açık gri, yarı saydam, yükselip sönen Tiny Swords toz bulutu (`Effects.smokePuff`; eskiden koyu ve durağandı, yakından siyah delik gibiydi).
- **Kayıt** (`tools/director.mjs`): görünür (headed) kiosk Chrome + ffmpeg `ddagrab` ile tüm ekranı 1920x1080 60 fps kaydeder; maç bitince `full.mp4` (tüm maç), çekilen her olay için ayrı klip (`NN-<olay>-m<dakika>.mp4`), `events.json`, `report.txt` (sayfa kare hızı, Chrome/ffmpeg CPU payı) yazar. Çıktı `art/promo/director/<tarih-saat>/` (git dışı: Tiny Swords görüntüsü içerir).

## Güvenlik: ne zaman açık
Sunucu **yalnız** `Keepfall__DirectorKey` (en az 16 karakter) ile başlatılınca açar; açılışta günlüğe "Director (cameraman) connection ON" yazar. Şunlarda anahtar verilse bile **kapalı**:
- Render (barındırılan sunucu: `RENDER` ortam değişkeni var),
- Steam derlemesi (Electron kabuğu sunucuya `KEEPFALL_STEAM=1` ve boş anahtar verir),
- İstemci tarafında Steam, CrazyGames ve itch (barındırılan sunucu adresli) derlemelerinde yönetmen kodu derleme anında çıkarılır (`main.ts DIRECTOR_KEY`).
Yanlış anahtar 1 sn bekletir. Duman testi: anahtarsız sunucuda `DirectorRooms`/`DirectorWatch` reddedilir ve hiçbir resim gelmez.

## Kullanım
5090 (dev LAN, arkadaş testi) sunucusunu anahtarla başlat (o sunucu Production ortamında çalışır; anahtar yeter):
```
$env:Keepfall__DirectorKey='<16+ karakterlik gizli anahtar>'; <5090 sunucusunun her zamanki başlatma komutu>
```
Not: 5090'ın sunucu dll'leri ayrı publish'ten gelir (`keepfall-dev-lan\server`); yönetmen kodu için önce dev'den yeniden publish gerekir (CLAUDE/devir notundaki 5090 yenileme adımları), istemci de `vite build --outDir ../../keepfall-dev-lan/client/dist`.

Sonra tek komut (maç sürüyorsa onu, yoksa başlayanı bekler; `--room KOD` ile belli oda):
```
node tools/director.mjs http://192.168.1.3:5090/ --key <anahtar>
```
Seçenekler: `--room KOD`, `--lang en` (arayüz dili; görüntüde arayüz yok ama tabelalar o dilde), `--minutes 25` (en uzun kayıt), `--out <klasör>`, `--no-record` (yalnız kamera/olay denemesi, başsız), `--encoder x264|nvenc` (nvenc bu makinede sürücü eski olduğu için çalışmıyor), `--demo` (yerel deneme: Vite dev istemcisi + `Keepfall__AllowSpeedControl=true`; başsız bir oyuncu sekmesi 3 Orta botlu oda kurar, hazırlık x20, savaş x1).

Kayıt sırasında ekran kaydedildiği için önüne başka pencere gelmemeli (araç Chrome'u 3 sn'de bir öne alır). Fare imleci kayda girmez.

## Performans
- Sunucu: yönetmen başına tick'te bir tüm-dünya resmi + izlenen kalenin durumu (düşen oyuncuya gidenle aynı boyut); oyunculara etkisi ölçülemeyecek kadar küçük. Yalnız izlenen odada üretilir.
- Kaydı yapan bilgisayar: Chrome (oyunu 60 fps çizer) + ffmpeg (x264 ultrafast) yükü `report.txt`'te. 5090 sunucusu aynı makinedeyse (192.168.1.3) oyuncular için tick süresi değişmez (sunucu tek iş parçacıklı tick'i hafif), ama kare hızı düşerse kaydı ayrı bir bilgisayardan al: araç yalnız adrese bağlanır.

## Yerel deneme (2026-11-10, botlu maç, `--demo`)
**1. koşu, tüm maç** (`art/promo/director/20261110-1246/`, savaş 10 dk): 15 olay, 11'i çekildi (çakışanlardan daha düşük puanlılar çekilmez). Ham kayıt 10,3 GB (qp 12) → `full.mp4` 1,7 GB. Son kodlamada bilgisayar kapandı: klipler `--recut` ile ham kayıttan yeniden kesildi (aracın ilk sürümü ölçümü bellekte tutuyordu: bu koşunun kare hızı/CPU değeri yok; artık `events.json`'a yazılıyor).
| Klip | Süre |
|---|---|
| 01-phantom-army-m05 | 12,5 sn |
| 02-road-clash-m05 | 21,4 sn |
| 03-castle-fall-m05 | 10,5 sn |
| 04-phantom-army-m05 | 8,5 sn |
| 05-army-march-m06 | 11,2 sn |
| 06-road-clash-m06 | 26,0 sn |
| 07-road-clash-m06 | 9,5 sn |
| 08-road-clash-m07 | 8,9 sn |
| 09-gate-battle-m07 | 25,9 sn (örnek klip) |
| 10-gate-battle-m08 | 9,9 sn |
| 11-gate-battle-m08 | 10,5 sn |
Bulgu: 1–2 askerlik yol çatışmaları boş kavşak gibi görünüyordu → en az 6 asker (yol), 3 asker (kapı) sınırı eklendi. Maçın son ~5 dakikasında olay yoktu (kamera boşta yavaş pan yaptı).

**2. koşu, 4 dk** (`20261110-1420/`, sınırdan sonra): 12 olay, hepsi çekildi (5 ordu çıkışı, 2 hayalet ordu, 1 yol çatışması, 1 kale düşüşü, 3 kapı savaşı); ham kayıt qp 16'ya indirildi, `full.mp4` 866 MB.
Performans (bu makine, 16 mantıksal çekirdek): sayfa ortalama 155 fps (en düşük 107; ekran yenileme hızına bağlı, 60 fps kaydın üstünde), Chrome %16,7, ffmpeg %11,5 (tüm çekirdeklerin payı; yaklaşık 4–5 çekirdek). Oyuncuların olduğu 5090 sunucusu aynı makinedeyse bu yük sunucu tick'ini etkilemez görünüyor (tick hafif), ama kayıt ayrı bilgisayardan da alınabilir.

Açık: üç taraflı kuşatma iki denemede de olmadı (botlar nadiren yapar): puanı ve klip adı hazır, gerçek maçta görülünce bakılmalı. NVENC bu makinede sürücü sürümü yüzünden açılmıyor (x264 kullanılıyor).
