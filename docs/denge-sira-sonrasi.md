# Denge: 1.–4. sıra düzeninden sonra ölçüm (2026-11-07)

Ölçüm `358cc7a` (savaş dizilimi 1.–4. sıra) sonrası `dev` ile yapıldı; **temiz karşılaştırma** için aynı araçlar, aynı tohum ve aynı `balance.json` ile bir önceki commit (`358cc7a^`) de ölçüldü. CLAUDE.md'deki eski sayılar (28 Ekim) hazırlık sıkıştırma, Zor bot ayarı vb. yüzünden zaten eskimişti; bu yüzden "ESKİ" sütunu **bugün yeniden ölçülen sıra-öncesi** değerdir. Ham çıktılar: `docs/gece/sira/`.

`config/balance.json`'a dokunulmadı. Önerilerin hepsi "onay bekliyor".

## 0. Sıra kuralı (ölçümün anlamı)
Her birliğe ayrı sıra (1.–4.), aynı sıraya iki tür giremez. Yakın dövüşçü yalnız **en önde yaşayan sıradan** vurur (arkadakiler yedek bekler); herkes (yakın birlik ve okçu) yalnız **en öndeki yaşayan sıradaki** düşmana vurur. Sonuç: destesinde tek yakın birlik + 3 arka birlik (okçu/keşiş/mancınık/süvari) olan ordu, 3 türü birden dokunulmaz ve hep çalışır tutar; üç yakın birlikli deste ise ancak ön sıra ölünce ikinci türünü kullanır.

**Botlar sıra seçmez** (komutlarında `Rows` yok, `ArmySetup.BuildLayout` varsayılanı: dövüşenler önde, arkadakiler sonra, tür indeksi sırasıyla). Etkisi: bot ordularındaki yakın birlikler 1.–3. sıraya dizilir ve ilk sıra ölmeden yalnız biri vurur; insan bunu bilerek değiştirebilir, bot değiştiremez. Bot sonuçları bu yüzden "varsayılan dizilim" sonuçlarıdır; insanın akıllı dizilimi botu bir miktar daha geriye iter (ölçülmedi).

## 1. Birim düzeyi (`BattleSim denge --mac 3000`, eşit kişi, rastgele ordular)
| Birim | Asker başı kazanma ESKİ → YENİ | Baskın ordu kazanma ESKİ → YENİ |
|---|---:|---:|
| Okçu | %42,1 → **%52,5** | %36,9 → %55,5 |
| Kılıçlı | %61,3 → %52,9 | %78,2 → %74,4 |
| Mızrakçı | %58,6 → %49,3 | %73,0 → %69,6 |
| Kalkanlı | %53,9 → %47,7 | %61,0 → %61,0 |
| Keşiş | %25,5 → %32,8 | %5,1 → %9,8 |
| Mancınık | %53,4 → **%66,0** (rapor "FAZLA GÜÇLÜ") | %60,9 → **%82,0** |
| Süvari | %55,6 → %49,4 | %59,2 → %62,3 |

Tek tür düelloları (10'a 10) değişmedi (tek sıra, kural etkisiz).

## 2. Deste turnuvası (`deste --deste-basi 50`, 35 deste, Orta bot, 1750 maç)
Hata payı: deste başına ~50 maç → tek bir destenin kazanma payı için ±7 puan (1 sapma). Birim ortalamaları (20 deste × ~50 maç) için ±1,6 puan. Tek tek desteleri değil, **dağılımın genişliğini ve birim ortalamalarını** okuyun.

| | ESKİ (sıra öncesi) | YENİ (şimdi) |
|---|---:|---:|
| En iyi deste | %63,1 | **%73,3** (Okçu+Mızrakçı+Kalkanlı+Keşiş) |
| En kötü deste | %32,8 | %26,5 (Kılıçlı+Kalkanlı+Mancınık+Süvari) |
| Standart sapma (35 deste) | 7,6 | **12,4** |
| %58 üstü / %42 altı deste sayısı | 6 / 6 | **10 / 10** |
| Okçulu desteler ortalaması | %52,6 | **%58,2** (en iyi 5'in 5'i Okçulu) |
| Keşişli desteler ortalaması | %49,2 | %52,2 |
| Mancınıklı / Süvarili / Kılıçlı | %45,6 / %50,7 / %49,9 | %48,6 / %46,2 / %47,0 |

(CLAUDE.md'deki "en iyi %61,2 / en kötü %34,4 / Okçulu ort. ~%52" sıra öncesiyle uyumlu: %63,1 / %32,8 / %52,6.)

**Kayan şey:** deste dağılımı genişledi (sd 7,6 → 12,4). Kazanan desteler "bir yakın birlik + üç arka birlik" biçiminde (ör. Okçu+Kalkanlı+Keşiş+Mancınık ≈ %72–79 her varyantta); kaybedenler çoğunlukla üç yakın birlikli desteler. Okçu yine ilk 5'te, ama asıl sebep okçuya sayı değil **arkada dokunulmaz olmak**.

## 3. Botlar (`bot --mac 400`, tohum 1, 15 dk modu)
| Ölçüt | CLAUDE.md (28 Eki) | ESKİ (bugün, sıra öncesi) | YENİ |
|---|---:|---:|---:|
| Orta vs Kolay (`karisik`), Orta kazanma | %71–75 | %79,4 | **%80,4** |
| Yalnız bekleyen botun kazanması (`bekleyen`) | %13 | %5,8 | %2,5 |
| Orta vs Orta, elemeyle biten | – | %26,5 | %24,0 |
| Zor vs Orta (`zor-orta`), Zor kazanma | %59 | %63,5 | **%70,1** |
| Işınlanma ihlali | 0 | 0 | 0 |

Sıra kuralı bot dengesini az etkiledi: Orta vs Kolay ≈ aynı (+1), bekleyen bot biraz daha az kazanıyor, **Zor vs Orta +6,6 puan** (Zor'un karşı birim seçimi arka birliklerden daha çok yararlanıyor). Orta vs Kolay hedefi (%70–80) üst sınırı aştı (%80,4), ama sıra öncesi de %79,4 idi; CLAUDE.md'deki %71–75, hazırlık sıkıştırma ve ince ayar turlarında kaymıştı. Zor vs Orta hedefe (%75–85) yaklaştı.

## 4. Öneriler (hepsi onay bekliyor; `balance.json` DEĞİŞMEDİ)
Denenen varyantlar (aynı tohum; geçici config `--config`):

| Varyant | En iyi / en kötü deste | sd | %58↑ / %42↓ | Okçulu ort. | Mancınık (birim) |
|---|---|---:|---|---:|---:|
| 0 şimdiki | %73,3 / %26,5 | 12,4 | 10 / 10 | %58,2 | %66,0 |
| B okçu hasar 9→7,5 | %77,2 / %33,5 | 10,3 | 6 / 9 | %54,9 | – |
| C okçu can 68→60, hasar 8 | %79,1 / %32,0 | 11,1 | 9 / 10 | %55,8 | – |
| E atışlar 2 sıraya ulaşır (kod) | %73,3 / %32,0 | 11,9 | 8 / 11 | %57,7 | – |
| **A yakın birlik 2 sıradan vurur (kod)** | %72,3 / %36,1 | **8,4** | **4 / 6** | **%52,6** | %57,9 |
| D = A + okçu hasar 9→8 | %68,9 / %34,2 | 8,4 | 8 / 7 | %53,8 | %58,0 |
| F = A + E | %66,7 / %22,5 | 10,1 | 9 / 6 | %55,0 | – |

**Bulgu:** yalnız okçu sayıları (B, C) ya da atış menzili (E) dağılımı düzeltmiyor; en iyi deste hâlâ %73–79. Asıl düzelten, **ikinci sıradaki yakın dövüşçünün de vurması** (A): sd 12,4 → 8,4 (eski 7,6'ya yakın), Okçulu ortalama %58,2 → %52,6 (eskiyle aynı), Mancınık %66 → %57,9. Birim düzeyi A ile: Okçu %47,7, Kılıçlı %56,3, Mızrakçı %56,1, Kalkanlı %52,2, Keşiş %28,3, Mancınık %57,9, Süvari %51,9.

Bot etkisi (A / D, 400 maç): Orta vs Kolay %76,8 / %80,3, bekleyen %1,8 / %2,5, Zor vs Orta %69,9 / %70,0 (değişmez).

### Öneri 1 — ana öneri (kural, sayı yok): `combat.meleeActiveRows: 2`
- Yeni ayar anahtarı bu işte koda eklendi (varsayılan `1` = bugünkü davranış; balance.json'da YOK). `2`: yaşayan ilk iki sıranın yakın birlikleri vurur; hedef yine yalnız en öndeki sıradır.
- Tablo: A satırı. Deste dağılımı sıra öncesine dönüyor, Okçu/Mancınık şişkinliği iniyor, hiçbir birim sayısı değişmiyor.
- **Açmadan önce:** savaş oynatması (`BattleRecord`, istemci `BattlePlayer`) ikinci sıranın vurmasını göstermiyor (yalnız "ön sıraya geçti" olayı var). Oynatmada ikinci sıradaki yakın dövüşçü de vurmalı; bu ayrı bir istemci parçası. Sunucu sonucu zaten doğru hesaplar.

### Öneri 2 — seçenek: Öneri 1 + okçu hasarı 9 → 8
- D satırı. En iyi deste %68,9'a iner ama %58 üstü deste sayısı 4 → 8 çıkar, Okçu birim düzeyi %44,1'e düşer. A tek başına daha dengeli; yalnız A sonrası Okçu hâlâ ilk 5'te kalırsa düşünülmeli.

### Öneri 3 — yapma: yalnız okçu sayıları (B, C)
- Kötü: en iyi deste %77–79'a çıkıyor, sd düşmüyor; sebep sayı değil sıra kuralı.

### Ayrı notlar (kodlanmadı)
- Mancınık şişkinliği (%66) Öneri 1 ile %58'e iniyor, ek kural gerekmiyor.
- Botlara sıra seçtirmek (okçuyu arkaya, kalkanlıyı öne) ayrı bir bot işi; Zor'un +6,6'sı ve insan avantajı için istenirse sonra.

## 5. Yöntem
`dotnet src/BattleSim/bin/Release/net10.0/BattleSim.dll denge --mac 3000`; `bot --mac 400 --zorluk karisik|bekleyen|orta|zor-orta`; `deste --deste-basi 50 --cikti …`. Varyant config'leri `balance.json` kopyasında `"combat": { "meleeActiveRows": 2 }` (A, D, F), `"rangedReachRows": 2` (E, F; yalnız bu ölçümde kullanılan deneme anahtarı, varsayılan 1) ve okçu `hp/damage` satırı. ESKİ: `git worktree` ile `358cc7a^`, aynı `balance.json`.

## Uygulandı (2026-11-07): `combat.meleeActiveRows: 2`
Kullanıcı onayladı ("patron sensin, nasıl daha iyi olacaksa öyle yap"); `config/balance.json`'a eklendi. Oynatma da ikinci sıra yakın dövüşçüsünü (ilk sıranın hemen arkasına yaklaşır, vurur) gösteriyor (`BattlePlayer.ts`, `ACTIVE_MELEE_ROWS`).
Yeniden ölçüm (ham: `docs/gece/sira2-*.txt`): deste turnuvası (35 deste × ~50 maç) sd 9,2 (önce 12,4), en iyi %75,0 / en kötü %33,8, %58↑ 6 deste, Okçulu ortalama %54,1; Orta vs Kolay %76,8; yalnız bekleyen bot %1,8; Zor vs Orta %69,9. Tek deste ±7 puan gürültülü; en iyi %75 bu gürültüden olabilir, sd belirgin düştü.
**Öneri 2 (okçu hasarı 8) uygulanmadı**: tabloda %58↑ deste sayısını 4→8 çıkarıyordu. Okçu hâlâ en iyi 5'te; bir sonraki ayar turunda izle.
