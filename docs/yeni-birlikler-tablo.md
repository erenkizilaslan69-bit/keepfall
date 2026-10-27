# Yeni birlikler ve deste: ölçüm özeti (2026-10-28)

Son sayılar `config/balance.json` `units`, `counters`, `deck`, `bots.decks`. Ham tablolar: `yeni-birlikler-deste-tur1..4.md`, `yeni-birlikler-deste-son.md`, `gece/yeni*-*.txt`.

## Birim düzeyi (BattleSim denge, eşit kişi, rastgele ordular, 4000 maç)
| Birim | Asker başı kazanma | Baskın ordu kazanma |
|---|---:|---:|
| Okçu | %45 | %40 |
| Kılıçlı | %58 | %71 |
| Mızrakçı | %58 | %68 |
| Kalkanlı | %52 | %52 |
| Keşiş | %26 | %3 (destek birimi: tek başına anlamsız) |
| Mancınık | %55 | %62 |
| Süvari | %56 | %56 |

(Bu ölçüm Okçu hasarı 10, Keşiş iyileştirme 8 ile yapıldı; sonradan Okçu 9 ve Keşiş 6/tavan 90'a indi, deste turnuvasına göre.)

## Deste düzeyi (bot maçları, her deste ~100 maç, rastgele rakip deste)
Son tur: en iyi deste %61,2, en kötü %34,4; %58 üstü 6 deste (örnekleme hatası ~±5 puan: 35 deste arasında en yüksek %60 çıkması şans payı içinde). Hiçbir deste turlar arasında hep en iyi değil (tur 1-4: ilk 5 değişti), ama Okçu ilk 5'te her turda var (Okçu'yu içeren desteler ortalama %52, en kötüsü %36), Keşiş de çoğu turda. Kalibrasyonda Keşiş (iyileştirme 12 → 6, savaş başına tavan 90), Okçu (hasar 11 → 9), Kılıçlı, Mancınık, Süvari ayarlandı.

## Bot düzeyi (200 maç, 2 oyunculu)
Orta vs Orta eleme ile biten %47; Zor vs Orta Zor %59; Orta vs Kolay Orta %58,5 (Kolay rastgele deste seçer); yalnız bekleyen bot %8; ışınlanma ihlali 0; paralı payı savaş başında %20-25.

## Hız
Savaş simülatörü eski 4 birimli ve yeni birimli savaşlarda aynı hızda (20 savaş ~0,2 sn); bot maçı ~0,33 sn CPU. 600 sn sınırına takılan (berabere biten) savaş: 0 (ölçülen ~3000 maç). Uzun süren ilk turnuva (5950 maçlık tam eşleşme) aynı anda koşan diğer işlerle CPU'yu paylaştığı ve ilerleme göstermediği için uzadı; yerine `--deste-basi 50` örneklemi (~4 dk) kullanılıyor.
