# Ses lisansları

İki lisans var: **Pixabay Content License** (Eren'in seçtiği 13 ses, aşağıda "2026-11-06 Eren'in seçtiği sesler" bölümü; bugün oyunda duyulan yay, kılıç, mancınık, kale yıkılışı, yükseltme, zafer, kamp ateşi, at, açılış/hazırlık/lobi müziği bunlar) ve **CC0 1.0** (geri kalan Kenney/OpenGameArt kayıtları: kamu malı, isim zorunlu değil, ama kaynak yazıldı). Kredilerde (Ayarlar → Hakkında, 15 dil): "Pixabay (Pixabay Content License), Kenney, OpenGameArt (CC0)"; lisans özeti `client/public/licenses/AUDIO-LICENSES.txt`. Dosyalar `client/public/audio/sfx/` (ogg + mp3 yedeği) ve `music/`.
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

## 2026-11-06 Eren'in seçtiği sesler (Pixabay Content License) — bunlar aşağıdaki eski kayıtların yerine geçti
**Lisans:** Pixabay Content License (ticari kullanım serbest, isim zorunlu değil; seslerin tek başına dağıtılması/satılması YASAK: yalnızca oyunun parçası olarak kullanılır, ses paketi olarak yayınlanmaz). Bu satırdan önceki bölümlerdeki CC0 kayıtlardan aşağıdakilerin yerine geçenler repodan kaldırıldı; **kayıtları ve eski dosyalar git geçmişinde** (`git log -- client/public/audio`).
Kaynak linkleri henüz doldurulmadı (Eren dolduracak). Teknik işleme (Eren'in notu): baştaki sessizlik kırpıldı, kısa fade-out, tepe ≈ −1 dBFS, kamp ateşi kesintisiz döngü. Claude yalnız ogg üretti (`ffmpeg -c:a libvorbis -q:a 5`, başka işlem yok); mp3'ler olduğu gibi.

Yerleşim:
| Dosya | Oyunda |
|---|---|
| `bow-shot` | okçu atışı (`arrow`) |
| `sword-clash-1`, `sword-slice-1`, `sword-slice-2` | kılıç vuruşu; ağırlıklar 1:1:1 → çarpışma vuruşların ~1/3'ünde, kalan 2/3 slice |
| `catapult-launch` | mancınık atışı |
| `castle-collapse` | kale yıkılışı (+ müzik kısılır) |
| `upgrade` | bina yükseltme |
| `victory` | zafer |
| `campfire-loop` | kamp ateşi döngüsü (kameranın kampa yakınlığıyla yükselir) |
| `horse-gallop-loop` | süvari kolu döngüsü (kameraya en yakın süvari kolunun uzaklığıyla yükselir/alçalır) |
| `music/start.mp3` (music-start) | bulutlar açılınca BİR KEZ; ardından hazırlık müziği yumuşakça girer |
| `music/prep.mp3` (music-bg-loop, 149 sn) | hazırlık müziği |
| `music/lobby.mp3` (music-lobby-loop, 185 sn) | ana menü, lobi ve maç sonu müziği; maça geçerken yumuşak geçiş (opening piece altında kaybolur) |
| `music/war.mp3` | savaş müziği: değişmedi (eski, RandomMind, CC0) |
Ses sınırları (`MAX_SAME`: 3 ok, 3 saplanma, 4 kılıç…) ve perde/ses rastgeleliği duruyor.

Eren'in `kaynaklar.txt` dosyası olduğu gibi:
```
# Eren'in seçtiği sesler (2026-11-06). Kaynak linklerini Eren dolduracak.
# Claude (sohbet) teknik işleme yaptı: baştaki sessizlik kırpıldı, kısa fade-out, tepe -1 dBFS civarı, kamp ateşi kesintisiz döngü.
bow-shot.mp3          - okçu atışı        - kaynak: Pixabay - link: ?
sword-clash-1.mp3     - kılıç çarpışması  - kaynak: Pixabay - Dragon Studio "sword clash/hit" (393837) - link: ?
sword-slice-1.mp3     - kılıç savurma     - kaynak: Pixabay - Dragon Studio "sword slice" (393847) - link: ?
sword-slice-2.mp3     - kılıç savurma 2   - kaynak: Pixabay - Dragon Studio "sword slice 2" (393845) - link: ?
catapult-launch.mp3   - mancınık atışı    - kaynak: Pixabay - link: ?
castle-collapse.mp3   - kale yıkılması    - kaynak: Pixabay - link: ?
campfire-loop.mp3     - kamp ateşi döngü  - kaynak: Pixabay - link: ?
horse-gallop-loop.mp3 - at dörtnala döngü - kaynak: Pixabay - link: ?
upgrade.mp3           - bina yükseltme    - kaynak: Pixabay - link: ?
victory.mp3           - zafer             - kaynak: Pixabay - link: ?
music-start.mp3       - BAŞLANGIÇ müziği: bulutlar açılınca BİR KEZ çalar (döngü değil) (24 kHz, düşük kalite; daha iyisi bulunursa değiştir) - kaynak: Pixabay - link: ?
music-bg-loop.mp3     - HAZIRLIK arka plan müziği (~2,5 dk kesintisiz döngü; orijinal parçanın bölümleri ölçü sınırlarında yeniden düzenlendi, yumuşak/ince varyasyonlarla) - kaynak: Pixabay - link: ?
music-lobby-loop.mp3  - LOBİ / ana menü müziği (~3 dk kesintisiz döngü; orijinal çok yüksek kaydedilmişti, -16 LUFS'e indirildi) - kaynak: Pixabay - link: ?
# Lisans: Pixabay Content License (ticari kullanım serbest, isim zorunlu değil; sesleri tek başına dağıtmak/satmak yasak).
```

## 2026-11-10 denetim: 13 Pixabay sesi
`audio-inbox/` artık boş (dosyalar 2026-11-06'da yerleştirildi, commit a8b7761). Hepsi oyunda:
| audio-inbox adı | Oyundaki dosya | Nerede çalar (`client/src/audio.ts`) |
|---|---|---|
| bow-shot | `sfx/bow-shot.ogg/.mp3` | `arrow`: okçu atışı (savaş oynatması) |
| sword-clash-1 | `sfx/sword-clash-1` | `sword`: kılıç vuruşu (1/3) |
| sword-slice-1 / -2 | `sfx/sword-slice-1`, `-2` | `sword`: kılıç vuruşu (2/3) |
| catapult-launch | `sfx/catapult-launch` | `catapult`: mancınık atışı |
| castle-collapse | `sfx/castle-collapse` | `castleFall`: kale düşüşü |
| campfire-loop | `sfx/campfire-loop` | ortam döngüsü `fire`: kamp ateşi, kameranın yakınlığıyla |
| horse-gallop-loop | `sfx/horse-gallop-loop` | ortam döngüsü `gallop`: en yakın süvari kolu |
| upgrade | `sfx/upgrade` | `upgrade`: bina yükseltme |
| victory | `sfx/victory` | `win`: zafer |
| music-start | `music/start.ogg/.mp3` | bulutlar açılınca BİR KEZ (`music.intro`) |
| music-bg-loop | `music/prep-bg.ogg/.mp3` | hazırlık döngüsü |
| music-lobby-loop | `music/lobby.ogg/.mp3` | ana menü, lobi, maç sonu |
2026-11-10: müziklerin ogg'u eklendi (`ffmpeg -c:a libvorbis -q:a 5`, başka işlem yok); tarayıcı ogg çalabiliyorsa ogg, değilse mp3. `war.mp3` (RandomMind, CC0) mp3 kaldı: ogg'u daha büyük çıktı.
