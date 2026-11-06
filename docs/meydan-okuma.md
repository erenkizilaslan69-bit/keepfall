# Meydan Okuma (tek kişilik mod) — kısa rapor (2026-11-06)

Steam planı Aşama A. Çok oyunculu kurallar ve `config/balance.json` değişmedi; yeni olan her şey ekleme.

## Ne var
- **`config/challenges.json`** (denge sayısı değil): 8 meydan okuma, hepsi tek mekanik öğretir, TR/EN ad + açıklama + ipucu, sabit tohum, oyuncunun krallığı ve destesi, 1–3 bot (zorluk, isteğe bağlı krallık/deste), savaş süresi, hedefler.
  `ilk-zafer` (ekonomi/asker dengesi) · `gozcu-ve-rapor` (gözcü, rapor) · `ulak-ve-blof` (ulak, hediye) · `orman-yagmasi` (köy/kamp/sandık) · `hayalet-ordu` (Gölge) · `altinin-gucu` (Tüccar rüşveti, kamp kiralama) · `kahinin-gozu` (Kâhin bilgisi, kayıpsız saldırı) · `maskeli-balo` (Entrikacı kılığı, sahte ulak).
- **Hedef türleri** (`Keepfall.Core/Challenges/Challenges.cs` → `GoalTypes`; sunucu bitmiş odadan hesaplar, listede olmayan tür dosya yüklenirken reddedilir): `win`, `winWithin` (savaşın başından saniye), `maxSoldiersLost`, `maxBattlesLost`, `minPopulation`, `minBattlesWon`, `minCastlesFelled`, `minEnemiesKilled`, `minGold`, `minVillages`, `minCamps`, `minChests`, `minScouts`, `minReports`, `minEnvoys`, `minDecoys`, `minFakeReports`, `minBribed`, `minCampsRented`, `minDisguises`. Sınır türlerinde (en çok…) kaybedilmiş maçta hedef sayılmaz. Yeni sayaçlar `CastleStats`'ta (her oyuncu için tutulur, yalnız bu mod okur).
- **Yıldızlar**: her hedefin `star` (1–3) alanı var; 1. yıldız = geçmek (`win` zorunlu), 2. ve 3. yıldız kendinden öncekileri de ister. Kaybedilen maçta 0 yıldız. Sonraki meydan okuma bir öncekinde ≥1 yıldızla açılır; günlük hep açık.
- **Günlük**: `ChallengeCatalog.Daily(utc)`: tohum = `yyyymmdd`, krallık/bot sayısı/zorluk/bot krallıkları/deste o tohumdan; id `daily-yyyymmdd`; hedefler: kazan · en çok `15·bot+15` asker kaybet · savaşın ilk `240+60·bot` sn'sinde kazan.

## Akış (sunucu otoriter)
`CreateRoom` → hub `StartChallenge(id)` (`"daily"` = bugünkü) → `Room.StartChallenge`: yalnız tek insanlı lobi, botlar tanımdan oturur, tohum/süre/krallık/deste tanımdan (`Room.StartGame`), `RoomSession.SeedBots(seed)` botların zarlarını tohumlar. Bitişte `MatchPush.End` yalnız oyuncuya `ChallengeResult` (kimlik, kazandı mı, yıldız, hedef başına gerçek/hedef değer) yollar. `GetChallenges` herkese aynı liste: kartta oyuncunun kendi krallığı/destesi, bot sayısı ve zorlukları, hedefler; **rakip krallık, rakip deste, tohum yok** (duman testi denetler). `RoomView.ChallengeId` yalnız oda içine. Tekrar dene: `BackToLobby` + `StartChallenge` (aynı odada).

İstemci: ana menüde "Meydan Okuma" düğmesi → kartlar (kilit, yıldız, günlük kart üstte) → "Başla"; maç sonunda hedef/yıldız özeti + "Tekrar dene / Sonraki meydan okuma / Meydan okumalar". İlerleme `localStorage.keepfall_challenges` (`safe-storage`, engelliyse bellekte), günlük sonuçlardan son 40'ı tutulur. Dosyalar: `client/src/ui/challenges.ts|css`, `screens.ts`, `main.ts`.

## Karar / ölçüm notları
- Eşikler (kayıp sınırları, süreler) insanla **ölçülmedi**; bot vekil ölçümü ve kullanıcı denemesi sonrası ayarlanır (yalnız `challenges.json`, kod gerekmez).
- Kolay bot rakipli maçlarda rehberli kalkan yok (yalnız Hızlı oyna'nın ilk rehberli maçında var).
- Sunucu dosyayı `balance.json`'ın yanında arar (`Keepfall:BalancePath`); dosya yoksa meydan okuma listesi boş, bozuksa sunucu açılmaz (`ChallengeConfigException`). 5090 dev LAN klasörüne de kopyalanmalı.
- Tüm kullanıcıya görünen sunucu metinleri `en-server.ts`'te, istemci metinleri `en.ts`'te.

## Testler
`ChallengeTests` (20): tanım yükleme, bozuk tanım (8 farklı bozulma + yok-kazan-hedefi + bilinmeyen alan + bozuk JSON), eksik dosya, günlük tohum kararlılığı (30 gün), oda kurulumu ve aynı tohum = aynı oda, tek kişilik kuralı, tekrar oynama, yıldız hesabı, sayaç hedefleri, kaybedilmiş maç. Duman testi: liste/kart alanları, gizli bilgi, başlatma reddi, sonuç, yeniden deneme, günlük.
