# Ses lisansları

Hepsi CC0 1.0 (kamu malı: ticari kullanım, değiştirme, ayrı dağıtım serbest; isim vermek zorunlu değil, ama kaynak yazıldı). Dosyalar `client/public/audio/sfx/` (ogg + mp3 yedeği) ve `music/`.
Her dosya kaynaktan kırpıldı, tek kanala çevrildi ve ses düzeyi eşitlendi (ffmpeg); başka değişiklik yok. Lisans her sayfada "Public Domain CC0" olarak doğrulandı (2026-11-06).

## Önceden vardı
| Dosyalar | Kaynak | Lisans |
|---|---|---|
| `ui-*`, `sword-1..3`, `shield-*`, `death-*`, `castleHit-1..2`, `castleFall-1..3`, `battleStart`, `warning`, `envoy` | Kenney, Interface Sounds / Impact Sounds — https://kenney.nl | CC0 1.0 |
| `music/prep.mp3`, `music/war.mp3` | RandomMind, "The Old Tower Inn" ve "Medieval: Minstrel Dance" — https://opengameart.org | CC0 1.0 |

## 2026-11-06 gece eklenenler (OpenGameArt, CC0)
| Dosyalar | Kaynak (yazar) | Sayfa |
|---|---|---|
| `clash-1..4` (kılıç çarpışması) | "20 Sword Sound Effects (Attacks and Clashes)" — StarNinjas | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes |
| ~~`arrow-1..3` (hışırtı)~~ | kaldırıldı (2026-11-06): okçu atışında çınlama gibi duyuluyordu | — |
| `catapult-1` (mancınık atışı: hışırtı + ahşap vuruş) | "Air whoosh" — pyranostudios; "100 CC0 metal and wood SFX" — rubberduck | https://opengameart.org/content/air-whoosh · https://opengameart.org/content/100-cc0-metal-and-wood-sfx |
| `stone-1..3` (taşın düşmesi) | "75 CC0 breaking / falling / hit sfx" — rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx |
| `gate-1..3` (kapıya vuruş) | "100 CC0 metal and wood SFX" — rubberduck | https://opengameart.org/content/100-cc0-metal-and-wood-sfx |
| `fall-4` (kale yıkılışı, çökme) | "Cave In" — StarNinjas | https://opengameart.org/content/cave-in |
| `fall-5` (kale yıkılışı, gümbürtü) | "Muffled Distant Explosion" — Nenad Simic | https://opengameart.org/content/muffled-distant-explosion |
| `upgrade-1` (bina yükseltme çekici) | "Blacksmith's Hammer" — VishwaJai | https://opengameart.org/content/blacksmiths-hammer |
| `upgrade-2` (bina yükseltme çekici) | "100 CC0 metal and wood SFX" — rubberduck | https://opengameart.org/content/100-cc0-metal-and-wood-sfx |
| `march-1..3` (ordu yürüyüşü, zırhlı ayak sesi) | "Footsteps Leather, Cloth, Armor" — HaelDB | https://opengameart.org/content/footsteps-leather-cloth-armor |
| `gallop-1` (at dörtnala) | "Horse Trotting" — EZduzziteh | https://opengameart.org/content/horse-trotting |
| `win-1` (zafer) | "Win Jingle" — Fupi | https://opengameart.org/content/win-jingle |
| `win-2` (zafer vurgusu) | "Victory" — Musheran | https://opengameart.org/content/victory-6 |
| `fire-loop` (kamp ateşi çıtırtısı, döngü) | "Fire Crackling" — AntumDeluge | https://opengameart.org/content/fire-crackling |

Not: yazar adı, sayfada ilk görünen kullanıcı adıdır (gönderen). CC0'da isim zorunlu değildir.

## Aday ama kullanılmayan
- "Battle Sound Effects" (https://opengameart.org/content/battle-sound-effects): CC-BY 3.0, yay/ok sesi var; CC-BY isim gerektirdiği için kullanılmadı. Ok için CC0 hışırtılar kullanıldı.
- Kenney paketleri kenney.nl'den otomatik indirilemedi (indirme bağlantısı betikle 403 verdi); Kenney'den yeni dosya eklenmedi. Elle indirilirse (CC0): "RPG Audio", "Impact Sounds", "Interface Sounds".
- Pixabay ses efektleri: otomatik indirme engelli (403); kullanılmadı.
- Yenilgi vurgusu (`lose`): uygun CC0 kayıt bulunamadı, koddan üretilen ses duruyor.

## 2026-11-06 ince ayar: çınlayan sesler yerine tok vuruşlar
Eren "zil/çan gibi çınlayan bir ses kötü duruyor" dedi; hangisi olduğu dinlemeden anlaşılamadığı için çınlama ölçüldü (her kısa kaydın baskın tek frekansı, `ffmpeg` + frekans taraması) ve çınlayan olanların hepsi değiştirildi. Yeni kayıt indirilmedi: aşağıdakiler zaten repodaki CC0 kayıtlardan kesilip süzüldü (`ffmpeg`: alçak geçiren süzgeç + kısa kuyruk), kaynakları yukarıdaki tablolarda.
| Ses | Eskisi | Şimdi |
|---|---|---|
| `sword-1..3` (kılıç vuruşu, en sık duyulan) | Kenney, 3–4 kHz'de metalik "ting" çınlaması | aynı kayıtlar, 1,7 kHz altına süzülmüş, 0,2 sn'ye kısaltılmış (tok vuruş) |
| `envoy` (ulak vardı) | Kenney, 300 Hz çan "bong" | `gate-1` (rubberduck, ahşap) ilk vuruşu iki kez: iki ahşap tıkırtısı |
| `scoutBack` (gözcü döndü) | koddan üretilen üç notalık çıngırak | `knock` = `gate-1` ilk vuruşu (tek ahşap tıkırtısı) |
| `warning` (ordu geliyor) | Kenney, 300 Hz çan | `gate-3` (rubberduck) alçak geçiren, 0,24 sn tok vuruş |
| `ui-confirm` (komut onayı) | Kenney, 775 Hz "ding" | `gate-1` çok kısa tık |
| `upgrade` (bina yükseltme) | `upgrade-1` ("Blacksmith's Hammer", örs çınlaması) + `upgrade-2` | yalnız `upgrade-2` (dosya durur, kullanılmaz) |
| `castleHit` (kapıya vuruş) | Kenney `castleHit-1/2` (alçak çan) + `gate-1..3` | yalnız `gate-1..3` (Kenney dosyaları durur, kullanılmaz) |
At toynağı (`gallop`, `march`) değişmedi. Beğenilmeyen olursa eski dosya git geçmişinde (`git show HEAD~:client/public/audio/sfx/<ad>.ogg`).

## 2026-11-06 ince ayar 2: okçu atışı
Çınlamanın kaynağı okçu atışıydı (geçici hışırtı kaydı). Gerçek yay kayıtlarıyla değiştirildi; hepsi CC0:
| Dosyalar | Kaynak | Sayfa |
|---|---|---|
| `bow-1..4` (yayın bırakılması + okun havada vızıltısı) | "Medieval sound effects - Weapon Textures" (sayfa: "CC0 NO RIGHTS RESERVED"); dosyalar "English Longbow Shoot" (4 ayrı atış kesildi) ve "Scythian Recurve Arrow Pass" (iki geçiş kesildi), 0,5 sn'lik karışım | https://opengameart.org/content/medieval-sound-effects-weapon-textures |
| `arrow-hit` (okun saplanması, tok vuruş) | `gate-2` (rubberduck, yukarıda) alçak geçiren, 0,16 sn | — |
Kesim/karışım `ffmpeg` ile yapıldı (ham arşiv `medieval_sfx_textures_1_of_2.7z`, 90 MB, repoya girmedi; yalnız kullanılan kısa kesitler repoda).
Ses sınırı (`audio.ts MAX_SAME`): aynı anda en çok 3 ok, 4 kılıç, 3 kalkan, 3 ölüm sesi; her çalışta perde ±%10 ve ses ±%12 rastgele; yüzlerce okçu tek bir dolgun ok yağmuru gibi duyulur.
