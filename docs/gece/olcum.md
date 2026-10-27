# Gece ölçümü (2026-10-28): kale tek seferde düşer, esir, 10+10 dk, kıtlık 4. dk

BattleSim `bot --mac 200 --seed 11` (2 oyunculu, kısa mod 10+10 dk). Ham çıktılar: `tur1-*.txt`.

| Deney | Sonuç |
|---|---|
| Orta vs Orta | eleme ile biten %45,5 · ilk eleme savaştan 2,6 dk sonra · ort. maç 16,6 dk · saldırısız maç %2,5 |
| Zor vs Orta | **Zor kazanma %60** (hedef %70-85, altında) · eleme ile biten %63 · ilk eleme 4,5 dk · ort. maç 16,5 dk |
| Orta vs Kolay | Orta kazanma payı koltuk başına %67,3 (Kolay %32,8) · eleme ile biten %64 · ilk eleme 2,8 dk |
| Yalnız bekleyen Orta (ekonomi + savunma, hiç saldırmaz) vs Orta | **bekleyen kazanma %6** (elenen %69) → beklemek kazandırmıyor, hedef sağlandı |
| Işınlanma / süreklilik ihlali | **0** (tüm turlarda, 800 maç) |

Zor için ek deneme (200 maç, `zor-orta`): `bots.hard.garrisonShare` 0 → %61,8, 0,2 (şimdiki) → %60, 0,35 → %59,3, 0,5 → %57,5. Fark hata payı içinde; değiştirilmedi.

Gözlem: sandık altını 30-45 olunca paralı asker payı savaş başında ~%27'den ~%40'a çıktı (Orta); istenirse köy/kamp altını (şimdi 30-48 / 60-90) azaltılabilir.
