# Steam mağaza medyası (2026-11-07)

Durum: **ekran görüntüleri hazır (9 adet, TR + EN)**; **fragman ve Steam görsel setleri (kapsül, başlık görseli vb.) henüz üretilmedi**. Nedenleri "Bilinen eksikler" bölümünde. Planın kendisi: `docs/steam-magaza.md`.

## Üretilen dosyalar (hepsi git dışı; `art/shots/` ve `art/video/` .gitignore'da)
`art/shots/steam/<tr|en>/` (1920x1080 PNG):

| Dosya | İçerik | Kaynak |
|---|---|---|
| 01-castle-at-work | kale, çalışan işçiler, tarlalar | gerçek oyun, temiz (arayüzsüz) klip karesi |
| 02-forge-and-arming | demirci, silah üretimi, askerlerin kuşanması | aynı |
| 03-fog-and-scout | sis, yollar, gözcü | aynı |
| 04-phantom-army-forest | ormanda yürüyen hayalet ordu | aynı |
| 20-main-menu | ana menü | başsız Chrome, gerçek ekran |
| 21-challenges | Meydan Okuma ekranı | aynı |
| 22-achievements-mastery | başarımlar ve krallık ustalığı | aynı, **kurgusal ilerleme verisiyle** |
| 23-lobby-deck | lobi, deste seçimi (7 birim) | aynı, odaya botlar eklenmiş |
| 24-who-deceived-whom | maç sonu "Kim kimi kandırdı?" zaman çizelgesi | aynı, **kurgusal maç sonucuyla** |

Oyun içi sahnelerin temiz kareleri metin içermez; bu yüzden TR ve EN setinde aynı kare kullanılır. Tek dil farkı menü ekranlarındadır.

Klipler (ham çekim, kullanıcı makinesinde): `art/video/clips-en/` (c01, c03–c07, c09; temiz + arayüzlü) ve `clips-tr/` (c01, c03–c07; yalnız arayüzlü).

## Yeniden üretme
Hepsi tek komutla: `node tools/steam-screenshots.mjs [--lang tr|en|both] [--only stills|menus|assets] [--contact]`.
- Kendi özel yığınını açar: yayımlanmış Development sunucusu 5083 (geçici balance kopyası, yalnız başlangıç stokları yükseltilmiş; gerçek dosyaya dokunmaz) + Vite 5176. 5080/5081/5090/5174'e dokunmaz. `tools/steam-media-stack.mjs` tek başına da çalışır; sunucu günlüğü geçici klasörde `server.log`.
- `--contact`: klip başına temas sayfası (`art/shots/steam/contact-*.png`), kare zamanlarını seçmek için. Zamanlar `STILLS` dizisinde.
- Menü ekranları ve mağaza görselleri başsız Chrome ile (`tools/steam-render.mjs`, `--headless=new`) çizilir, ekranda pencere açmaz.
- Klip çekimi: `tools/promo/*.mjs` (kingdoms, warclips, spectator, cut-master; ortam değişkenleri `KF_PROMO_URL`, `KF_PROMO_LANG`, `KF_PROMO_CLIPS`, `KF_PROMO_TAGS=clean|ui`). Fragman: `node tools/steam-trailer.mjs --lang both` (uzunluğu 30–45 sn, 60 fps, TR/EN altyazı, CC0 müzik, bitişte kredi kartı; **henüz hiç çalıştırılmadı**).

## Gerçek GPU ile çekim (fragman için gerekli)
Akıcı 60 fps sahne çekimi başsız Chrome ile mümkün değil (bu makinede başsız ~5 FPS). Çalışan yol: **pencereli kiosk Chrome + gerçek GPU, ffmpeg `ddagrab` ile 60 fps** (`tools/promo/lib.mjs`). Bu çekim **ana ekranı tamamen kaplar**: dil başına ~30+ dk, bu sürede bilgisayar kullanılamaz. Adımlar:
1. Başka oyun/uygulama kapalı, ana ekran 1920x1080.
2. `node tools/steam-media-stack.mjs` (yığın), başka terminalde:
   `KF_PROMO_URL=http://localhost:5176/ KF_PROMO_LANG=en KF_PROMO_CLIPS=<art/video/clips-en> node tools/promo/warclips.mjs --takes 1` (sonra spectator, cut-master, kingdoms).
3. Her ham kayıt ~1,3 GB; **en az 15 GB boş disk** gerekir (bu çalışmada disk dolup çekim çöktü).
4. `node tools/steam-screenshots.mjs --only assets` ve `node tools/steam-trailer.mjs --lang both`; çıktı `art/video/keepfall-trailer-{tr,en}.mp4` + 10 sn GIF.
Elle alternatif: OBS veya Windows Game Bar ile 1080p60 kayıt.

## Bilinen eksikler
- **Fragman yok**: c10–c15 (ordu yürüyüşü, savaş, kale düşüşü, zafer) çekilemedi. İlk deneme savaş betiğindeki eski sıra adları ("front"/"back"; sunucu artık first…fourth bekliyor, düzeltildi) ve disk dolması yüzünden bozuldu; sonra kullanıcı makinede oynadığı için pencereli çekim bırakıldı. `steam-trailer.mjs` ve mağaza görsel bileşimi (`--only assets`, c10 gerektirir) denenmedi.
- Savaş, kuşatma, kale düşüşü ve krallık yeteneği oyun içi görüntüleri henüz yok (menü ve hazırlık ekranları var).
- "Arayüzlü" klipler sol altta kırmızı bir geliştirici tanılama şeridi gösteriyor; mağazaya uygun değil. Görüntüler bu yüzden temiz (arayüzsüz) karelerden alındı; oyunun arayüzü yalnızca menü görüntülerinde görünür. Sonraki çekimde tanılama şeridi gizlenmeli.
- TR çekim: arayüzlü klipler var, temiz klipler yok (temiz kareler dilden bağımsız olduğu için EN klibi kullanıldı).
- Ekran 22 ve 24 kurgusal veriyle hazırlandı (oyun verisi değil, gösterim); mağaza metninde "sahnelenmiş" olarak anılmalı.
- Topluluk simgesi taslak; Steam görsel setinde metin yok, tek logo tüm boyutlarda aynı.
- **Logo yapay zekâ ile üretilmiş** (`art/promo/keepfall-logo-transparent.png`, ekranlarda ve ileride kapsüllerde görünür): Steam'in yapay zekâ içeriği beyanında belirtilmeli. Oyun içi yapay zekâ görselleri sonradan kaldırıldı.

## Lisans notu
Tiny Swords (Pixel Frog): ticari kullanım serbest, kredi önerilir (Pixel Frog); varlık paketi tek başına dağıtılmaz. Bu yüzden medya yayımlanabilir. Fragman bitiş kartında "Art: Tiny Swords by Pixel Frog" kredisi var. Paketten türetilen görüntüler repoya yine de girmez (çıktılar git dışında).
