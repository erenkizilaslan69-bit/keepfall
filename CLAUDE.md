# Keepfall — Claude için proje notları

Kullanıcıyla **Türkçe** konuş. Kısa ve öz raporla. Kod, yorum ve commit mesajı bağlamı: kod yorumları İngilizce, oyun metinleri ve commit başlıkları Türkçe.

## Oyun (özet)
2–4 kişilik tarayıcı kale stratejisi. Her oyuncunun tek kalesi var. **Lobide deste**: 7 birimden 4'ü seçilir (seçmeyene rastgele). **Hazırlık** (10 dk): işçileri çiftçi/oduncu/madenci/demirci yap, silah üret, asker hazırla (kuşanmak 15 sn sürer), orman (sandık, köy, haydut kampı, ortada büyük kamp) yağmala, gözcü ya da ulak gönder, paralı asker kirala (altınla). **Savaş** (10 dk; kıtlık 4. dakikadan sonuna): ordular yollarda yürür, yolda ve kale kapısında çarpışır; kapıda saldıran kazanırsa kale tek seferde düşer (can/sur seviyesi yok), savunanın savaşa giren ordusunun yarısı esir olur; kalesi düşen elenir ve izleyici olur. Son ayakta kalan kazanır; süre dolarsa en yüksek nüfus (esirler dahil). 20 dk (10+10) ve 30 dk (20+10) modu var. Botlar (Kolay/Orta/Zor) lobide eklenir. Ayrıntı: `README.md`.

Birimler (7): Kılıçlı, Mızrakçı, Kalkanlı, Okçu + **Keşiş** (saldırmaz, en yaralı dosta can verir; savaş başına iyileştirme tavanı `healBudget`; yalnız keşişi kalan taraf yenilir), **Mancınık** (arka sırayı döver, iki hedefe sıçrar, kuşanırken 2 işçi harcar), **Süvari** (2 kat hızlı, arkadaki okçu/mancınık/keşişe dalar; yalnız süvariden oluşan ordu kapıda kazanırsa kale DÜŞMEZ, tarlalar `war.raidBurnSeconds` 60 sn yarı verimle yanar = baskın). Karma ordu en yavaş birimin hızında yürür. Karşılık matrisi 7×7, sayılar `config/balance.json`. Rakibin destesini yalnız gözcü raporu gösterir.

## Mimari
- `src/Keepfall.Core`: tüm oyun kuralları (Economy, Match/GameState, Combat, World, Lobby/Room, Config). Hiçbir ağ/UI bağımlılığı yok.
- `src/Keepfall.Views`: oyuncuya gösterilen görünüm kayıtları + `ViewMapper`. Sunucudan istemciye giden TEK şey bunlardır.
- `src/Keepfall.Bots`: botların beyni; yalnız Views + herkese açık kuralları görür (`BotIsolationTests` derleme başvurularını denetler). `Keepfall.BotHost` botları odaya oturtur. Modüller: Economy, Build, Scout, Foresight, Defense, **Raid**, Attack, Forest, Mercenary, Production.
- `src/Keepfall.Server`: ASP.NET Core + SignalR (`/hub`), `TickLoop` her `match.serverTickSeconds`'te odaları ilerletir ve her oyuncuya kendi görünümünü yollar; `/api/client-log` istemci hatalarını `logs/client-errors.log`'a yazar; `/api/guide` rehber sayıları.
- `client/`: Vite + TypeScript + Phaser (harita) + HTML katmanı (`src/ui`, Tiny Swords parçalarıyla). İstemci yalnız komut yollar, sunucunun gösterdiğini çizer. Yeni birim görselleri koddan çizilir: `scene/PixelArt.ts` (chibi at, mancınık), `scene/NewUnits.ts` (yüklemede her renk için doku/animasyon; süvarinin binicisi paketin Lancer sayfasından birleştirilir, diske yazılmaz).
- `src/BattleSim`: konsol aracı. `denge` (birim düzeyi), `savas`, `bot` (bot maçları; `--zorluk orta|kolay|zor|zor-orta|bekleyen|karisik`), `deste` (deste turnuvası; `--deste-basi 50` örnekleme, tam eşleşme `--cift N` çok uzun sürer; `KF_DECKS`/`KF_SERIAL` tanılama), `kontrol`. `tools/bot-deney.py`: config'e dokunmadan bot deneyleri. `tools/smoke-test.mjs`: duman testi. `tools/replay-check.mjs`: savaş oynatması donma testi (başsız Chrome). `tools/shot-newunits.mjs`: yeni birim görselleri.
- `tests/Keepfall.Core.Tests`: birim testleri (`dotnet test -c Release`).
- Süreler OYUN saniyesidir; oda hızı ×N olunca (yalnız Development) hepsi hızlanır.

## DEĞİŞMEZ KURALLAR
1. **Gizli bilgi sunucuda.** Oyuncu yalnız kendi kalesini ve sisin açtığını görür; görüş dışı hiçbir şey istemciye gitmez. Savaş kaydı yalnız savaşan iki tarafa gider. Rakip destesi yalnız gözcü raporunda. Yeni her özellik duman testini (`tools/smoke-test.mjs`) genişletir; botlar da yalnız insanın göreceği görünümleri kullanır.
2. **Sayılar `config/balance.json`'da** ve kullanıcının onayı olmadan DEĞİŞTİRİLMEZ (istisna: kullanıcı bir hedef verip "ölçümle kalibre et" derse; değişen sayıları özette listele). Önce ölç (BattleSim / `tools/bot-deney.py`, geçici config ile `--config`), sonra öner. Yeni ayar anahtarı eklemek serbest (varsayılan = eski davranış).
3. **Her parça ayrı commit + push** (sormadan). Büyük adımlarda önce plan çıkar ve onay bekle. Belirsizlikte sor.
4. Commit sonu: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; git e-postası noreply.
5. **Production** sunucusunu yalnız kullanıcı söyleyince / iş bitince yeniden başlat. Production `bin/Debug`'dan DEĞİL `publish/` klasöründen çalışır (git'e girmez), bu yüzden derleme ve testler onu kilitlemez. Yeniden başlatmak için: `npm --prefix client run build`; çalışan Production'ı durdur (publish/ kilitli kalır); `dotnet publish src/Keepfall.Server -c Release -o publish`; depo KÖKÜNDEN `$env:ASPNETCORE_ENVIRONMENT='Production'; dotnet publish/Keepfall.Server.dll --urls http://localhost:5080` (açılışta "Hosting environment: Production" yazmalı). Test için açtığın sunucuları (5081, Vite 5174) işin sonunda KAPAT. Dev sunucu (5081) Release dll'lerini kilitler: derlemeden önce kapat.
6. **Tünel** yalnız istenince: `cloudflared tunnel --url http://localhost:5080` (Vite'a değil, 5080'e). Şu an KAPALI; kullanıcı oynamayı bitirince yine kapat.
7. **Tiny Swords asset'leri repoda değil** (`client/public/assets/` .gitignore'da). Ekleme/commit etme. İSTİSNA: CC0 sesler repoda (`client/public/audio/`: Kenney arayüz/etki sesleri, RandomMind müzikleri; kaynaklar README'de); Tiny Swords'un "TS_old version_CC0" paketinden alınan dosyalar (CC0) `client/public/cc0/` altında. Free Pack'ten türetilen hiçbir şey (kesilmiş, birleştirilmiş görüntü dahil) repoya girmez.
8. Satır sonu: dosyaların mevcut biçimini koru (çoğu LF; BOM ekleme). Python ile dosya düzenlerken BOM/CRLF değiştirme.
9. Test sunucusunda tarayıcı bölmesi gizliyken Phaser çizmez; ekran testi için başsız Chrome (CDP) kullan (örnek: `tools/replay-check.mjs`).

## Test rutini
`dotnet test -c Release` (261 test) → `node tools/run-smoke.mjs` (~2–3 dk; kendi test sunucusunu 5081'de, savaşı 15 dk olan geçici bir config kopyasıyla açar ve kapatır; CPU yükü altında ölçümle çakışırsa bazı zamanlama denetimleri düşebilir, tek başına koşunca geçer) → istemci için `npm --prefix client run build` (tsc dahil).
Bot dengesi: `BattleSim bot --mac 400 --zorluk karisik|bekleyen|orta|zor-orta` (Orta vs Kolay, yalnız bekleyen bot, Orta vs Orta, Zor vs Orta). Deste dengesi: `BattleSim deste --deste-basi 50`.

## Son sayılar (2026-10-28)
- **Deste dengesi** (`docs/yeni-birlikler-deste-son.md`, örneklemli turnuva, hata payı ±5 puan): en iyi deste %61,2, en kötü %34,4; hedef "hiçbir deste %58'in üstüne çıkmasın" büyük ölçüde tutuyor. Birim düzeyi (eşit kişi) kazanma 45–58%, Keşiş hariç (%26, destek). Ölçüm tabloları `docs/yeni-birlikler-tablo.md`, `docs/yeni-birlikler-deste-*.md`.
- **Botlar** (400 maç, `docs/gece/raid-*.txt`): Orta vs Kolay ≈%71–75 (hedef 70–80); yalnız bekleyen botun kazanma oranı ≈%13; Zor vs Orta ≈%59 (hedef %75–85'in ALTINDA, dokunulmadı); Orta baskın yapar ~0,15 baskın/maç.
- Bot desteleri: hepsi `bots.decks` listesindeki 7 dengeli desteden birini seçer (Kolay dahil). Zorluk oyun tarzından gelir: Kolay yavaş düşünür/tepki verir (7–12 / 8–15 sn), hata yapar (`mistake` 0,25), saldırıyı kafa sayısıyla seçer (`calculates` false), baskın yapmaz; Orta hesaplar ve baskın yapar (`raidEvery` 150 sn, `raidMax` 4); Zor ayrıca öngörülü ve silahı depoda tutar. `RaidModule`: destesinde süvari varsa, yalnız süvariyle kapıda kazanacağı rakibi savaş hesaplayıcısıyla bulur (rakip ordusu yolda görüldüyse evdeki payı azalır); en çok bir baskın dışarıda; baskın ordusu ana saldırının "tek saldırı" ve "yeniden yönelme" denetimlerinde sayılmaz.

## Bilinen açık konular
- **Okçu hâlâ biraz güçlü**: deste turnuvalarında Okçulu desteler ortalama ~%52 ve en iyi 5 deste içinde her turda; tam çözülmedi (hasar 9, can 68'e inmişti). Yeni ayar turunda önce okçu içeren desteleri izle.
- **Zor bot Orta karşısında ≈%59** (hedef %75–85). Kuşanma süresi (15 sn) ve süvari/keşiş eklenmesinden sonra yeniden ayarlanmadı; kullanıcı "dokunma" dedi, isterse `docs/bot-zor-tablo.md` yöntemiyle yeniden ölç.
- Botlar mancınık/keşişi yalnız karışıma göre üretir; özel taktikleri yok. `docs/bot-zor.py` eski, kullanma (yerine `BattleSim bot --zorluk zor-orta`).
- Duman testinde izleyici bölümündeki "every picture is of the live game (no delay)" denetimi ara sıra düşüyor (iki bağlantıdan gelen mesaj sırasına bağlı zamanlama; hata değil). Savaş 15 dk'lık geçici config'le koşulur (`tools/run-smoke.mjs`; balance.json'a dokunmaz).
- Lobi deste seçicisi başsız tarayıcıda denendi ama ekranına gözle bakılmadı; sahne görselleri (savaş oynatması, yürüyen ordu) bakıldı.
- Eski bot tabloları (`docs/bot-deney-*.md`) tek gözcü kuralı, esir, süvari ve deste ÖNCESİ durumu gösterir.
- Geri dönüş sorunu (savaş kaybeden toparlanamıyor): aday çözümler kale muhafızları, sığınan köylüler, son çiftçi uyarısı, büyüme maliyeti %8 → %6. Kodlanmadı.
- Fikirler (kodlanmadı): gözcüyle erzak/para/mesaj (ulak ile yapıldı), sis dışındaki maç olayları kalktı. Zafer puanı kuralı eklenmedi (kullanıcı kararı: nüfus kuralı kalsın).

## Test sonrası düzeltmeler ve lobi yenilemesi (2026-10-28)
- **Klonlanan ordu**: sunucuda tek ordu (kimlik tekil, `ContinuityTests`); istemcide `Movers.audit()` her saniye "bir ordu, bir çizim" denetler (`mover-audit` olarak raporlanır) ve savaş oynatması sürerken yürüyen sütun gizlenir (`Movers.inReplay`). Kontrol: `node tools/army-check.mjs` (×20 maç, ordu çizimi + savaş oynatması zamanlaması).
- **Savaşlar hep oynatılır**: `war.minBattleSeconds` 4 (boş kaleye saldırı da kapıya yürüyerek görülür); oynatması yapılan savaşın "Savaş" bulutu geri gelmez (`BattlePlayer.hasPlayed`).
- Okçu/mancınık hedefi seçimi yalnız ordu ya da deste okçu/mancınık içeriyorsa görünür (`SHOOTERS`, `BACK_LINE` in `format.ts`).
- **Lobi→oyun geçişi**: gecikmenin sebebi ağ değil, süvari/mancınık görsellerinin sahne kurulurken çizilmesiydi (3,3 sn); artık harita açıldıktan sonra kare kare çizilir (`newUnitArtJobs`; haritaya sonradan girilirse hemen). Lobide dosyalar `preload.ts` ile önceden çekilir; geçişte bulut perdesi (`ui/clouds.ts`) kapanır ve harita hazır olunca açılır.
- **Avlu**: askerler kalenin önünde (`CAMP`, layout.ts) kamp ateşi etrafında tür gruplarıyla bekler (`Soldiers.ts`); ateş koddan çizilir (`PixelArt.flameCanvas`, `NewUnits.makeCampfire`); savunanlar kamptan kapıya iner. Sunucu koordinatları değişmedi.
- **Lobi**: deste kartları (`ui/portraits.ts` + `LobbyScreen`; çevrilir, Seç/çift tık), canlı menü sahnesi (`ui/scenery.ts`: ana ekran, lobi, maç sonu), ayarlar (`ui/settings.ts`, `prefs.ts`: ses, efektleri azalt, hakkında). Ekran görüntüsü araçları: `tools/shot-lobby.mjs`, `shot-camp.mjs`, `shot-settings.mjs` (görüntüler repoya GİRMEZ: Free Pack içerir).

## Önemli tasarım kararları (kısa)
- **Kale düşmesi**: kale canı, sur seviyeleri, `UpgradeWall` kalktı; saldıran kapıdaki savaşı kazanırsa (boş kale dahil) kale düşer. `walls.archerDefenseBonus` (+%25) kapıdaki savunan okçulara hep geçerli. Düşüren ordu depodaki yemek/odun/demir/altının yarısını (`war.fallLootShare`) ve hayatta kalan işçilerin üçte birini (`war.fallWorkerShare`) eve getirir. Esir: `war.prisonerShare` 0,5 (savunanın savaşa giren ordusunun payı, saldıranın askeri olur, yolda yemek yer, nüfusa sayılır; kullanıcı kararıyla olduğu gibi kalır).
- **Işınlanma hatası** düzeltildi: `GameState.WayHome` yönlendirilmiş ordular için bulunduğu yerden kapıya rota kurar; `ContinuityViolations` her tick konum sıçramasını sayar (hedef 0; `ContinuityTests` ×1/×5/×20).
- **Ordu yeniden yönlendirme**: yürüyen/dönen ordu haritada tıklanınca "Yeni emir" (başka rakip kale ya da ormandaki yer; köy ≥3 asker). `RedirectArmy`, `WorldMap.RouteFrom`. Tümü/Yarısı butonları.
- **Kuşanma** `match.armSeconds` 15: işçiyi askere çevirmek 15 sn sürer, bu sürede ne çalışır ne savaşır, nüfusa sayılır; paralı anında. Mancınık 2 kişi harcar (disarm 2 geri verir).
- **Ulak** (`SendEnvoy`): rakibe yük (en çok `envoy.maxCargo` 40) ve/veya mesaj (140 karakter); gözcüyle aynı hak (`scouting.maxScouts` 1) ve hız (2,5); iz bırakmaz, yakalanmaz. Mesaj istemcide HER ZAMAN `textContent` (`tools/shot-envoy.mjs` denetler). Botlar ulak göndermez; ≥30 yüklü hediye alınca göndereni 90 sn hedeflemez.
- **Ganimet/süre**: sandık altını 30–45, köy 20–30, kamp 40–60; kıtlık `war.famineStartSeconds` 240; bina yükseltme süreleri yarıya, Sv4 (10 kişi, ×2,5) var; harita çevresine 14 karo su.
- **Deste**: `deck.enabled/size`; `Room.SetDeck`, `GameState(decks:)`, `Castle.SetDeck/InDeck`; desteye uymayan ganimet silahı yarı paralı fiyatıyla altına çevrilir. Testler `RoomOptions.BotDeck = RoomOptions.ClassicDeck` ile eski 4 birimi sabitler.
- **Zor bot**: `bots.hard` (silahı depoda tutar `holdWeapons`, karşı birim `counterUnits`, fırsatçı, öngörü `foresight`+`garrisonShare` 0,2). **Orta**: `scoreAware` açık. Botlar hazırlığın ilk yarısında yalnız kendi orman çeyreğinde gezer (`bots.otherQuartersFrom` 0,5).
- **Ses**: `client/src/audio.ts` (gerçek OGG/MP3 kayıtlar `client/public/audio`, yüklenemeyen ses prosedürel; müzik/efekt ayrı düzey). **Hata günlüğü**: `client/src/error-report.ts` (`guarded()`), sunucu `logs/client-errors.log`. **Rehber**: `?` butonu, sayılar `/api/guide`.
- **Görsel**: efektler `scene/Effects.ts` (`?fx=0` kapatır); yollar `scene/Roads.ts`; araçlar `tools/shot-fx.mjs`, `shot-forest.mjs`, `shot-map.mjs`, `shot-roads.mjs`, `fps.mjs`, `audio-check.mjs`. ffmpeg `winget install Gyan.FFmpeg` ile kurulu.
