# Keepfall — Claude için proje notları

Kullanıcıyla **Türkçe** konuş. Kısa ve öz raporla. Kod, yorum ve commit mesajı bağlamı: kod yorumları İngilizce, oyun metinleri ve commit başlıkları Türkçe.

## Oyun (özet)
2–4 kişilik tarayıcı kale stratejisi. Her oyuncunun tek kalesi var. **Hazırlık** (10 dk): işçileri çiftçi/oduncu/madenci/demirci yap, silah üret, asker hazırla, orman (sandık, köy, haydut kampı, ortada büyük kamp) yağmala, gözcü gönder, paralı asker kirala (altınla). **Savaş** (10 dk; kıtlık 4. dakikadan sonuna): ordular yollarda yürür, yolda ve kale kapısında çarpışır; kapıda saldıran kazanırsa kale tek seferde düşer (can/sur seviyesi yok), savunanın ordusunun yarısı esir olur; kalesi düşen elenir ve izleyici olur. Son ayakta kalan kazanır; süre dolarsa en yüksek nüfus (esirler dahil). 20 dk (10+10) ve 30 dk (20+10) modu var. Botlar (Kolay/Orta/Zor) lobide eklenir. Ayrıntı: `README.md`.

## Mimari
- `src/Keepfall.Core`: tüm oyun kuralları (Economy, Match/GameState, Combat, World, Lobby/Room, Config). Hiçbir ağ/UI bağımlılığı yok.
- `src/Keepfall.Views`: oyuncuya gösterilen görünüm kayıtları + `ViewMapper`. Sunucudan istemciye giden TEK şey bunlardır.
- `src/Keepfall.Bots`: botların beyni; yalnız Views + herkese açık kuralları görür (`BotIsolationTests` derleme başvurularını denetler). `Keepfall.BotHost` botları odaya oturtur.
- `src/Keepfall.Server`: ASP.NET Core + SignalR (`/hub`), `TickLoop` her `match.serverTickSeconds`'te odaları ilerletir ve her oyuncuya kendi görünümünü yollar; `/api/client-log` istemci hatalarını `logs/client-errors.log`'a yazar.
- `client/`: Vite + TypeScript + Phaser (harita) + HTML katmanı (`src/ui`, Tiny Swords parçalarıyla). İstemci yalnız komut yollar, sunucunun gösterdiğini çizer.
- `src/BattleSim`: konsol aracı (`denge`, `savas`, `bot` komutları). `tools/bot-deney.py`: config'e dokunmadan bot deneyleri. `tools/smoke-test.mjs`: duman testi. `tools/replay-check.mjs`: savaş oynatması donma testi (başsız Chrome).
- `tests/Keepfall.Core.Tests`: birim testleri (`dotnet test -c Release`).
- Süreler OYUN saniyesidir; oda hızı ×N olunca (yalnız Development) hepsi hızlanır.

## DEĞİŞMEZ KURALLAR
1. **Gizli bilgi sunucuda.** Oyuncu yalnız kendi kalesini ve sisin açtığını görür; görüş dışı hiçbir şey istemciye gitmez. Savaş kaydı yalnız savaşan iki tarafa gider. Yeni her özellik duman testini (`tools/smoke-test.mjs`) genişletir; botlar da yalnız insanın göreceği görünümleri kullanır.
2. **Sayılar `config/balance.json`'da** ve kullanıcının onayı olmadan DEĞİŞTİRİLMEZ. Önce ölç (BattleSim / `tools/bot-deney.py`, geçici config ile `--config`), sonra öner. Yeni ayar anahtarı eklemek serbest (varsayılan = eski davranış).
3. **Her parça ayrı commit + push** (sormadan). Büyük adımlarda önce plan çıkar ve onay bekle. Belirsizlikte sor.
4. Commit sonu: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; git e-postası noreply.
5. **Production** sunucusunu yalnız kullanıcı söyleyince / iş bitince yeniden başlat. Production `bin/Debug`'dan DEĞİL `publish/` klasöründen çalışır (git'e girmez), bu yüzden derleme ve testler onu kilitlemez, durdurmak gerekmez. Yeniden başlatmak için: `npm --prefix client run build`; çalışan Production'ı durdur (publish/ kilitli kalır); `dotnet publish src/Keepfall.Server -c Release -o publish`; depo KÖKÜNDEN `$env:ASPNETCORE_ENVIRONMENT='Production'; dotnet publish/Keepfall.Server.dll --urls http://localhost:5080` (açılışta "Hosting environment: Production" yazmalı). Test için açtığın sunucuları (5081, Vite 5174) işin sonunda KAPAT.
6. **Tünel** yalnız istenince: `cloudflared tunnel --url http://localhost:5080` (Vite'a değil, 5080'e).
7. **Tiny Swords asset'leri repoda değil** (`client/public/assets/` .gitignore'da). Ekleme/commit etme. İSTİSNA: CC0 sesler repoda (`client/public/audio/`: Kenney arayüz/etki sesleri, RandomMind müzikleri; kaynaklar README'de); başka lisanslı bir şeyi repoya koyma. İSTİSNA 2: Tiny Swords'un "TS_old version_CC0" paketinden alınan dosyalar (CC0) `client/public/cc0/` altında repoda durur (Tilemap_Elevation, tabelalar; LICENSE.txt); Free Pack'ten türetilen hiçbir şey (kesilmiş, birleştirilmiş görüntü dahil) repoya girmez.
8. Satır sonu: dosyaların mevcut biçimini koru (çoğu LF; BOM ekleme). Python ile dosya düzenlerken BOM/CRLF değiştirme.
9. Test sunucusunda tarayıcı bölmesi gizliyken Phaser çizmez; ekran testi için başsız Chrome (CDP) kullan (örnek: `tools/replay-check.mjs`).

## Test rutini
`dotnet test -c Release` (241 test) → `node tools/run-smoke.mjs` (~2–3 dk; kendi test sunucusunu 5081'de, savaşı 15 dk olan geçici bir config kopyasıyla açar ve kapatır; Production çalışırken de koşar, kilitlemez) → istemci için `npm --prefix client run build` (tsc dahil).
Bot dengesi: `python tools/bot-deney.py 200 docs/bot-deney-son.md` (tablo `docs/`'ta).

## Son durum (2026-10-26)
- Bitenler: ekonomi, harita/sis, görünür savaşlar, UI yenilemesi, orman (sandık/köy/kamp/altın/paralı asker), botlar (Kolay/Orta, 7 parça), bot dengesi (paralı payı ~%27, Orta vs Kolay ~%71), gözcü izi/raporları, tek gözcü kuralı (`scouting.maxScouts` = 1), izleyici modu ("İzlemeye devam / Maçı bitir", son insan düşünce maç ≥120 oyun sn sürer), istemci hata günlüğü, hızlı kamera butonları.
- Bot ayarları: Orta `scoreAware` açık; Kolay düşünme 7–12 sn, ekonomisi iyi, taktiği zayıf. Botlar hazırlığın ilk yarısında yalnız kendi orman çeyreğinde gezer (`bots.otherQuartersFrom` 0,5).
- Önceki bot tabloları (`docs/bot-deney-*.md`) tek gözcü kuralı ve bot orman sırasından ÖNCEKİ durumu gösterir; yeniden ölçmek gerekebilir.

## Bilinen açık konular
- Duman testinde izleyici bölümündeki "every picture is of the live game (no delay)" denetimi ara sıra düşüyor (iki bağlantıdan gelen mesajların sırasına bağlı zamanlama; bot/oyun hatası değil).
- Duman testinin ikinci turu savaşı uzun (15 dk) bir geçici config'le koşar (`tools/run-smoke.mjs`; balance.json'a dokunmaz), böylece kale düşüşü hep maç süresinden önce olur ve ganimet/izleyici denetimleri her seferinde çalışır. Testi doğrudan `smoke-test.mjs` ile gerçek (5 dk savaşlı) sunucuya koşarsan o bölüm zamanlamadan düşebilir.
- Saldırısız maç oranı yüksek (Orta vs Orta ~%39 saldırısız); `scoreAware` ve zafer puanı deneyi sonuçları `docs/bot-deney-son.md`'de. Zafer puanı kuralı oyuna EKLENMEDİ (kullanıcı kararı: nüfus kuralı değişmedi).
- Kolay'ın düşünme süresi 7–12 sn'de bırakıldı (Orta kazanma ~%71, hedef ~%80); kullanıcı yeniden ayar isterse 8–12 / 8–14 ölçüldü.

## Görev listesi (kullanıcı sırası)
Durum: [x] bitti, [ ] açık.
- [x] 0 CLAUDE.md yazıldı
- [x] 1 Kamera butonları alt alta (Kaleme dön, rakipler, Orman)
- [x] 2 Gözcü raporları isim altında durmasın; oyuncu ismine tıklayınca papirüs/ferman penceresinde rapor
- [x] 3 HATA: köye 1 askerle gidilince yağmalanıyor; en az 3 asker kuralı sunucuda + arayüzde + botlarda
- [x] 4 Ganimet çeşitlendirme (sandık altın+demir, köy altın+yemek+kişi, kamp altın+silah+odun; paralı ×1,1). Ölçüm: `docs/bot-deney-ganimet.md` (paralı payı savaş başı %26,5→%21; yan etki: saldırısız maç %12→%18)
- [x] 5 Düşen kale: düşüren ordu kalenin depodaki yemek/odun/demir/altınının yarısını (`war.fallLootShare`) ve hayatta kalan işçilerin üçte birini (`war.fallWorkerShare`, boşta) eve getirir
- [x] 6 Gözcü hızı 2,5 → 1,8 karo/sn. Ölçüm: `docs/bot-deney-gorev56.md` (Orta vs Orta saldırısız maç %18→%39,5; Orta vs Kolay %66,8→%62,5; paralı payı savaş başı ~%20/%18)
- [ ] 7 (SONRAYA, kodlama yok) Fikir: gözcüyle erzak, para ve mesaj gönderme

## Fikirler (kodlanmadı)
- Maç olayları: yalnız sis kaldı (haydut baskını, rastgele kıtlık ve göçmenler fikirden çıkarıldı).
- Gözcüyle erzak, para ve mesaj gönderme (başka oyuncuya).
- Geri dönüş sorunu: savaş kaybeden oyuncu toparlanamıyor, nüfus ve ordular az. Aday çözümler: kale muhafızları, sığınan köylüler, son çiftçi uyarısı, büyüme maliyet artışını %8'den %6'ya çekmek. Detaylı düşünülecek.

## KALDIĞIM YER (2026-10-27, gece işleri bitti)
Görev 0–6 ve kullanıcı istekleri bitti, hepsi push edildi; Production (5080) son commit'le çalışıyor, test sunucuları (5081, 5174) kapalı, tünel KAPALI (kullanıcı 'tüneli aç' diyene kadar kapalı kalsın; oynamadığı zamanlarda da kapat).
- **Ordu yeniden yönlendirme**: yürüyen/dönen (savaşta olmayan) ordu haritada tıklanınca ordu penceresinde "Yeni emir": başka rakip kale (yalnız savaş fazı) ya da ormandaki yer (köy ≥3 asker). `RedirectArmy` komutu, `WorldMap.RouteFrom` (bulunduğu yoldan en kısa), dönen ordu da yeniden çıkabilir ve ganimeti taşır. Orta bot: saldırıdan dönen ordu uzak yarıdayken zayıf bildiği bir hedefe yönelir (`regroups`). Ölçüm: Orta vs Orta saldırısız %14, nüfus 23,6; ama eleme ile biten maç %17 → %41 (botlar daha çok bitiriyor; fazla görünürse `blindMargin`/`attackMargin` yeniden ölçülür, sayılara kullanıcı onayıyla dokun).
- **Tümü / Yarısı** butonları (kale ve orman yeri saldırı pencereleri).
- **Gece işleri (kullanıcı uyurken)**: (1) hata taraması: `guarded()` ile kare döngüsü/UI/mesaj işleyicileri bölüm bölüm korumalı (`client/src/error-report.ts`), `client-errors.log` yoktu; (2) ses efektleri: `client/src/audio.ts` (Web Audio, dosya yok; üst şeritte ♪ ve ses düzeyi, localStorage `keepfall.sound`, varsayılan 0,3, en çok 8 eşzamanlı ses, aynı ses için bekleme süresi, savaş sesleri yalnız kamerada görünen yerde); (3) "Nasıl oynanır" rehberi: `?` butonu (menülerde sağ üst, oyunda üst şerit), sayılar `/api/guide` (`GuideMapper`, balance.json'dan).
- Kararlar/notlar: ses kancaları ve ribbon metinleri Türkçe; rehber metni kısa tutuldu; `?` Esc ile kapanır. Atlanan iş yok.
- Açık: Görev 7 (yalnız fikir). "Geri dönüş sorunu" fikir listesinde (büyüme maliyeti %8 → %6 dahil).

## Görsel yenileme durumu
- Aşama 1 (arayüz) ve 2 (harita) bitti. Harita düzeltmeleri (toprak lekeleri, ormanda seçilebilirlik, yollar bir kez dokuya) bitti.
- Aşama 3 (efektler): `client/src/scene/Effects.ts` (kıvılcım, toz, ok izi, hasarlı kalede duman/alev, çöküş, kamera sarsıntısı; `?fx=0` kapatır, azaltılmış hareket tercihinde sarsıntı yok), ekran geçişleri (kamera fadeIn, savaş başlangıcında parlama, ekran değişiminde CSS kayma). Ölçüm/ekran görüntüsü araçları: `tools/shot-fx.mjs`, `tools/shot-forest.mjs`, `tools/shot-map.mjs`, `tools/fps.mjs`.

## Ses durumu
- Gerçek sesler: `client/public/audio/sfx` (OGG + MP3 yedek), `music` (prep.mp3 hazırlık/lobi/maç sonu, war.mp3 savaş; ~0,8–0,9 MB). `client/src/audio.ts`: kayıtlar ilk tıklamada yüklenir, yüklenemeyen ya da kaydı olmayan ses (ok, zafer, yenilgi) prosedürel kalır; müzik çapraz geçişli (2,5 sn); müzik ve efekt ses düzeyi ayrı (varsayılan müzik 0,2, efekt 0,3). Ses kontrolü: `node tools/audio-check.mjs` (dev sunucu + Vite gerekir). ffmpeg: `winget install Gyan.FFmpeg` ile kuruldu (yeni kabukta PATH'e girer).

## Zor bot
- `BotDifficulty.Hard`, `bots.hard` (balance.json): düşünme 0,7–1,2 sn, tepki 1–2 sn, hata 0, `holdWeapons` (silahı depoda tutar, `BotContext.ArmFromStore` ile saldırı/orman akınında kuşanır), `counterUnits` (`BotContext.CounterPick`), `opportunist` (başkasının kuşattığı kapı), `scoutFactor` 0,5, `upgradeEarly`. Ölçüm: `python tools/bot-zor.py` (`KF_PLAYERS=3` ile 3 oyuncu); `BattleSim bot --zorluk zor-orta`. Sonuç: Zor vs Orta ~%78 (hedef %75–85); 3 oyunculu maçlarda Zor ≈ eşit pay. Asıl kazanç silahı depoda tutmaktan.

## Kuşanma süresi (karar verildi: 15 sn)
- `match.armSeconds` = 15 (kullanıcı kararı): işçiyi askere çevirmek 15 sn sürer; bu sürede ne çalışır ne savaşır, nüfusa sayılır ve işçi gibi yemek yer (`Castle.Arming`, `UnitView.Arming`, `CastleView.ArmSeconds`). Paralı asker anında. Arayüz: kale penceresinde "Kuşanıyor: N" satırı ve birlik başına "kuşanıyor N", +1/+5 düğmelerinde süre ipucu, haritada kale avlusunda "Kuşanıyor: N" tabelası.
- Ölçüm: `docs/bot-kusanma-tablo.md` (süre karşılaştırması: 0/10/15/20 sn) ve `docs/bot-ongoru-tablo.md` (öngörülü Zor, 15 sn).
- Zor botun öngörüsü (`bots.hard`: `foresight`, `garrisonShare`; `ForesightModule`): ordu görüşe girer girmez (tepki süresini beklemeden) depodaki silahları kuşanır ve paralı asker kiralar; savaşta evde, bildiği en büyük rakip ordusunun `garrisonShare` kadarını (0,2) kuşanmış tutar; saldırı kararında kuşananları sayar, kuşanma bitince yola çıkar. Zor vs Orta ~%71 (hedef %75–85'in biraz altında; garnizon 0 iken ~%74, fark hata payı içinde).

## Ulak
- `SendEnvoy` (hub `SendEnvoy`): rakip kaleye yemek/odun/demir/altın (toplam en çok `envoy.maxCargo` = 40) ve/veya mesaj (`envoy.maxMessageLength` = 140, denetim karakteri yok; sunucuda `EnvoyMessage.Check`). Gözcüyle aynı hak (`maxScouts`) ve hız; `MissionKind.Envoy` (ScoutMission'ın bir türü): iz bırakmaz, rapor getirmez, görüşü yok, yakalanmaz, hazırlık sonu gözcü yasağına tabi değil. Yük gönderilirken kasadan düşer, varınca alıcıya girer (alıcı yolda elenirse ulakla geri döner). Mektup yalnız alıcının `CastleView.Letters`'ında; başkaları görüşte `kind: envoy` olarak gönderenin renginde (`ownerSeat` dolu) görür; yük ve mesaj gizli.
- Mesaj istemcide HER ZAMAN `textContent` ile gösterilir (`ReportTags.showLetter`); `tools/shot-envoy.mjs` bunu işaretli bir mesajla denetler. Küfür filtresi `envoy.profanityFilter` (varsayılan kapalı).
- Botlar ulak göndermez; yük toplamı `bots.giftThreshold` (30) ve üstündeki hediyeyi alınca göndereni `bots.giftPeaceSeconds` (90) sn hedeflemez (mesajı okumaz).

## Kale düşmesi, sur ve esir (2026-10-28 gece: kale canı KALKTI)
- Kale canı, sur seviyeleri, `UpgradeWall`, `WallModule`, can barları ve `war.castleHp/siegeSeconds/archerSiegeMultiplier` silindi. Saldıran kapıdaki savaşı kazanırsa (boş kale dahil, tek asker kalsa bile) kale düşer. `walls.archerDefenseBonus` (+%25) kapıdaki savunan okçular için hep geçerli. Sur hep Sv3 görünümüyle çizilir (`WorldScene.drawWalls`, `Walls.ts`).
- Esir: `war.prisonerShare` (0,5): kale düşünce savunanın SAVAŞA GİREN ordusunun (ölenler dahil, tür başına yuvarlanır) o payı saldıranın askeri olur (`GameState.TakePrisoners`, `Castle.AddPrisoners`); orduyla eve döner, yolda yemek yer ve nüfusa sayılır; `FallLoot.Prisoners`, rapor ve eve dönüş bildiriminde "+N esir". Botlara özel kod eklenmedi: esirler dönen ordunun asker listesinde görünür (Regroup vb. onları sayar).
- Işınlanma hatası (düzeltildi): yönlendirilen ordunun `Out` rotası yolun ortasından başlar; eve dönüş `Out.Route.Reversed()` ile kurulunca ordu kaleye değil yönlendirme noktasına "dönüp" kaleye ışınlanıyordu. Artık `GameState.WayHome` yönlendirilmiş ordular için bulunduğu yerden kendi kapısına rota kurar. `GameState.ContinuityViolations` her tick konum sıçramasını ve "eve vardı ama kapıda değil" durumunu sayar (hedef 0); `ContinuityTests` rastgele emirlerle (×1/×5/×20) denetler, BattleSim raporu da yazar.
- Binalar: yükseltme süreleri yarıya (15/30 sn), Sv4 (10 kişi, ×2,5; 80 odun + 50 demir, 60 sn) ve ayrı görünümü (`layout.ts`). Kıtlık `war.famineStartSeconds` (240). Sandık altını 30–45 (köy 30–48, kamp 60–90), gözcü ve ulak hızı 2,5. Harita etrafına 14 karo su (`WATER_PAD`).
- Ölçüm: `docs/gece/olcum.md` (BattleSim `--zorluk bekleyen` yalnız bekleyen bot deneyi için).

## Yollar (görünüm)
- `client/src/scene/Roads.ts`: yol geometrisi sunucununki (değişmedi); zemin 4 px hücrelerle bir kez canvas dokularına çizilir (ragged kenar, tekerlek izi, çakıl, ormanda dar patika), kavşaklarda CC0 yön tabelası, kapı önü taş döşeme sur seviyesine göre (`GatePaving`). `tools/shot-roads.mjs`.
