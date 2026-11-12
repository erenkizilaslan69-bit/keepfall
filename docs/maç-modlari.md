# Maç modları: Hızlı / Standart / Uzun (2026-11-12)

Ev sahibi lobide seçer (tek kişilik "Hızlı oyna" dahil; varsayılan Hızlı). Tablo `config/balance.json` → `match.modes`.

| Mod | Hazırlık | Savaş | Ekonomi hızı (`prepSpeed`) | "Son N sn gözcü yok" |
|---|---|---|---|---|
| Hızlı | 5 dk | 10 dk | 1,6 (eskisi gibi) | 37,5 sn |
| Standart | 10 dk | 10 dk | 1,0 | 60 sn |
| Uzun | 15 dk | 10 dk | 1,0 | 60 sn |

**Hızlı'nın süreleri ve hızı** `match.shortModeMinutes/shortModePrepMinutes/prepSpeed`'ten okunur (tablodaki `quick` satırından yalnız gözcü kilidi); böylece bu sayıları geçici config'le değiştiren araçlar (`tools/run-smoke.mjs`) çalışmaya devam eder.

Savaş zaten 10 dk'ydı (`shortModeMinutes 15 − shortModePrepMinutes 5`); üç modda da 10 dk. Mevcut Hızlı değerleri, rehberli maç (480 sn hazırlık, düz hız, 240 sn kalkan) ve meydan okumaların kendi süreleri AYNEN kaldı (açık süre verilen maç mod almaz).

**prepSpeed gerekçesi:** Hızlı'da 1,6 kat hız "8 dk'lık hazırlığın sonucu 5'e sığar" demek (eşdeğer 8 dk). Standart ve Uzun düz hızda: 10 ve 15 dk, Hızlı'nın eşdeğer 8 dk'sından ~%25 ve ~%88 fazla üretim; hızlandırmanın amacı kısa maçı sıkıştırmaktı, uzun hazırlığın amacı oyuncuya planlama/orman gezme payı vermek.

## Hazırlığa bağlı her şey (A2)
- **Son N sn gözcü yasağı**: saat saniyesi; Hızlı 60/1,6 = 37,5, düz hızlarda 60 (`modes.*.noScoutLastPrepSeconds`).
- **Bot düşünme hızı**: hazırlıkta `prepSpeed` kat sık düşünür; artık maçın hızından (`GameState.PrepSpeed`, `Bot.PrepPace`) okunur (Standart/Uzun'da 1).
- **Ordu ve gözcü yürüyüşü** hazırlıkta `prepSpeed` kat hızlı (mevcut kural, maçın hızına bağlı).
- **Kıtlık** (savaşın 240. sn'si) ve **kalkan** savaşa göre; hazırlık uzunluğundan etkilenmez, değişmedi.
- **İstemci**: kalan süre, ipuçları ve öğretici metni sunucunun `prepSeconds/elapsedSeconds` sayılarından hesaplanır; mod için ayrı sabit yok. Orman bot kuralı `otherQuartersFrom` hazırlığın ORANI, ölçeklenir.

## Bot ölçümü (A3)
`BattleSim bot --mac 40 --zorluk <z> --mac-modu hizli|standart|uzun --seed 11` (oyun saati, 2 bot):

| Zorluk | Mod | Kazanma | Nüfus savaş başı | Asker savaş başı | Depo odun+demir savaş başı | Elemeyle biten |
|---|---|---|---|---|---|---|
| Orta vs Kolay | Hızlı | Orta %72,5 | 39 (Kolay 33) | 20 (10) | 96 | %65 |
| Orta vs Kolay | Standart | %67,5 | 43 (34) | 23 (12) | 207 | %85 |
| Orta vs Kolay | Uzun | %70,0 | 51 (37) | 31 (16) | 695 | %75 |
| Orta vs Orta | Hızlı | %50 | 37 | 18 | 102 | %22 |
| Orta vs Orta | Standart | %50 | 40 | 22 | 211 | %40 |
| Orta vs Orta | Uzun | %50 | 49 | 28 | 685 | %40 |
| Zor vs Orta | Hızlı | Zor %67,5 | 34 (Orta 37) | 7 (18) | 83 | %40 |
| Zor vs Orta | Standart | %68,8 | 35 (41) | 10 (23) | 136 | %43 |
| Zor vs Orta | Uzun | %61,3 | 39 (51) | 13 (30) | 543 | %53 |

(Hata payı ≈ ±8 puan, 40 maç/hücre; ayrıca 24'lük ilk tur aynı yönde.)

**Okuma:** botlar her modda hazırlığı kullanıyor: nüfus ve asker hazırlık uzadıkça büyüyor (Orta: 37→40→49 nüfus, 18→22→28 asker); kazanma oranları Hızlı'dakilere yakın (Orta/Kolay 68–73, Zor/Orta 61–69), yani ince denge bozulmadı. Elenen koltuk oranı Standart/Uzun'da artıyor (daha büyük ordular).
**Bariz bozukluk yok.** Gözlem / açık: Uzun modda depodaki odun+demir savaş başlarken ~700'e çıkıyor (Hızlı 100). Botlar bu stoğu harcamıyor: ordu işçi sayısıyla sınırlı ve bina seviyeleri dolunca harcanacak yer kalmıyor. Oyuncu için bu fırsat (daha çok silah), botlar için israf; ince denge sayılacağı için dokunulmadı. İstenirse bot Uzun modda daha çok nüfus büyütür (yemek) ya da silahı depoda tutar (Zor zaten yapıyor, 543).

## Arayüz ve veri (A4)
- Lobi: üç düğmelik seçici (tek satır); ev sahibi değiştirir, herkes görür (misafirde devre dışı). Ana menüde "Oyna" altında aynı seçici (tarayıcıda hatırlanır; Hızlı oyna ve kurulan oda onu kullanır, rehberli ilk maç kendi 8 dk'sında kalır).
- `RoomView.mode` ("quick"/"standard"/"long"); hub `SetMode(string)` (yalnız ev sahibi, bilinen üç kelime). Steam lobi verisine `mode` (üç bilinen kelimeden biri), açık oyunlar listesinde "5+10 dk" etiketi, Rich Presence `mode` ("5+10") ve metinlerde `{%mode%}` (`tools/steam/rich_presence_loc.vdf`; Steamworks panelinde yeniden yüklenmeli).
- Maç ekranında kalan süre sunucunun `remainingSeconds/prepSeconds` sayılarından: moda göre doğru (mode-match-check: hazırlık 300/600/900 sn).
- Kontroller: `tools/shot-modes.mjs` (görüntüler `art/shots/modes/`), `tools/mode-match-check.mjs` (her moddan bir tam maç, ×20), `MatchModeTests`.

## Uzun modda stok birikimi düzeltildi (2026-11-12, cila turu madde 6)
**Hata:** Uzun hazırlıkta Orta/Zor botlar savaş başlarken ~700 odun+demir depoda bekletiyordu (Hızlı ~100): ordu nüfusun `armyShare` (%50) kadarıyla sınırlı, üretim ise devam ediyordu.
**Düzeltme (yalnız bot davranışı, yeni anahtarlar `bots.surplus*`):** hazırlık ≥ 840 sn (yalnız Uzun) ve hazırlığın ikinci yarısında odun+demir ≥ 250 birikince Orta/Zor botlar nüfusun `armyShare + 0,25`'ine kadar asker yapar (Kolay etkilenmez; Kolay'a da verilince Orta/Kolay farkı %70 → %52'ye düşüyordu). Hızlı (300 sn) ve Standart (600 sn) için kod yolu hiç çalışmaz: aynı tohumla 40'ar maç çıktıları **birebir aynı** (karışık, orta, zor-orta; 18 tablo karşılaştırıldı).

| Uzun mod, 40 maç, tohum 11 | önce | sonra |
|---|---|---|
| Orta, Kolay'a karşı kazanma | %70,0 | %72,5 |
| Orta vs Orta | %50 | %50 |
| Zor, Orta'ya karşı kazanma | %61,3 | %80,0 |
| Depo odun+demir (Orta, savaş başı) | 685–712 | ~369 |
| Asker savaş başı (Orta) | 28–30 | 38–41 |
| Nüfus savaş başı (Orta) | 49–51 | 47–51 |

Aday değerler (denendi, 40 maç): bonus 0,10 → depo ~540 ama Orta/Kolay %62; 0,20 → depo ~415; 0,30 → depo ~350, Zor/Orta %87. 0,25 seçildi. **Açık:** Zor'un Uzun modda Orta'ya karşı kazanması %61'den %80'e çıktı (hata payı ±10; Zor silahı depoda tuttuğu için artan nüfus payından daha çok yararlanıyor olabilir). Depo ~370'e indi, 0'a değil (üretim sürüyor). Ayarlar `config/balance.json` → `bots.surplusMinPrepSeconds / surplusStock / surplusShareBonus` (0 = kapalı).
