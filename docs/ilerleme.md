# İlerleme, ustalık, kozmetik (Steam planı Aşama C, 2026-11-07)

Liste ve koşullar: `docs/basarimlar.md`.

## Mimari
- **Sunucu** (`Keepfall.Core/Progress`): `Achievements.FactsOf(room, player)` biten maçtan düz sayıları çıkarır (`MatchFacts`), `Achievements.Evaluate` kuralları uygular (22 kimlik). `MatchPush.End` her insana yalnız kendine `ProgressResult {kingdom, won, lesson, earned[]}` yollar (krallığını kendi bilir). Sunucu geçmiş tutmaz.
- **İstemci**: `progress/store.ts` soyut `ProgressStore` (`load/save`, `LocalProgressStore` = `keepfall_progress_v1`, sürümlü, `sanitize` bozuk veriyi atar). **Aşama F'de** Steamworks (istatistik, başarım, bulut kaydı) bu arayüzü uygulayıp `setProgressStore` ile takar; oyun koduna dokunulmaz. `progress/catalog.ts`: başarım adları, geçmişe bağlı 8 başarım (`META`), ustalık eşikleri, kozmetik listesi, `recordMatch/recordMeta`.
- **Kozmetik** yalnız görünüştür; hiçbir denge sayısı okumaz. Hub `SetCosmetics(frame, banners[])` (ayrı metot): sunucu **yalnız izin listesindeki kimlikleri** kabul eder (`Cosmetics`: bronze/silver/gold, kingdom:design), bilinmeyen tek kimlik tüm çağrıyı reddeder, istemci yalnız açtıklarını yollar. Açık mı kapalı mı denetimi şimdilik yerelde (Steam'de platformdan doğrulanabilir) — varsayım.
- **Gizlilik**: çerçeve herkese açık (lobi `PlayerView.Frame`, sonuç `RankView.Frame`); flama tasarımı krallığı ele verir, o yüzden **yalnız `Result` ile** (`RankView.Banner`, gerçek krallığa göre seçilmiş) maç bitince gider; kendi kalende her zaman asılı. Duman testi: geçersiz kimlikler reddedilir, çerçeve lobide görünür, sonuçtan önce hiçbir mesajda flama seçimi yok, `ProgressResult` yalnız sahibine gider.

## Arayüz
- Ana menü: "Başarımlar ve Ustalık" (ustalık kartları, çerçeve/flama seçici, 30 başarımın listesi).
- Maç sonu: "İlerleme" bloğu (oynanan krallığın ustalığı + çubuk, yeni başarımlar, yeni açılımlar). Meydan okuma yıldızları sonradan işlenirse geçmişe bağlı başarımlar bloğa eklenir.
- Çerçeve lobi ve maç sonu avatarında; flama maç sonu sıralamasında krallık amblemi yanında.
- Araç: `node tools/shot-progress.mjs <önek>` (Vite 5174 + sunucu; örnek kayıtla ekranlar, `art/shots/ilerleme/`).

## Varsayımlar / açık
- Ustalık eşikleri (1/5/15) ve çerçeve eşikleri (3/10/20 başarım) benim seçimim; sonradan `catalog.ts`'te tek yerden ayarlanır.
- Başarımlar yerelde, tarayıcıya bağlı: tarayıcı verisi silinirse gider (Steam'de bulut kaydıyla çözülür).
- Çok oyunculuda kozmetik seçimi odaya girerken bir kez yollanır; maç sırasında değişiklik sonraki odaya yansır.
- Rakibin kalesi/binalarında flama gösterilmez (krallık gizli).
- Telefon/dokunmatik ekranlarda yeni ekran sınanmadı.


---

# XP, seviye ve ödüller (2026-11-12)

Mevcut ilerleme sistemine (başarımlar, ustalık, çerçeve, flama) bağlandı; ikinci bir sistem yok. Kayıt aynı depoda (`ProgressStore`: yerel / Steam Cloud; `xp`, `moments`, `picks.title`, `picks.pattern` alanları eklendi, eski kayıtlar sıfırdan başlar gibi okunur).

## XP kaynakları (sunucu hesaplar: `Keepfall.Core/Progress/Xp.cs`)
| Kaynak | XP |
|---|---|
| Her maç (kaybetse de) | 40 |
| Galibiyet bonusu | +60 |
| Mod çarpanı (yalnız maç + galibiyet kısmına) | Hızlı ×1,0 · Standart ×1,4 · Uzun ×1,8 |
| Ders maçı (meydan okuma / başlangıç kipi) | 25 + galibiyette 40, mod çarpanı yok |
| Meydan okuma hedefi (geçilen her hedef) | +15 |
| Meydan okumayı ilk kez geçmek (istemci bilir) | +100 (günlük: +50) |

**Anlar** (her biri maçta en çok bir kez; maç SONUNDA kandırma günlüğünden ve oyuncunun kendi sayılarından):
`decoy` hayalet ordun hedefin görüşüne girdi/kapıya vardı +40 · `fake_report` sahte raporunu bir gözcü okudu +40 · `envoy_lie` başkasının adıyla ulak ulaştı, hiç maskesi düşmedi +40 · `disguise` başkasının adıyla ordu yürüttün, maske düşmedi +40 · `bribe` rüşvet +30 · `camp_rent` kamp kiraladın +20 · `village` köy yağmaladın +15 · `camp` kamp temizledin +15 · `felled` kale düşürdün +60 · `felled_triple` üç taraflı kuşatmada kale düşürdün +100 · `last_castle` son kale oldun (elemeyle, paylaşmadan) +80.
Maç sürerken hiçbir oyuncuya gizli bilgi gitmez: anlar yalnız maç bitince `ProgressResult.xp` ile o oyuncuya yollanır. Oyun içi görev takibi yalnız oyuncunun kendi sayılarını (`CastleView.stats`, kendi kalesi) okur.

## Seviye eğrisi (30 seviye)
Toplam XP = 80 · (seviye − 1)^1,42, ona yuvarlanır. İlk seviye ilk maçtan sonra (iyi bir maç 100 XP ≥ 80); ortalama maç ≈ 90–130 XP (Hızlı ~70, Uzun ~130, anlarla +40–100), son seviye ≈ 9 600 XP ≈ 80–100 maç ≈ 25–30 saat. Her adım bir öncekinden pahalı (testle denetlenir).

| Seviye | Toplam XP | Seviye | Toplam XP | Seviye | Toplam XP |
|---|---|---|---|---|---|
| 1 | 0 | 11 | 2100 | 21 | 5630 |
| 2 | 80 | 12 | 2410 | 22 | 6030 |
| 3 | 210 | 13 | 2730 | 23 | 6450 |
| 4 | 380 | 14 | 3050 | 24 | 6870 |
| 5 | 570 | 15 | 3390 | 25 | 7290 |
| 6 | 790 | 16 | 3740 | 26 | 7730 |
| 7 | 1020 | 17 | 4100 | 27 | 8170 |
| 8 | 1270 | 18 | 4470 | 28 | 8620 |
| 9 | 1530 | 19 | 4850 | 29 | 9080 |
| 10 | 1810 | 20 | 5240 | 30 | 9540 |

## Ödüller (yalnız görünüm; oyuna güç katmaz)
- **Unvanlar (13)**: seviyeyle — Yeni Komutan (1), Kale Bekçisi (5), Savaş Beyi (10), Ordu Komutanı (15), Büyük Mareşal (20), Keepfall Efendisi (30); anlarla — Hayalet Generali (`decoy` ×3 maç), Yalancı Kral (`fake_report` ×3), Maskeli Elçi (`envoy_lie` ×3), Altın Dilli (`bribe` ×3), Kale Yıkan (`felled` ×3), Üçlü Fatih (`felled_triple` ×1), Son Kale (`last_castle` ×3). Oyuncu birini seçer.
- **Sancak desenleri (8)**: Sade (1), Şeritli (3), Sırma (6), Haç (9), Baklava (13), Kurdeleli (17), Yıldızlı (22), Armalı (27). Oyuncunun KENDİ renginde, tuvalle çizilir (sanat dosyası yok, Free Pack türevi yok); hiçbir desen krallık adı/amblemi taşımaz, bu yüzden gizli krallık kuralı bozulmaz. Lobide, maç sonunda ve profilde görünür; kale üzerine çizilmez.
- **Seviye rozeti**: adın yanında "Sv N"; mevcut avatar çerçeveleri (başarım sayısıyla) olduğu gibi duruyor.

## Çok oyunculu ve güvenlik
Hub `SetProfile(unvan, seviye, desen)` (ayrı metot): yalnız bilinen unvan/desen kimlikleri ve 1–30 seviye kabul edilir, biri bile geçersizse tümü reddedilir (serbest metin yok). `PlayerView` / `RankView` Title, Level, Pattern taşır (herkese açık). **Sınır**: ilerleme istemci tarafında tutulduğu için sunucu seviyenin DOĞRU olduğunu doğrulayamaz (yalnız aralığı ve kimlikleri); hileci kendine yüksek seviye gösterebilir. Steam sürümünde bulut kaydı ve platform doğrulaması bunu kapatır; şimdilik yalnız görünümü etkiler. Testler: `XpTests`, duman testi (profil/mod/XP), `host-fuzz` (SetMode, SetProfile).

## Arayüz
- Ana menü → "Başarımlar ve Ustalık" ekranının başında **Profil** bölümü (seviye, XP çubuğu, unvan ve desen seçimi, kilitli ödüllerin nasıl açıldığı).
- Maç sonu: **Deneyim** bloğu (dökümü, seviye çubuğu dolma animasyonu, seviye atlama, açılan unvan/desen).
- Oyun içi **görev takibi**: köşede katlanabilir liste (J; Ayarlar > Oyun > "Görev takibini göster", Kontroller'de J), görev tamamlanınca "+XP" bildirimi. Meydan okumada o meydan okumanın hedefleri, normal maçta köy/kamp/kale (+ krallığa göre rüşvet/hayalet/kılık/rapor) görevleri.
- Araç: `node tools/shot-xp.mjs` (lobi satırı, profil, XP bloğu, görev listesi; EN+TR).

## Açık
- Seviye/unvan sahtekârlığı (yukarıda). Desen kale üzerinde çizilmedi. XP sayıları gerçek oyuncuyla ölçülmedi (eğri tahminim). Görev takibinde gözcü/hayalet gibi bazı görevler XP vermez (yalnız anlar verir); "kandır" anı gönderme değil görünme ister.
