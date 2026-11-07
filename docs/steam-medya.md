# Steam mağaza medyası (2026-11-07)

Tek kaynak: Eren'in oynadığı gerçek maçın ekran kaydı (12 dk 35 sn, 1920x1080, 30 fps; repoda YOK). Çıktılar `art/steam/` altında ve git dışı (içinde Tiny Swords görselleri var).

## Çıktılar
| Dosya | İçerik |
|---|---|
| `keepfall-trailer-en.mp4` | 36,2 sn, 1920x1080, 30 fps (kaynağın hızı; 60'a uydurulmadı), H.264 + AAC, 43 MB |
| `01-castle-economy.png` | kale, işçiler, tarla/maden |
| `02-forge-and-weapons.png` | demirci paneli, silah üretimi, kampta asker |
| `03-fog-and-scout.png` | sis ve ormanda gözcü |
| `04-army-marches.png` | ordu yolda yürüyor |
| `05-gate-battle.png` | kapıda savaş |
| `06-castle-falls.png` | kale yanıyor, düşüyor |
| `07-second-siege.png` | ikinci kale kuşatması |
| `08-victory.png` | "You won!" maç sonu |

Hepsi kayıttan alınmış temiz kare, 1920x1080; oyunun arayüzü görünür, geliştirici tanılaması yok. Kayıttaki küçük "FPS" kutusu (oyuncu ayarı) ilk bölümlerde boyanıp silindi. Oyuncu adı kayıtta genel "Player 1 (you)". Fare imleci bazı karelerde küçük görünebilir.

Fragman akışı: kale + "Every soldier… …is a worker lost." → demirci → "SCOUT." → ulak ("Send envoys. Make deals.") → baskın ("Raid villages. Beat bandits.") → "One battle…" → "CONQUER." → "…one castle falls." → ikinci kuşatma → zafer → bitiş kartı (düz yazı: KEEPFALL, "Wishlist on Steam", "Art: Tiny Swords by Pixel Frog"). Yazılar oyunun kendi piksel yazı tipiyle (Pixelify Sans); müzik oyunun CC0 parçaları (`client/public/audio/music`).

## Yeniden üretme
```
node tools/steam-media.mjs --rec "<maç kaydı.mp4>" [--only trailer|shots]
```
Başsızdır (ekranı kaplamaz). Kaynak saniyeleri `tools/steam-media.mjs` içindeki `SHOTS` ve `BEATS` tablolarındadır; başka bir kayıtla önce temas sayfasından an seçilir (betiğin başındaki ffmpeg komutu). Başlık/yazılar `BEATS[].caps`. Araçlar: ffmpeg (PATH'te) ve Chrome (yalnız yazı görüntüleri için, `tools/steam-render.mjs`).

Eksikler: üç taraflı kapı kuşatması kayıtta yoktu; Türkçe fragman ve Steam kapsül/başlık görselleri yapılmadı (Steam görsel boyutları `docs/steam-magaza.md`'de).

## Lisans ve yapay zekâ notu
- Tiny Swords (Pixel Frog): ticari kullanım serbest, kredi önerilir (Pixel Frog), varlık paketi tek başına dağıtılmaz. Bu yüzden medya yayımlanabilir; bitiş kartında kredi var. Paketten türeyen görüntüler repoya girmez (`art/steam/` .gitignore'da).
- Yeni çıktılarda yapay zekâ ile üretilmiş görsel/logo YOK: görüntüler oyunun gerçek kareleri, bitiş kartı düz tipografi.
