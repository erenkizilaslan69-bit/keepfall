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
