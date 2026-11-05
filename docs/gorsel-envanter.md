# Görsel envanter ve birlik eşlemesi (2026-11-05)

Büyük görsel geçişin 0–2. adımları: oyundaki her görselin kaynağı ve yeri, Warfare paketinin içeriği, 7 birliğin eşlemesi.
Hedef: yapay zekâ (AI) görsellerinin hepsi çıkar, oyun yalnız Tiny Swords (Free Pack + Warfare) ile tutarlı kalır.
Tiny Swords dosyaları repoda DEĞİL (`client/public/assets/` .gitignore'da); aşağıdaki "AI" ve "CC0" olanlar repoda.

Kaynak anahtarı: **TS** = Tiny Swords Free Pack (`assets/tiny-swords/Tiny Swords (Free Pack)/`), **WF** = Warfare (`assets/Warfare_001/Warfare/`),
**AI** = Gemini/Retro Diffusion ile üretilmiş (repoda, kaldırılacak), **CC0** = repodaki serbest dosyalar (kalır), **KOD** = koddan çizilir.

---

## 1. Oyundaki görseller: kaynak ve kullanım yeri

### Birlikler ve işçiler (harita)
| Görsel | Kaynak | Kullanıldığı yer |
|---|---|---|
| İşçi (Pawn: bekle, koş, balta/kazma/çekiç/bıçak, odun/et/altın taşıma) | TS | `scene/assets.ts` `units()`, `Workers.ts`, `Movers.ts` |
| Okçu (Archer idle/run/shoot, Arrow) | TS | `assets.ts`, `Soldiers.ts`, `Movers.ts`, `BattlePlayer.ts` |
| Mızrakçı (Lancer idle/run/Right_Attack, 320 px kare) | TS | aynı |
| Kılıçlı (Warrior idle/run/Attack1) | TS | aynı |
| Kalkanlı (Warrior_Guard) | TS | aynı (`SHIELD_SCALE` 1,18×) |
| Keşiş (Monk idle/run/Heal, Heal_Effect) | TS | `BattlePlayer.ts` (iyileştirme efekti) |
| **Süvari** (Lancer sayfasından birleştirilen binici + AI at) | TS + **AI** | `scene/NewUnits.ts`, `scene/HorseArt.ts` ← `art/horse/horse.png` |
| **Mancınık** | **AI** | `scene/CatapultArt.ts` ← `art/mancinik.png` |
| Haydut (siyah Warrior/Archer/Lancer) | TS (Black Units) | `Sites.ts` `BANDIT_ANIM` |
| Koyun, ağaç, çalı, kaya, kütük, altın taşları, odun/altın yığını | TS | `assets.ts`, `Terrain.ts`, `MapProps.ts` |
| Kamp ateşi | KOD | `PixelArt.flameCanvas`, `NewUnits.makeCampfire`, `Soldiers.buildFire` |
| Toz, patlama, ateş parçacıkları | TS (Particle FX) | `Effects.ts` |

### Kale, binalar, sur
| Görsel | Kaynak | Yer |
|---|---|---|
| Oyuncu kalesi/evler/kule/kışla/okçu menzili (renk klasörü) | TS | `assets.ts` `buildingImages()`; rakipte sade görünüm |
| **Krallık kaleleri ve binaları** (castle, farm, lumberCamp, mine, forge × 4 krallık; tam ve yarı çözünürlük) | **AI** | `scene/KingdomSprites.ts`, `art/kingdoms`, `art/kingdoms-half` |
| Krallık sur taşı rengi, köşe kuleleri, bina dumanları | KOD (AI görsellerden türetilir) | `KingdomSprites.stoneSheet`, `Chimneys.ts`, `WallRing` |
| Sur yükseltisi (Tilemap_Elevation), tabela (Signpost) | CC0 (TS eski paket) | `assets.ts`, `client/public/cc0/` |
| Zemin (Tilemap_color1), su, köpük, su kayaları | TS | `Terrain.ts`, `style.css` |

### Orman
| Görsel | Kaynak | Yer |
|---|---|---|
| **Köy, küçük kamp, büyük kamp, sandık** (dolu hâller; boş hâller koddan türetilir) | **AI** | `scene/ForestSprites.ts`, `art/forest` |
| Haydut askerleri | TS Black | `Sites.ts` |
| **Harita süsleri** (meşe, çam, koyu çam, böğürtlen, çiçek, taşlar, kütük, tabela, ayrıca detaylar: köprü, kamp ateşi, araba, tarla, mantar, gölet, taş, kule, kuyu) | **AI** | `scene/MapProps.ts`, `art/props` |

### Arayüz
| Görsel | Kaynak | Yer |
|---|---|---|
| Simgeler (yemek, odun, demir, altın, çekiç, kılıçlar, kalkan, çark, nüfus, kum saati, kalp, gözcü, ulak, kafatası, sandık, taç) | **AI** | `ui/kf-art.css` `.ico-*`, `art/ui/icons` |
| Panel çerçevesi (9-slice), mini harita çerçevesi | **AI** | `kf-art.css`, `art/ui/panel-frame*`, `minimap-frame*` |
| Deste kartı ön/arka | **AI** | `kf-art.css`, `art/ui/card-*` |
| Krallık amblemleri (4) | **AI** | `ui/emblem.ts`, `art/ui/emblems` |
| Logo | **AI** | `screens.ts`, `art/ui/logo*.png` |
| Zafer / yenilgi resmi | **AI** | `screens.ts` (`showEndArt`), `art/ui/victory*`, `defeat*` |
| Lobi arka planı | **AI** | `ui/scenery.ts`, `art/ui/lobby-bg.jpg` |
| Oyuncu avatarları (Avatars_01–25) | TS | `ui/topbar.ts`, `ui/enemy-window.ts` |
| Düğme/şerit/kâğıt/tahta parçaları (UI Elements) | TS | `ui/sprites.ts`, `ui.css` |
| Birim portreleri (deste kartı) | TS (kırpılmış) | `ui/portraits.ts`, `ui.css` `.unit-*` |
| Altın taşı (kaynak simgesi) | TS | `ui.css` |

### Ses (görsel değil, değişmez)
`client/public/audio` (CC0: Kenney, RandomMind).

### Kaldırılacak AI klasörleri (6. adım)
`client/public/art/kingdoms`, `kingdoms-half`, `forest`, `props`, `horse`, `ui` (ikonlar, emblemler, çerçeveler, kartlar, logo, zafer/yenilgi, lobi arka planı), `art/mancinik.png`.
İlgili kod: `KingdomSprites.ts`, `ForestSprites.ts`, `MapProps.ts`, `HorseArt.ts`, `CatapultArt.ts`, `ui/emblem.ts`, `kf-art.css`, `tools/art-clean*`, `tools/art-ui.mjs`.

---

## 2. Warfare paketi (satın alındı) — içerik

Yol: `client/public/assets/Warfare_001/Warfare/` (yeniden adlandırılmadı). Her birimde **Blue, Red, Yellow, Purple, Black** renk klasörleri var: **recolor gerekmiyor**, renk = oyuncu doğrudan gelir (siyah = haydut/tarafsız).

| Klasör | Kare | Animasyonlar (kare sayısı) | Not |
|---|---|---|---|
| Swordsman | 320×320 | Idle 13, Run 8, Attack 12 | Uzun kılıçlı miğferli ağır piyade; Avatar 1–5 (256) |
| Horseman | 320×320 | Idle 8, Run 6, Attack 9 | Atlı mızraklı; Avatar 1–5 |
| Catapult | 256×256 | Idle 1, IdleWithStone 1, LoadStone 4, FireStone 9, Move 4, MoveWithStone 4 | Kuşatma makinesi (tekerlekli); renk tekerlek/çerçevede; Avatar 1–5 |
| Catapult/Stone Projectile | 128×128 | Stone_Idle 1, Stone_Spinning 4, Projectile (12 karelik sayfa) | Taş mermisi; renksiz |
| King | 192×192 | Idle 8, Run 6, Attack 7 | Taçlı kral, kalkan + gürz; renk kalkan/pelerinde; Avatar 1–5 |
| Berserker | 192×192 | Idle 8, Run 4, Attack 7 | Çift baltalı; **şimdilik kullanılmıyor** (8. birlik adayı) |

Yeni sürüm (`tiny-swords-new`) yok; şimdilik Free Pack + Warfare. Free Pack'in içeriği (Units, Buildings, Terrain, Particle FX, UI Elements) `scene/assets.ts` zaten kullanıyor; UI Elements içinden henüz kullanılmayanlar: Banners, Bars, Papers (Regular/Special), Ribbons (Big/Small + mağaza sayfasındaki 5 renk), Swords, Wood Table, 12 simge (Icon_01–12), 4 imleç, 25 avatar.

---

## 3. Birlik eşlemesi (karar: 2026-11-05)

| Birlik | Yeni görsel | Paket | Kare | Eski |
|---|---|---|---|---|
| Okçu | Archer | TS | 192 | aynı |
| Mızrakçı | Lancer | TS | 320 | aynı |
| Keşiş | Monk | TS | 192 | aynı |
| **Kalkanlı** | Warrior (Guard bekleme; Idle/Run/Attack1) | TS | 192 | Warrior_Guard (Kılıçlı ile aynı gövde) |
| **Kılıçlı** | Swordsman | WF | 320 | Warrior |
| **Süvari** | Horseman | WF | 320 | Lancer + AI at |
| **Mancınık** | Catapult (+ Stone Projectile) | WF | 256 | AI mancınık |
| Lord (birlik değil) | King | WF | 192 | yok |
| Berserker | kullanılmıyor | WF | 192 | — |

**Lord (King):** her kalenin kapısında durur, savunma savaşında görünür, kale düşünce düşme animasyonu. Yalnız istemci görseli, denge etkisi yok, sunucuya dokunulmaz.

Önizleme: `art/shots/gorsel-gecis/eslesme.png` (5 renk × 9 görsel), `olcek.png` (oyun ölçeği yan yana). Git'e girmez.

### Ölçek ve animasyon notları (kodlamadan önce ele alınacak)
- Oyun bugün her birimi `UNIT_SCALE` 0,55'te çiziyor. Warfare'ın 320 px karelerindeki gövdeler Free Pack'ten **daha iri**: Kılıçlı, Okçu/Mızrakçı'dan belirgin büyük, Süvari ve özellikle **Mancınık (256 px, geniş)** 0,55'te devasa kalıyor. Öneri: Kılıçlı ≈0,48–0,5, Süvari ≈0,48, Mancınık ≈0,36–0,4; Kalkanlı `SHIELD_SCALE` (×1,18) artık gerekmeyebilir (Warrior Guard zaten iri). Kodlarken yan yana ekran görüntüsüyle ayarlanır.
- Kalkanlı Warrior'ın Guard dizisi var, ama saldırı (Attack1/2) ve koşu (Run) kareleri Kılıçlı'nınkiyle aynı gövdeden geliyordu; artık Kılıçlı Swordsman olduğu için ikisi ayrışır (kılıç yok, kalkan + gürz görünümü Guard'dan).
- Mancınığın "iki hedefe sıçrar / kuşanırken 2 işçi" kuralları sunucuda; yalnız çizim değişir: Idle/Move/LoadStone/FireStone + taş mermisi uçuşu. Mevcut `CatapultArt.ts` animasyon anahtarları (`mancinik-idle/run/fire`) korunur.
- Süvari: `NewUnits.ts` Lancer'dan binici birleştirme ve AI at kalkar; Horseman Idle/Run/Attack doğrudan. `suvari-idle/run/attack` anahtarları korunur.
- Haydut siyahı: Warfare'da da Black var (Swordsman, Horseman, Catapult, King); orman yerleri Free Pack Black Units kullanmaya devam eder.
- Eşleşmeyen ya da sorulacak bir şey çıkmadı: 7 birliğin hepsinin karşılığı var. Tek çekince yukarıdaki ölçek ayarı.

---

## 4. Uygulandı (2026-11-05, adım 2 kodu)

- Birimler artık Warfare/Free Pack sayfalarından yüklenir (`scene/assets.ts`, yol öneki `@wf/`); anahtarlar aynı kaldı (`suvari-*`, `mancinik-*`, yeni `swordsman-*`, `lord-*`). Kılıçlı = Swordsman, Kalkanlı = Warrior (Guard), Süvari = Horseman, Mancınık = Catapult + Stone_Idle mermisi.
- Ölçekler (`unitScale`): piyadeler 0,55; Kılıçlı 0,46 (gövdesi daha iri); Süvari 0,50; Mancınık 0,48 (piyadenin ~1,6–2 katı); Kalkanlı ×1,18 büyütmesi kaldırıldı.
- AI at (`HorseArt.ts`, `art/horse`) ve AI mancınık (`CatapultArt.ts`, `art/mancinik.png`) ile kodla çizilen mancınık (`PixelArt.catapult`) silindi.
- Lord (King): `scene/Lord.ts`; kendi kalenin kapısında ve izleyicinin gördüğü kalelerde (`RegionDisplay`) durur, kuşatmada gürzünü savurur, kale düşünce devrilir. Yalnız istemci.
- Eski araçlar `tools/shot-horse.mjs`, `shot-catapult.mjs`, `shot-compare.mjs` kaldırılan dosyalara bakar: 6. adımda silinecek.
- Adım 3 (kale içi zemin): `scene/CourtyardFloor.ts`, kodla boyanan toprak + taş döşeme + fıçı/sandık (kodla) + Free Pack kaya/odun yığını + çit.
- Adım 4 (orman yerleri): `Sites.ts` artık siyah Free Pack binalarından kurar: köy = 3 siyah ev (yağmalanınca kararır, yanar), haydut kampı = siyah kule + kamp ateşi + haydutlar, büyük kamp = siyah kale + iki ateş + haydutlar, sandık = kodla çizilen sandık (Free Pack'te yok) + altın taşları (boşken açık ve boş). Kamp ateşi evdeki ateşle aynı (`campfire`). `ForestSprites.ts` yalnız sandık dokusunu üretir; `art/forest` kullanılmıyor (6. adımda silinecek).
- Adım 5 (arayüz): `ui/tiny-ui.ts` açılışta Papers/SpecialPaper/WoodTable'ı 9 dilime keser (CSS değişkenleri `--kf-paper-9`, `--kf-special-9`, `--kf-wood-9`); `kf-art.css` bunları panel, üst şerit, deste kartı ve mini harita çerçevesinde kullanır (paket yoksa theme.css'in çizili çerçeveleri kalır). Simgeler: pakette olanlar (et, odun, altın, çekiç, kılıç, kalkan, çark) paketten, olmayanlar (demir, nüfus, kum saati, kalp, gözcü, ulak, kafatası, sandık, taç) koddan ızgarayla. Krallık amblemleri 4 kalkan + sembol (koddan). Zafer/yenilgi resmi `endArt`: oyuncunun kalesi + lord (yenilgide gri, yanan kale, devrik lord). Lobi arka planı `ui/scenery.ts`: oyunun çim karosu, ağaç, çalı, kaya, yol ve dört kale (Free Pack'ten, açılışta kurulur). Logo iki seçenek: A (varsayılan, mavi kale + yazı), B (ahşap levha + kılıç/kalkan; `?logo=b` ya da `localStorage keepfall_logo=b`).
- `art/ui` ve `art/forest` artık hiçbir yerden yüklenmiyor; `art/kingdoms*` (krallık kale/bina görselleri) ve `art/props` (harita süsleri) hâlâ yükleniyor. Dördü de 6. adımda ele alınacak.
