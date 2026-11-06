# Hazırlık sıkıştırma (2026-11-06 gece)

Aynı kararlar, daha kısa süre: hazırlık 8 dk → **5 dk** (varsayılan, dev dalında). 4 dk denenebilir.

## Nasıl çalışıyor
- `config/balance.json` → `match.prepSpeed` (çarpan, varsayılan 1 = eski). Hazırlık sırasında **kalenin ekonomisi** (üretim, demirci, kuşanma, bina yükseltme, nüfus artışı; hepsi `Castle.Tick` içinde) saatten `prepSpeed` kat hızlı işler; saat gerçek hızda akar. Savaş aşamasında çarpan yok.
- 8 dk → 5 dk için 8/5 = **1,6**. Ayar: `shortModeMinutes 15` (5 + 10 savaş), `shortModePrepMinutes 5`, `prepSpeed 1.6`; uzun mod aynı oranla (`longModeMinutes 22.5`, `longModePrepMinutes 12.5`).
- Dokunulmayanlar: yürüme hızları (gözcü, ordu), savaş süresi ve simülasyonu, kıtlık, gizli bilgi kuralları.
- Oranla ölçeklenenler: "son 60 sn gözcü yok" kuralı → `noScoutLastPrepSeconds 37.5`; botların düşünme aralığı hazırlıkta `prepSpeed`'e bölünür (`Bot.Think`); botların hazırlık zamanlamaları zaten hazırlık oranına (`PrepProgress`) bağlı. Rehberli maç ve ipuçları oyunun kendi durumuna ve `prepSeconds`'e bağlı olduğu için ayrıca değişmedi.
- Kodda: `GameState` yalnız "standart hazırlık" (süre verilmemiş ya da kipin kendi süresi) için çarpanı uygular; testlerin/araçların kendi verdiği süre düz ekonomi kalır.
- 4 dk için: `shortModeMinutes 14`, `shortModePrepMinutes 4`, `prepSpeed 2.0`, `noScoutLastPrepSeconds 30`.
- Geri dönmek tek satır: `prepSpeed 1`, `shortModeMinutes 18`, `shortModePrepMinutes 8`, `longModeMinutes 30`, `longModePrepMinutes 20`, `noScoutLastPrepSeconds 60`.

## Ölçüm 1: hazırlık sonunda kale (bot vs bot, her zorlukta 40 maç, 2 bot)
`dotnet run -c Release --project src/BattleSim -- hazirlik --mac 40 --config <ayar>`

| Süre / hız | Zorluk | Asker | Silah (depoda) | Bina düzeyi (4 bina) | Yemek | Odun | Demir | Nüfus | Boşta işçi | Boşta geçen (işçi·dk) |
|---|---|---|---|---|---|---|---|---|---|---|
| **8 dk ×1** | Kolay | 8,5 | 1,6 | 11,0 | 82 | 52 | 57 | 31,9 | 0,7 | 7,0 |
| | Orta | 20,1 | 0,8 | 10,4 | 104 | 46 | 62 | 37,3 | 0,2 | 3,4 |
| | Zor | 10,1 | 5,1 | 10,6 | 83 | 40 | 41 | 33,7 | 0,3 | 2,8 |
| **5 dk ×1,6** (botlar hızlı düşünür) | Kolay | 9,4 | 1,4 | 10,7 | 84 | 37 | 58 | 34,1 | 0,5 | 4,7 |
| | Orta | 16,4 | 1,2 | 10,1 | 93 | 33 | 51 | 34,6 | 0,2 | 1,9 |
| | Zor | 8,2 | 5,9 | 10,4 | 76 | 26 | 44 | 32,2 | 0,2 | 1,1 |
| **4 dk ×2,0** (botlar hızlı düşünür) | Kolay | 10,3 | 1,1 | 10,7 | 82 | 42 | 64 | 34,3 | 0,6 | 3,9 |
| | Orta | 15,3 | 0,3 | 10,2 | 94 | 33 | 56 | 33,7 | 0,3 | 1,9 |
| | Zor | 4,0 | 10,4 | 10,0 | 78 | 11 | 47 | 32,6 | 1,8 | 1,6 |

Okuma: bina düzeyi, stok ve nüfus ±%10 içinde (5 dk). **Asker sayısı 5 dk'da Orta'da −%18, Zor'da −%19** (silahlar depoda kaldığı için asker+silah toplamı Zor'da −%7, Orta'da −%16); Kolay +%10. 4 dk'da Zor belirgin bozuluyor (asker 4, silah 10: silahı askere çevirecek zaman yetmiyor). **Öneri: 5 dk / ×1,6.** Botlar hızlı düşünmeseydi (ilk deneme) 5 dk'da Orta 15,9, Zor 7,9 asker idi; hızlı düşünme Kolay ve Zor'u biraz düzeltti, Orta'yı değil.
"Boşta geçen" hazırlık boyunca boşta işçi-dakika: sıkışınca azalıyor (insan için "yapacak bir şey yok" süresinin üst sınırı: işçiler boşta kalmıyor; asıl "boşluk" bekleme ve ekonominin dolmasında, ölçülemedi).

## Ölçüm 2: bot kazanma oranları (80 maç, `BattleSim bot --mac 80`)
Ham çıktı: `docs/gece/hazirlik-bot-*.txt`.

| | 8 dk ×1 | 5 dk ×1,6 |
|---|---|---|
| Orta vs Kolay (karışık): Orta payı | %83,1 (Kolay %16,9) | %82,5 (Kolay %17,5) |
| Orta'nın Kolay'a oranı (koltuk başına) | 4,9× | 4,7× |
| Zor vs Orta: Zor payı | **%58,8** | **%48,8** |
| Elemeyle biten maç | %83,8 (karışık), %40,0 (zor-orta) | %78,8, %51,3 |
| Ort. maç süresi (oyun dk) | 11,9 / 16,0 | 10,6 / 12,2 |
| Işınlanma ihlali | 0 | 0 |

**Dikkat:** Orta/Kolay dengesi korundu (hedef %70–80 aralığının üstünde zaten; değişmedi). **Zor vs Orta %59 → %49 düştü**: Zor bot silahı depoda tutuyor ve hazırlık kısalınca onu askere çevirmeye yetişemiyor. Zor'un zaten hedefin (%75–85) altında olduğunu biliyorsun; bunu düzeltmek ayrı bir bot turu ister (ör. Zor'un hazırlık sonuna doğru depodaki silahı askere çevirmesi). Dokunulmadı.

## Eren için karar noktaları
1. 5 dk / ×1,6 varsayılan mı kalsın (öneri), 4 dk mı denensin? Karar: Eren 5 dk'yı kendisi ve hiç oynamamış bir arkadaşıyla oynayarak verecek (dev sunucu 5090).
2. Zor bot düzeltmesi yapılsın mı?
3. Rehberli maç gerçek hızda (x1) 5 dk hazırlıkla: bkz. `docs/gece-raporu.md` testleri.

## Düzeltme: asker açığı (2026-11-06)
**Sebep:** çarpan yalnız `Castle.Tick` içindeydi; ormana yürüyen **gözcüler** (sandık/köy altını) ve **ordular** (kamp yağması) gerçek hızda yürüyordu. Hazırlık 5 dk'ya inince orman gezileri ekonomiye göre 1,6 kat az iş gördü: Orta'da kiralık asker 8,0 → 5,9, Zor'da kasadaki altın 158 → 104; geç yola çıkan yağma orduları hazırlık bitince hâlâ dışarıdaydı (seyri, `hazirlik` komutunun "Orta botun hazırlık seyri" tablosu: %80'de yeni hız önde, son %15'te eski 12 birim kazanırken yeni 4). Demirhane, kuşanma, işçi→asker dönüşümü ve bot zamanlaması sorun DEĞİLDİ (hepsi çarpanla ölçekleniyor).
**Düzeltme:** `GameState.ScoutSpeedNow/ArmySpeedNow`: standart hazırlıkta gözcü ve ordu hızı `prepSpeed` kat (yola çıkarken sabitlenir; ETA'lar `SecondsLeft`/`ScoutSeconds`/`MarchSeconds` da buna göre). Savaşta çarpan yok. Hiçbir `balance.json` sayısı değişmedi. `CheckContinuity` payı çarpanla genişledi (ışınlanma ihlali 0).

| 40 maç, 2 bot | 8 dk ×1 | 5 dk ×1,6 (önce) | 5 dk ×1,6 (sonra) |
|---|---|---|---|
| Orta asker (+silah) | 20,1 (0,8) | 16,4 (1,2) | **19,5 (0,6)** |
| Orta paralı | 8,0 | 5,9 | 7,7 |
| Orta nüfus / bina / demir | 37,3 / 10,4 / 62 | 34,6 / 10,1 / 51 | 37,7 / 10,2 / 62 |
| Zor asker (silah depoda) | 10,1 (5,1) | 8,2 (5,9) | 8,2 (7,4) |
| Zor asker+silah | 15,2 | 14,1 | 15,6 |
| Zor altın | 158 | 104 | 153 |
| Kolay asker | 8,5 | 9,4 | 9,6 |

Zor'un "Asker" sütunu hâlâ −%19: Zor silahı bilerek savaş başına kadar depoda tutar (`holdWeapons`); asker+silah toplamı eski hazırlıkla aynı (+%3).
**Bot kazanma (200 maç, `docs/gece/hazirlik-duzelt-*.txt`)**: Zor vs Orta Zor payı **%65,5** (8 dk ×1: %58,8 [80 maç], düzeltmeden önce %48,8); Orta vs Kolay Orta payı %86,8 (öncesi 82–83, Kolay'a göre 6,5×). Işınlanma ihlali 0. Zor'un hedefin (%75–85) altında olduğu eskisi gibi; şimdi 8 dk'dan biraz üstünde (hata payı ±3,4 puan).

## Kontrol: savaş başlayınca yoldakiler (2026-11-06)
Açık vardı: hazırlıkta yola çıkan gözcü/ulak/ordu hızı yola çıkarken sabitlendiği için savaş başladıktan sonra da `prepSpeed` hızında yürümeye devam ediyordu (ör. hazırlığın son saniyelerinde çıkan ulak, ya da kampa giden ordu). Düzeltme: hazırlık→savaş geçişinde (`GameState.SlowToWarPace`) yoldaki her gözcü/ulak ve ordunun (gidiş ve dönüş ayağı) hızı normale döner; kalan süre (`SecondsLeft`/ETA) buna göre yeniden hesaplanır. Kat edilen yol aynı kalır. Test: `Whoever_is_on_the_road_when_the_war_begins_walks_at_the_normal_speed_from_then_on` (WarTests; ulak hazırlığın 295. sn'sinde çıkar, 300'de savaş başlar: hız ×1,6 → ×1, ETA normal hızdan, süreklilik ihlali 0). 283/283 test.
