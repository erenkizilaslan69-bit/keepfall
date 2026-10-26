# Keepfall — Claude için proje notları

Kullanıcıyla **Türkçe** konuş. Kısa ve öz raporla. Kod, yorum ve commit mesajı bağlamı: kod yorumları İngilizce, oyun metinleri ve commit başlıkları Türkçe.

## Oyun (özet)
2–4 kişilik tarayıcı kale stratejisi. Her oyuncunun tek kalesi var. **Hazırlık** (10 dk): işçileri çiftçi/oduncu/madenci/demirci yap, silah üret, asker hazırla, orman (sandık, köy, haydut kampı, ortada büyük kamp) yağmala, gözcü gönder, paralı asker kirala (altınla). **Savaş** (5 dk): ordular yollarda yürür, yolda ve kale kapısında çarpışır; kale canı 500, sıfırlanan elenir ve izleyici olur. Son ayakta kalan kazanır; süre dolarsa en yüksek nüfus. 15 dk ve 30 dk modu var. Botlar (Kolay/Orta) lobide eklenir. Ayrıntı: `README.md`.

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
7. **Asset'ler repoda değil** (`client/public/assets/` .gitignore'da, Tiny Swords paketi). Ekleme/commit etme.
8. Satır sonu: dosyaların mevcut biçimini koru (çoğu LF; BOM ekleme). Python ile dosya düzenlerken BOM/CRLF değiştirme.
9. Test sunucusunda tarayıcı bölmesi gizliyken Phaser çizmez; ekran testi için başsız Chrome (CDP) kullan (örnek: `tools/replay-check.mjs`).

## Test rutini
`dotnet test -c Release` (198 test) → `node tools/run-smoke.mjs` (~2–3 dk; kendi test sunucusunu 5081'de, savaşı 15 dk olan geçici bir config kopyasıyla açar ve kapatır; Production çalışırken de koşar, kilitlemez) → istemci için `npm --prefix client run build` (tsc dahil).
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
- Gözcüyle erzak, para ve mesaj gönderme (başka oyuncuya).
- Geri dönüş sorunu: savaş kaybeden oyuncu toparlanamıyor, nüfus ve ordular az. Aday çözümler: kale muhafızları, sığınan köylüler, son çiftçi uyarısı, büyüme maliyet artışını %8'den %6'ya çekmek. Detaylı düşünülecek.

## KALDIĞIM YER (2026-10-27, gece işleri bitti)
Görev 0–6 ve kullanıcı istekleri bitti, hepsi push edildi; Production (5080) son commit'le çalışıyor, test sunucuları (5081, 5174) kapalı, tünel KAPALI (kullanıcı 'tüneli aç' diyene kadar kapalı kalsın; oynamadığı zamanlarda da kapat).
- **Ordu yeniden yönlendirme**: yürüyen/dönen (savaşta olmayan) ordu haritada tıklanınca ordu penceresinde "Yeni emir": başka rakip kale (yalnız savaş fazı) ya da ormandaki yer (köy ≥3 asker). `RedirectArmy` komutu, `WorldMap.RouteFrom` (bulunduğu yoldan en kısa), dönen ordu da yeniden çıkabilir ve ganimeti taşır. Orta bot: saldırıdan dönen ordu uzak yarıdayken zayıf bildiği bir hedefe yönelir (`regroups`). Ölçüm: Orta vs Orta saldırısız %14, nüfus 23,6; ama eleme ile biten maç %17 → %41 (botlar daha çok bitiriyor; fazla görünürse `blindMargin`/`attackMargin` yeniden ölçülür, sayılara kullanıcı onayıyla dokun).
- **Tümü / Yarısı** butonları (kale ve orman yeri saldırı pencereleri).
- **Gece işleri (kullanıcı uyurken)**: (1) hata taraması: `guarded()` ile kare döngüsü/UI/mesaj işleyicileri bölüm bölüm korumalı (`client/src/error-report.ts`), `client-errors.log` yoktu; (2) ses efektleri: `client/src/audio.ts` (Web Audio, dosya yok; üst şeritte ♪ ve ses düzeyi, localStorage `keepfall.sound`, varsayılan 0,3, en çok 8 eşzamanlı ses, aynı ses için bekleme süresi, savaş sesleri yalnız kamerada görünen yerde); (3) "Nasıl oynanır" rehberi: `?` butonu (menülerde sağ üst, oyunda üst şerit), sayılar `/api/guide` (`GuideMapper`, balance.json'dan).
- Kararlar/notlar: ses kancaları ve ribbon metinleri Türkçe; rehber metni kısa tutuldu; `?` Esc ile kapanır. Atlanan iş yok.
- Açık: Görev 7 (yalnız fikir). "Geri dönüş sorunu" fikir listesinde (büyüme maliyeti %8 → %6 dahil).
