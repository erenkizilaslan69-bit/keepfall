# QA raporu — cila turu (2026-10-30)

Yöntem: `tools/qa-player.mjs` başsız Chrome'da (yazılım GL) gerçek bir insan gibi oynar (3 bota karşı, Kolay/Orta/Zor karışık): işçileri dağıtır,
yükseltir, silah üretir, kuşanır, gözcü/ulak/keşif gönderir, ormanı yağmalar, krallık yeteneklerini kullanır, saldırır, geri çağırır, yönünü
değiştirir; her ~20 sn'de ve her önemli olayda (faz değişimi, savaş raporu, düşüş, maç sonu) ekran görüntüsü alır (pencereler sırayla açılır:
tarla, demirhane, maden, kale, orman); komut hatalarını, konsol hatalarını ve hata ayıklama katmanının (debug layer) bulgularını toplar.
Ekran görüntülerini tek tek ben inceledim (`art/shots/qa/m*/`, git'e girmez). Hızlar ×5 (×20 yalnız "elen" kipinde).

## Maçlar

| Maç | Krallık | Kip / botlar | Sonuç | Not |
|---|---|---|---|---|
| m1 | Tüccar | normal, Zor/Orta/Kolay | 12:40'ta elendim, izleyici denendi | Ferman penceresini kapatmayı unutmuşum (araç hatası); düşük ekonomi |
| m2 | Tüccar | normal | 11:50'de elendim | Aracın `from` değişkeni hatası (araç); izleyici düğmeleri denendi |
| m3 | Gölge | elen (×20) | 12:00'de elendim, izleyici | `own kingdom in scene: golge` |
| m4 | Gölge | normal | — | İstemci dosyası düzenlenirken Vite sayfayı yeniledi (araç takıldı) |
| m5 | Gölge | normal, Zor/Zor/Orta | 20 dk hayatta, nüfusla 4. | Yemek 0'a düştü (aracın ekonomisi): kıtlık uyarısı görüldü |
| m6 | Gölge | normal, Kolay/Orta/Zor | 20 dk hayatta, nüfusla 2. | **Hatasız** |
| m7 | Entrikacı | normal, Zor/Orta/Orta | 12:50'de elendim, izleyici | Elenince ilk izleyici karelerinde 3 "deviation" (aşağıya bak) |
| m8 | Kâhin | elen (×20) | 11:10'da elendim, izleyici | **Hatasız** |
| m9 | Tüccar | normal, Orta/Zor/Kolay | 18:10'da elendim | 1 "deviation" (izleyici) |
| m10 | Gölge | normal, Zor/Orta/Kolay | 13:57'de elendim, izleyici | **Hatasız** |
| m11 | Kâhin | normal, Orta/Zor/Orta | 11:07'de elendim, izleyici | 1 "off-road" (başsız düşük FPS'te yol dışı çizim, 1,7 karo) |
| m12 | Kâhin | normal, 1000x640, Orta/Zor/Kolay | 11:10'da elendim | 3 "deviation" (düşük FPS) |
| m13 | Tüccar | normal, 1000x640, Zor/Orta/Orta | 11:00'de elendim, izleyici | **Hatasız** (konsol, komut, hata ayıklama: 0) |
| m14 | Tüccar | normal, 1000x640, Zor/Zor/Kolay | 16:18'de elendim, maç erken bitti | 1 "deviation" (düşük FPS); istisna/konsol hatası yok |

14 maç oynandı (3 çözünürlük: 1280x720 çoğunlukla, 1000x640 son üçü). Son 2 maçta (m13, m14) istisna, konsol hatası, kırık düğme ya da
okunmayan metin yok; hata ayıklama katmanında yalnız başsız yazılım GL'in (4–10 FPS) yol açtığı tek bir "deviation" uyarısı kaldı.
Dört krallığın hepsi oynandı/izlendi (Tüccar, Gölge, Kâhin, Entrikacı); her krallıkta kale, binalar, sur, kule ve kapı kaldırımı kendi taş
renginde göründü (izleyici dahil).

## Bulunan hatalar ve çözümler

1. **Kapı muhafızları hata ayıklama katmanında "stray" (sahipsiz) birim sayıldı** (`stray: warrior-idle`). Muhafız çizimleri katmanın sahip
   listesine eklenmemişti → `Guards.debugSprites()` kale ve izlenen bölgelerin listesine eklendi.
2. **Kule taşı krallık renginde değildi**: kulenin cıvıl cıvıl turkuaz üst halkası "takım rengi" sanılıp korunuyordu, kuleler surdan farklı
   görünüyordu → yalnız sıcak renkler (ahşap tepe) korunur, geri kalanı krallığın taş basamağına döner.
3. **Kapı kaldırımı turkuaz kaldı** (sur mor/kumtaşıyken): kaldırım da krallığın taşıyla boyanır (`GatePaving.setLook`).
4. **Pencerelerde renk adı tekrarı** ("Bot Mor ● Mor"): oyuncu adı rengi zaten söylüyorsa küçük renk yazısı konmaz (`format.colorNote`;
   orman, düşman ve ordu pencereleri).
5. **Kesirli ölçek bloklu görünüm veriyordu** (kullanıcının "kalitesiz/bloklu" şikâyetinin bir parçası): nearest-neighbour'da 1,9×/2,2×/1,6×
   ölçek bazı pikselleri öbürlerinden geniş çiziyor. Krallık bina/kale ve orman yerleri tam sayı ölçeğe (×2, ×3) alındı; bina boyutu
   seviyeyle büyümez (seviyenin eklediği bayrak/sandık/çit/fener kalır).
6. **Muhafızlar** (bu turda eklenip sonra kullanıcı kararıyla kaldırıldı) botların denge ölçümünü bozuyordu; tablolar `docs/gece/muhafiz-*.txt`.

## Bulunup çözülmeyenler / gözlemler

- **İzleyiciye geçerken "deviation" uyarıları** (hata ayıklama katmanı, yalnız geliştirme derlemesi): görülen ordu/gözcü çizimi sunucu
  konumundan 11–22 karo uzakta (×5'te izin verilen 9,5–14,5). Başsız yazılım GL'de sayfa 4–10 FPS'e düşüp resimler arası boşluk
  uzadığı için oluşuyor; oyuncuya görünen bir kayma/sıçrama gözlenmedi. Gerçek GPU'da ölçülmedi. Üretimde katman kapalı.
- **Bir kez (m2) elenme sonrası kendi binaları sade Tiny Swords görünümüne dönmüştü**; sonraki dört izlemede (m3, m7, m8, m9, m10)
  tekrarlanmadı. O sırada ben istemci dosyalarını düzenliyordum (Vite sıcak yenileme), büyük olasılıkla ondan. İzlemeye alındı.
- "Tüm insanlar elendi" kutusu izleyicide alt ortada kalıyor (İzlemeye devam'a basılana kadar); engel değil ama harita altını örtüyor.
- QA oyuncusu (araç) eksikleri: elenmiş rakibe saldırı/gözcü komutu dener (sunucu "Bu oyuncu elendi" der; arayüz bu rakipleri zaten göstermez).

## Ölçümler (muhafız)

Muhafızlar kaldırıldı; geçmiş ölçümler `docs/gece/muhafiz-*.txt` içinde, kaldırma sonrası doğrulama `muhafiz-kaldirildi-*.txt`.
