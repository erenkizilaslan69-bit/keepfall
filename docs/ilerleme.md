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
