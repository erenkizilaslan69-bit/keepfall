# Keepfall — Devir Notu (güncel: 2026-11-10; bölüm 0A en yeni durumdur, altındakiler 2026-11-05 tarihli)

Bu belge, yeni bir oturumun / yeni bir asistanın projeye kaldığı yerden devam edebilmesi için yazıldı.
Kural kaynağı yine `CLAUDE.md`; ayrıntılı teknik plan `docs/sonraki-plan.md`. **Önce bölüm 0A'yı oku; altındaki bölümlerde "8 dk hazırlık", "AI görselleri kaldırılacak", "fragman yeniden çekilmeli" gibi eski ifadeler geçebilir, 0A bunları geçersiz kılar.**

---

## 0A. EN GÜNCEL DURUM (2026-11-07 → 11-10)

**Hedef:** ücretsiz **Steam demosu**, sonra tam sürüm. Plan ve aşama durumu: `docs/steam-plani.md` (A–F). Karar yetkisi Claude'da ("patron sensin, takılırsan sor"); Eren'e yalnız hesap, para, yayın ve geri dönüşsüz kararlar sorulur. Dal: `dev` (hepsi push'lu, son commit `fe869e9` + bu not). `main` ve Render hâlâ donuk, deploy yok.

**Bitenler (hepsi dev'de):**
- **A Meydan Okuma** (8 görev + günlük, `config/challenges.json`, `docs/meydan-okuma.md`); yıldız eşikleri insanla ölçülmedi.
- **B Elenme sonrası döngü** (5 sn sonra kalan maç hızlı oynatılır, "Maçı izle / Yeni maç / Menü"); **"ajan" fikri** yalnız tasarım (`docs/ajan-fikri.md`), Eren'in kararı bekliyor, kod yok.
- **C İlerleme** (30 başarım, krallık ustalığı, kozmetik, soyut `ProgressStore`; `docs/ilerleme.md`, `docs/basarimlar.md`).
- **D "Kim kimi kandırdı?"** maç sonu özeti (`docs/kandirma-ozeti.md`).
- **E Denge:** `combat.meleeActiveRows: 2` UYGULANDI (Eren onayı 2026-11-07; ikinci sıra da vurur, istemci oynatması `BattlePlayer.ts` ACTIVE_MELEE_ROWS). Ölçümler `docs/denge-sira-sonrasi.md`. Başlangıç modu (ilk maçlarda krallık yok, sıra kilitli) var.
- **F Steam paketleme HAZIRLIĞI:** Electron çevrimdışı demo kabuğu (`tools/pack-steam.mjs`, `steam-check`), `SteamProgressStore` taslağı (app id yoksa kapalı), mağaza taslağı `docs/steam-magaza.md`, paketleme/lisans `docs/steam-paketleme.md`. Gerçek Steamworks SDK ile başarım/bulut/rich presence DENENMEDİ (app id yok).
- **Arkadaş testi düzeltmeleri:** yollar genişledi, ordu sayısı daha görünür, ordular karşılaşınca bekleme animasyonu düzeldi, demircide silah ikonu+adet, kalede asker portresi+adet, keşiş silah ikonu yeşil artı.
- **Üç taraflı kapı kuşatması** (`docs/uc-tarafli-kusatma-plani.md`, ölçüm `docs/uc-tarafli-kusatma-olcum.md`): kapıda kuşatma sürerken gelen ikinci ordu artık BEKLEMEZ, savaşa katılır (savunan + 2 saldıran). Saldıranlar varsayılan önce kaleye vurur, "diğer saldıran" seçilebilir; kale yalnız ayakta kalan son saldırana düşer, esir/ganimet ona gider. Simülatör N taraflı (`SimulateMulti`), `war.joinSiege` (true) / `war.siegeMaxAttackers` (3) anahtarları (kapatınca eski bekleme). Bot dengesi önce/sonra aynı (hata payı içinde). **Canlı üç taraflı savaş gözle görülmedi, 1280x720/1920x1080 önce/sonra görüntü alınmadı**; duman testinde katılım tetiklenmedi (yalnız birim testleri `SiegeJoinTests`).
- **Steam öncesi denetim** (`docs/steam-oncesi-hata-raporu.md`, `docs/steam-oncesi-performans.md`): hub'a elle yazılmış geçersiz enum maçı donduruyordu (düzeldi, fuzz testleri), maç başına bellek sızıntısı (düzeldi), kamp ateşi/işçi çiti her karede çiziliyordu (düzeldi), başlangıç hızlandı. Testler en son: ~375 birim testi, duman ~268 denetim, tsc temiz (alt oturum bildirdi).

- **Ev sahipli çok oyunculu (2026-11-11; karar: resmi sunucu YOK):** Steam sürümünde odayı kuran oyuncunun bilgisayarı sunucu; arkadaşlar LAN/doğrudan IP (47800) ya da Steam lobisi + Steam P2P tüneli ile bağlanır. Mimari, kütüphane (steamworks.js, MIT), ölçümler ve Eren'in Steam testi adımları: `docs/steam-paketleme.md` §7–8. Kod: kabuk `tools/steam/shell/{main,mp,tunnel}.js`, istemci `client/src/hosted.ts` + `net.switchServer`, sunucu `GuestPort` / `TakeoverSeconds` / `HostedMatch` (web sunucusunda hepsi kapalı). Denetimler: `node tools/host-check.mjs` (+ `ABRUPT=1`), `node tools/tunnel-check.mjs`, `HostedGameTests`. **Güvenlik turu (2026-11-11):** konuğa yalnız `/hub` + `/version` açık (dosyalar, API'ler kapalı; tarayıcıdan katılma kalktı), kabukta kapı bekçisi (`gate.js`) + sunucuda `GuestGate` sınırları, ev sahibi lobiden oyuncu çıkarır, LAN kapısı yalnız "LAN / IP" oyununda açılır; saldırı yüzeyi ve sınır tabloları `docs/steam-paketleme.md` §9, fuzz `node tools/host-fuzz.mjs`. **Gerçek Steam hattında (iki hesap) DENENMEDİ**: tünel, davet, lobi listesi. Yeni arayüz metinleri yalnız TR/EN (diğer 13 dil İngilizceye düşer). Lobi/menü ekranlarına gözle bakılmadı (görüntüler `art/shots/host/`).

- **Gece turu (2026-11-11; ayrıntı ve sabah raporu `docs/gece-durumu.md`):** maç sonu klip yakalama KALDIRILDI; düşen kale opak yıkıntı, hayalet ordu dağılarak kaybolur (`Effects.ruin`, `Movers.dissolve`); ayarlar penceresi sekmeli (Ses / Görüntü / Dil / Oyun / Kontroller; ana ses ve arayüz ölçeği yeni); ulak filtresi iki katman (nefret söylemi sunucuda her zaman, hafif küfür alıcının ayarı; `docs/kufur-filtresi.md`); krallık paneli kart (`?kd=b` öteki düzen); ana menü yenilendi (`?home=a` eski düzen); 65 yeni metin 13 dilde. `i18n-extract` yalnız `--keep-order` ile çalıştırılır. Testler: 432 birim testi, duman 273/274 (bilinen zamanlama denetimi), host-fuzz 38/38, ui-audit masaüstü raporu `docs/ui-audit-gece.md` (2 kritik düzeltilmedi).

- **Küçük cila turu (2026-11-12):** (1) krallık kartı: dört krallığın ad/unvan/kimlik cümlesi/yetenekleri 15 dilde doğrulandı (`node tools/kingdom-text-check.mjs`; veri doğruydu, karışıklık görüntü aracındaydı), Kâhin panelinde rakip birimler adıyla yazılır; (2) ui-audit: savaş raporu etiketi parlarken soldan taşmıyor, Almanca kale/düşman penceresi sığıyor, denetim kapatma çarpısını yatay kaydırma saymıyor (rapor `docs/ui-audit-cila.md`: kritik 0); (3) ana menü (masaüstü): Oyna'nın altında tek "Arkadaşlarla oyna" (içinde ev sahipliği, kimler katılabilir, açık oyunlar; adres kutusu yalnız kapalı "LAN / IP (gelişmiş)" içinde), Steam yapısında menüde ad kutusu yok (Steam adı; Ayarlar > Oyun'da değişir); web/itch aynı; (4) ayarlarda özel açılır liste (`ui/select.ts`, gerçek `<select>` altta kalır) ve onay kutusu görünümü, masaüstünde sayfa kaydırma çubuğu gizli (`html.kf-desktop`); (5) hayalet ordu yolda başka orduya rastlayıp dağılırsa rakip tarafta da solar (`Movers.metOnRoad`, yalnız çizim). Araçlar: `check-settings-controls.mjs`, `shot-phantom-road.mjs`, `shot-home.mjs EXPAND=1`. Testler: 432 birim testi, duman 274/274, host-check 48/48 (ilk koşu paketten hemen sonra 6 düştü, iki yeniden koşu temiz), ui-audit 4 dil masaüstü kritik 0.

- **Küçük düzeltme turu (2026-11-12):** Kâhin panelinde ham birim kimliği (kesis, suvari) taraması: panel zaten düzeltilmişti, sahte rapor satırı da ortak `unitName`'e bağlandı; `lang-audit` artık ham kimlik basan her metni yakalar (15 dil temiz, yeni "oracle-deck" ekranı), `tools/check-oracle-deck.mjs`; onay kutusu tiki kutunun ~%66'sı (`tools/shot-checkbox.mjs`, 100%/115%); ana menü alt yazısı "Gizli krallıklar. Sahte ordular. Tek savaş." (13 dil, koyu şerit); "Açık oyunları listele" "Oyun kur" ile aynı satırda. Testler: i18n-check 15 dil %100, lang-audit 15 dil, duman 274/274.
- **Gerçek Steam testi sonrası düzeltme turu (2026-11-12):** Test (480, iki hesap, iki bilgisayar) iyi geçti; arkadaş listesinden davet + lobi + tünel sağlam. (1) "Steam'den davet et" sessizdi: sebep, overlay'in Chromium anahtarlarının (`in-process-gpu`, `disable-direct-composition`) `app.ready`'DEN SONRA eklenmesiydi (etkisiz); `electronEnableSteamOverlay` artık `whenReady`'den önce çağrılır (`enableOverlay`, main.js). Overlay açıldı mı SORULAMAZ (steamworks.js'te yok), overlay'siz davet API'si de yok: düğmeye basılınca altında "açılmadıysa arkadaş listesinde sağ tık → Oyuna davet et" ipucu çıkar (15 dil). Overlay'in gerçekten açıldığı iki Steam hesabıyla DENENMEDİ: bir sonraki testte bak. (2) Kale penceresinde "Askerler/Savunma" kelime ortasından bölünüyordu: sebep geçen turda `.tab`'a koyduğum `overflow-wrap: anywhere`; sekmeler artık sığmazsa alt satıra kayar, kelime bölünmez; lang-audit "bölünen kelime" denetimi (+ kale penceresi 4 sekme) 15 dilde 0, görüntü `tools/shot-castle-tabs.mjs`. (3) `shell.log` özeti: yalnız ev sahibi tarafı vardı, hata/kopma/yeniden deneme yok; günlükte saat ve p2p/lobby satırı yoktu, saat damgası eklendi (davet için `invite dialog asked/failed` satırı). (4) Zip'ten "Erişim engellendi": `docs/steam-paketleme.md` bilinen sorun + kod imzalama notu (satın alma yok). Testler: dotnet 432/432, i18n-check 15 dil %100, duman 274/274, steam-check ve host-check geçti, paket yeniden derlendi.
- **Gece turu 2: maç modları, XP/seviye, görev takibi (2026-11-12):** (A) Üç mod, lobide ev sahibi seçer, ana menüde "Oyna" altında da seçilir (tarayıcıda hatırlanır): Hızlı 5+10 (eskisi, `shortMode*`/`prepSpeed` tek kaynak), Standart 10+10, Uzun 15+10 (`match.modes`; ikisi düz hızda). Hazırlığa bağlı gözcü kilidi ve bot hızı moda göre; açık oyunlar listesi, Steam lobi verisi ve Rich Presence modu gösterir. Ölçüm ve gerekçe `docs/maç-modlari.md`; `BattleSim bot --mac-modu hizli|standart|uzun`, `tools/mode-match-check.mjs` (her moddan tam maç). Rehberli maç ve meydan okumalar süreleriyle aynı. (B) XP/seviye mevcut ilerleme depolarına bağlandı: sunucu XP'yi maç SONUNDA hesaplar (`Progress/Xp.cs`: maç 40, galibiyet +60, mod ×1,0/1,4/1,8, 11 "an" kandırma günlüğünden), 30 seviye (`docs/ilerleme.md` tablosu), 13 unvan, 8 sancak deseni (kendi renginde tuvalle çizilir, krallığı ele vermez), profil bölümü, maç sonu XP dökümü + animasyon, lobide Sv·desen·unvan; hub `SetProfile` yalnız bilinen kimlikleri kabul eder. Seviye istemcide tutulduğu için sahte seviye mümkün (yalnız görünüm). (C) Oyun içi görev takibi (J, Ayarlar > Oyun), kendi sayılarıyla (`CastleView.Stats`). Testler: dotnet 457, duman (profil/mod/XP denetimleri), host-fuzz'a SetMode/SetProfile, i18n-check 15 dil %100 (+130 yeni metin). Açık: XP eğrisi gerçek oyuncuyla ölçülmedi; Uzun modda botlar ~700 odun+demir biriktirir (israf, dokunulmadı).
- **Cila turu 3 (2026-11-12): çoğul, lobi, bot stoku, DE sekme.** (1) Sayıya bağlı 22 metin (görev hedefleri, yıldız, rapor, oyuncu sayısı vb.) `{0:tekil|çoğul}` işaretiyle 15 dilde doğru çoğul (en/de/fr/es/pt/it iki, ru/uk/pl üç biçim; zh/ja/ko tek); `tools/plural-scan.mjs --check`, lang-audit "çoğul" ekranı ("1 + çoğul"), i18n içe aktarıcı/denetçi `{0:..}` işaretini tek boşluk sayar. (2–4) Lobi: boş koltuk "Boş yer 3" tek satır, bot düğmeleri yanında/altında (`tools/check-lobby-seats.mjs`, 15 dil), bot zorluk listesi oyunun seçici görünümünde, oda kodu yalnız başlık şeridinde (tekrarlayan kutu `.kf-vh` ile görünmez, kopyala düğmeleri çalışır). (5) Rehberli maçta görev takibi gizli, J ya da öğretici bitince açılır. (6) Bot: Uzun hazırlıkta (≥840 sn) biriken odun+demir Orta/Zor botlarda ordu payına dönüşür (`bots.surplus*`, bonus 0,25): Uzun'da depo ~700 → ~370, Hızlı/Standart çıktıları birebir aynı (docs/maç-modlari.md); Zor/Orta Uzun'da %61 → %80 (açık not). (7) DE: kale penceresi sekme yazısı küçük, 4 sekme tek satır.
- **Gece turu (2026-11-12 gecesi, gözetimsiz): ulak, savaş müziği, "Oyna" lobisi, krallık rozeti.** (1–5) Ulağın kendi hakkı: aynı anda en çok `envoy.maxAtOnce` (1) ulak yolda, `envoy.maxPerMatch` 0 = sınırsız; gözcü hakkından ayrıldı; sunucu doğrular, Entrikacı sahte ulağı dahil; arayüzde bekleme durumu (düğme pasif, süre, ipucu); botlar hiç ulak göndermez; host-fuzz "art arda 15 ulak", EnvoyTests. (6) Savaş müziği Kulakovka "Epic Medieval" (Pixabay) `war-epic.*`: çapraz geçişli kesintisiz döngü, −13,6 LUFS, hazırlıkta önceden yüklenir, 3,5 sn geçiş; krediler/lisans güncel; GERÇEK KULAKLA DİNLEME SENDE (başsız testte ses bağlamı askıda). (7) "Oyna" = tek kişilik yerel lobi (3 Orta bot, otomatik hazır, deste/mod/botlar hatırlanır, oda kodu/Steam lobisi/LAN yok; mod seçici lobide); ilk "Oyna" (öğretici) hâlâ rehberli maça gider; eski anında-maç düğmesi `#quick` araçlar için görünmez durur. (8) Krallık rozeti "hatası": başlangıç kipinde (ilk 3 maç, rehberli, ilk iki meydan okuma) krallık tasarımca YOK; sonrasında Hızlı oyna/lobi/ev sahipli maçta doğru çıkıyor; düğmenin yerine açıklayıcı not eklendi. Testler: dotnet 458, duman, host-check, host-fuzz, steam-check, i18n-check 15 dil, lang-audit, rehberli maç x1, audio-check; `tools/check-solo-lobby.mjs`, `shot-envoy-wait.mjs`, `shot-kingdom-badge.mjs`.
- **Düzeltme turu (2026-11-12): başlangıç kipi, lobi zorluğu, ulak/gözcü arayüzü, görev listesi, tek kişilik lobi.** (1) Krallıksız oynanan yalnız REHBERLİ maç (başlangıç kipi `Starter` yalnız `guided && !fullRules` ile kurulur); ilk normal maçtan krallıklar açık; ilk 3 NORMAL maçta botlar Kolay (`prefs.normalMatchesStarted`, rehberli ve meydan okuma sayılmaz); meydan okumaların kendi `starter` kuralı aynen kaldı; "başlangıç maçı" notu kalktı, ilk krallıklı maçta bir kez krallık ipucu (`hints.ts`, ferman kapanınca çıkar; 15 dil). (2) Tek kişilik lobi botun gerçek zorluğunu gösterir (yeni oyuncuda Kolay + "ilk maçların için kolay" notu); bot satırında zorluk tıklayınca döner (hub `SetBotLevel`, yalnız oda sahibi, `MatchModeTests`, host-fuzz). (3) Ulak yoldayken gözcü düğmesi pasif olmaz ve yalnız gözcüyü gösterir (`scoutButton` ulak görevlerini saymaz); ulak açıklaması "Gözcüden bağımsızdır: aynı anda yolda tek ulağın olabilir" (15 dil); `tools/shot-envoy-wait.mjs` sunucuyla da doğrular. (4) Görev listesi rakip/kale/bina pencereleri ve krallık paneli açıkken gizlenir (CSS `:has`), `tools/check-quests-panels.mjs` 1280x720 + 1920x1080 EN+TR. (5) Tek kişilik lobide "oda sahibi/hazır" etiketi ve isim kutusu yok (ad Ayarlar > Oyun'da, artık her sürümde), "Odadan çık" yerine "Ana menüye dön". Testler: dotnet 459, duman, host-check, steam-check, host-fuzz, i18n-check, lang-audit, check-lobby-seats 15 dil, check-solo-lobby, shot-kingdom-badge, rehberli maç x1.
- **Ekran turu düzeltmeleri (2026-11-13).** Tam tur: `node tools/tam-tur.mjs <tr|en> ALL` + `tools/tam-tur-pack.mjs` (82 ekran × TR/EN, ZIP'ler `art/shots/tam-tur/<tarih>/`, repoya girmez; sahnelenen ekranlar index'te işaretli). (1) Ev sahibi lobisinde iki kod: oyun hatası DEĞİL, turun sahte adresiydi; gerçekte adres `hostLink(.., r.code)` aynı odanın kodunu taşır; araç artık gerçek kodu kullanır. (2) Düşen KENDİ kalen `updateWall`'da yarı saydam (0,55) çiziliyordu: alfa her zaman 1 (izleyici, genel harita, kendi görünüm). (3) Ana menü hatası yeni deneme (`run`) ya da yeni banner (`showBanner`) ile temizlenir. (4) Boş avatar: tur sahte koltuk 0 kullandı; gerçek koltuklar 1'den başlar. Yine de avatar numarası her koltukta geçerli (negatif modulo). (5) Savaş raporu açıkken 'Kalen düştü' kartı bekler (`ReportTags.onOpened/onClosed` → `updateFinish`), tek karartma. (6) XP anları ve 'Kim kimi kandırdı' AYNI `DeceptionLog`'dan beslenir (`Achievements.FactsOf` actor süzgeci; sonuç görünümü tüm kayıt); tur iki ekranı ayrı sahte veriyle kurduğu için tutarsız görünmüştü; gerçek oda testi `The_xp_moments_and_the_who_fooled_whom_list_are_fed_by_the_same_log`. (7) Hakkında/Gizlilik ayrı pencerede (`showInfo`; Esc yalnız onu kapatır). (8) 1920x1080+ fare ekranında varsayılan arayüz ölçeği %115 (kayıtlı seçim geçerli; `uiScalePref`), panel metni ≥14 px (`ui/min-text.ts`: 14 px altı metin tabana çekilir; `tools/check-textsize.mjs` 1280x720 + 1920x1080 TR/EN sıfır). (9) 'İpuçlarını göster' zaten varsayılan AÇIK (temiz profilde doğrulandı; turun kendi başlangıç ayarı kapatmıştı). (10) Tur aracı: rakip paneli ulak/saldırı bölümüne kaydırılır, ekonomi önce yemek (tarlada işçi, hazırlıkta açlık yok). Not: `tools/ui-audit.mjs` Playwright ister (bu makinede kurulu değil), yerine check-textsize + lang-audit koşuldu; `lang-audit.mjs` artık `URL` ortam değişkenini okur.
- **Küçük düzeltme (2026-11-13): tanılama kutusu, lobi düğmeleri, kıtlık şeridi.** (1) Kırmızı "deviation …" kutusu yalnız dev istemcide (`import.meta.env.DEV`) vardı; Steam/itch/CrazyGames yapılarına HİÇ girmez (steam-check paket içinde `DebugLayer` izi arar). Dev'de de artık yalnız `?debug=1` ya da F9 paneli açıkken ekrana çıkar (kayıt sunucu günlüğüne yine gider). Sapmanın nedeni: sayfa bir an takılınca (panel açılışı, yoğun makine) haber, resim yetişmeden önce ölçülüyordu; sütun zıplamıyor, kare başına en çok 14 karo koşarak yetişiyor. Haberden önceki kare aralığı > 400 ms ise artık sapma sayılmaz (`Movers.corrections.frameGapMs`); gerçek sapma testi `tools/movers-stall-check.mjs` geçer. (2) Lobi alt düğmeleri (Ana menüye dön / Maçı başlat / Odadan çık / Hazırım) yazıya göre genişler, tek satır, 15 dil × 3 pencere boyutu (`tools/check-lobby-buttons.mjs`); satır sığmazsa uyarı metni kısalır, satır sarar. (3) Uyarı şeritleri (kıtlık, yaklaşan ordu) fareyle oynarken sağ üstte (`touch.css` `@media (pointer: fine)`), kale etiketinin üstüne binmez; dokunmatik düzen aynı (üst orta). `tools/shot-hunger.mjs`. lang-audit: lobi 15 dilde 0 (ja lobi 7 → 0); forge-window/kingdom-panel'deki 1'er kırpılma bu işten bağımsız ve her koşuda oynuyor.

**Açık / yarım işler:**
1. **Steam mağaza medyası: YAPILMADI.** Yapay zekâ içeren ve gereksiz eski medya silindi (`art/video`, `art/shots/steam`, `art/promo` klipleri/logoları/kapakları; `art/shots/turc-*`, `turd-*`). Kalanlar: `art/steam/` içinde 8 ekran görüntüsü (Eren'in 7 Kas maç kaydından, `Downloads\Kayıt 2026-11-07 222704.mp4`), tek betik `tools/steam-*.mjs` + `docs/steam-medya.md` (nasıl yeniden üretilir). Üretilen fragman Eren beğenmedi ve silindi; **fragmanı Eren kendisi ayarlayacak** (referans: Eren'in eski yapımı `Downloads\keepfall-trailer-1080p.mp4`, 61 sn: kale açılışı, "Every soldier…", "SCOUT.", "DECEIVE.", "…one castle falls.", logo kartı). Yeni fragmanda yapay zekâ görsel/logo YOK (bitiş kartı: oyunun kendi yazısı + "Art: Tiny Swords by Pixel Frog"). Logo yapay zekâ üretimiydi; Steam yapay zekâ beyanı kararı Eren'de. Üç taraflı kuşatma fragman/görüntülerde yok.
2. **5090** (arkadaş testi, dev derlemesi, `http://192.168.1.3:5090/`) üç taraflı kuşatma dahil güncel; Eren arkadaşlarla deneyecek, geri bildirim bekleniyor.
3. **Kök klasördeki 3 zip** (`keepfall-itchio.zip`, `keepfall-crazygames*.zip`) ve `client/dist-itch`, `dist-crazy`: eski AI görselli sürümü içerebilir; silinsin mi Eren'e soruldu, cevap yok.
4. `art/promo/brand/redlion*` (Eren'in marka görselleri): AI olup olmadığı bilinmiyor, dokunulmadı.
5. Bilinen riskler: doku belleği ~315 MB (zayıf GPU'da zorlar), maç başlangıcında ~1 sn takılma, `SpectatorFeed.Capture` saniyelik maliyeti, çevrimiçi sunucuda IP başına oda sınırı yok, `army-check` ara sıra tek "0 drawn" uyarısı, F11 tam ekran ve kod imzalama (SmartScreen) denenmedi, Steam sayfasına "D3D11 destekli ekran kartı" gereksinimi yazılmalı (kartsız makinede ~8 FPS).
6. Önceki okçu / Zor bot açık konuları `CLAUDE.md` "Bilinen açık konular"ta aynen duruyor.

**Eren'in vermesi gereken kararlar:** Steamworks hesabı + 100 USD (app id), fiyat (öneri 8–12 USD) ve tarih, Pixel Frog'dan yazılı lisans teyidi (önerilir, bloklamaz; ticari kullanım Eren kararıyla kabul: `docs/steam-paketleme.md` §4), bayrak/flama tasarım seçimi (`client/banner-lab.html`), "ajan" fikri, `kaynaklar.txt` bağlantıları, Meydan Okuma yıldız eşikleri denemesi, zip/dist temizliği, fragman.

**Çalışma notları:** Alt oturumlar aynı klasörü paylaşır; her biri yalnız kendi yollarını `git add` eder. `balance.json` onaysız değişmez (Eren'in "ölçümle kalibre et" demesi ya da açık onayı gerekir; meleeActiveRows onaylıydı). 5090'ı yenilerken önce `Get-NetTCPConnection -LocalPort 5090 -State Established` ile açık oyuncu olmadığını kontrol et. Eren oyun oynarken ağır işleri (render, ffmpeg, başsız Chrome) başlatma. Silme işlemlerinden önce hedefi göster; kullanıcı dosyalarına (`Downloads`) dokunma.

---

## 0B. 15 dil (2026-11-10, dev dalı)
- Diller: en, tr, zh-CN, zh-TW, ru, es-ES, es-419, pt-BR, de, fr, ja, ko, pl, it, uk. Altyapı `client/src/i18n/` (`langs.ts`, `langs/<kod>.ts`, algılama: kayıtlı → `?lang=` → Steam → tarayıcı), terimler `docs/ceviri-sozlugu.md`, çeviri hattı `docs/ceviri-parca/*.tsv` + `tools/i18n-*.mjs`, durum `docs/i18n-durum.md`. Yazı tipleri `docs/yazi-tipi-lisanslari.md` (Fusion Pixel CJK/Kiril, yalnız seçilen dilde yüklenir).
- Mağaza metinleri `docs/steam-magaza-diller/`; AI beyanına "oyun içi ve mağaza çevirileri AI yardımıyla" eklendi (`steam-magaza.md` §6).
- Krediler (`ui/settings.ts`) yenilendi: Gemini cümlesi kalktı; Tiny Swords, yazı tipleri (OFL), sesler (Pixabay Content License + Kenney/OpenGameArt CC0, `docs/ses-lisanslari.md`), LDNOOBW (CC BY 4.0), çeviriler AI destekli, Red Lion Games. Lisans metinleri `client/public/licenses/` (her derlemeye kopyalanır).
- Küfür filtresi: `docs/kufur-filtresi.md`.
- Yerleşim: `node tools/lang-audit.mjs` → `docs/lang-audit.md` (`ui/i18n-fit.css`). Kalan "cut" kayıtları dikey kaydırmalı pencerelerin taşan içeriğidir (İngilizce tabanda da var), yatay kırpılma değil.
- Rehber denetimi dilden bağımsız: `tools/tutorial-check.mjs` geri sayımı oyun durumundan okur; hız için sunucu `Keepfall__AllowSpeedControl=true` ile açılmalı (bin'den çalışınca appsettings.Development.json okunmaz). en, tr, zh-CN, ru rehberi baştan sona geçti (bekleme x20, eylemler x1). `FAST=1` (tamamı x20) rehberi bitiremez: tıklayıcı yetişemez, hazırlık 5. adımda biter ve kale düşer; hata değil.
- Açık: native gözden geçirme (özellikle uk, ja, ko, zh); eski Gemini/Kenney uzun kredi anahtarları sözlüklerde duruyor (zararsız, temizlenebilir).

## 0. Çalışma şekli (değişmeyecek kurallar)

- **Eren** tasarım ve kararları verir; **Claude (sohbet)** tasarım danışmanı ve Claude Code için Türkçe prompt yazarı; **Claude Code** (Eren'in Windows makinesinde, repo `erenkizilaslan69-bit/keepfall`) tüm kodu yazar.
- Her adım ayrı commit + push. Görsel değişiklikte önce/sonra ekran görüntüsü; Tiny Swords içeren görüntüler repoya girmez.
- Denge sayıları (`config/balance.json`) yalnız Eren onaylarsa değişir.
- Sunucu otoriter; gizli bilgi (sis, gizli krallık, deste) yalnız ilgili oyuncuya gider. Smoke test bunu denetler; her turda geçmeli.
- Uzun testlere zaman aşımı koy (tek test 25 dk); takılırsa 30 dk'dan fazla bekleme, rapor ver.
- Eren'e gece saati yüzünden uyarı yapılmaz. Eren dürüst eleştiri ister.
- **Dal kuralı:** `main` ve Render şu an donuk (aşağıya bak). Yeni işler `dev` dalında.

---

## 1. Oyunun özü

Keepfall: 2–4 oyunculu, maç tabanlı kale strateji / sosyal strateji ("parti") oyunu.
- Maç: **8 dk hazırlık** (Eren 2026-11-05'te 10'dan 8'e indirdi) + 10 dk savaş. Kıtlık savaş+240 sn.
- Sorun: oyuncular hazırlıkta beklemekten sıkılıyor → çözüm tasarımı bölüm 5'te.
- Çekirdek ikilem: **"Every soldier is a worker lost."** İşçi ekonomi üretir, asker olunca üretmez.
- Bilgi savaşı: sis, gözcü (yaklaşık rapor ±%20), ulak (mal + serbest metin; küfür filtresi açık), yaklaşan ordu, yolda karşılaşma, ordu geri çağırma/yön değiştirme.
- 4 gizli krallık (rastgele, rakipler bilmez): **Gölge** (sahte ordu, sahte rapor), **Tüccar** (rüşvet, haydut kampı kiralama), **Kâhinler** (herkesin krallığını/destesini görür, savaş tahmini, hileyi görür), **Entrikacılar** (sahte ulak, ordu kılığı).
- 7 birlik, maç öncesi 4'ü seçilir: Okçu, Kılıçlı, Mızrakçı, Kalkanlı, Keşiş, Mancınık, Süvari.
- Kale tek savaşta düşer (kapı savaşını kazanan alır); esir + ganimet.
- Orman: köy (≥3 asker), küçük/büyük haydut kampı, sandık. Paralı asker. Savunma dizilişi.
- Botlar 3 zorluk. Rehberli ilk maç (8 dk hazırlık, düz hız; bot kalkanı ilk 240 sn), ilk 3 maçta varsayılan Kolay bot.

Teknik: ASP.NET Core + SignalR sunucu (1 sn tick), Vite + TypeScript + Phaser 3 istemci, HTML arayüz. Render ücretsiz sunucu + cron-job.org `/ping` (10 dk). MaxRooms=15.

---

## 2. Şu anki durum

### CrazyGames
- 2026-11-04'te masaüstü + sağlam özelliklerle gönderildi (özel oda/davet/mobil bayrakla kapalı).
- **2026-11-05: REDDEDİLDİ.** Gerekçe: "The overall quality of the game does not yet meet the expectations of our platform." Teknik kontrollerin hepsi geçmişti (SDK, boyut 4,2 MB, yükleme 11 sn).
- Muhtemel sebepler (tahmin): ilk dakikalar yavaş (aksiyon 10. dk), maç 20 dk (portal için uzun), oyun menü/pencere ağırlıklı görünüyor, **görsel tutarsızlık** (Tiny Swords + yapay zekâ görselleri karışık), çok oyunculu tasarım ama yalnız botlar.
- FAQ'ya göre anlamlı iyileştirmeden sonra yeniden gönderilebilir. Eren'in CrazyGames'e somut geri bildirim isteyen bir cevap yazması önerildi.
- `dev`'de hazır bekleyen paket: `keepfall-crazygames-build-next` / `keepfall-crazygames-next.zip` (depolama yedeği, Privacy, happytime).

### Yeni yön (Eren'in kararı, 2026-11-05)
- **Steam** + mümkünse **yayıncı (publisher)**. Oyun parti/sosyal strateji olarak konumlanacak.
- Sıra: oyun ve görsel iyileştirme → Steam sayfası (Coming Soon, wishlist) → demo / Next Fest → yayıncıya sunum (bulunamazsa kendi yayın).
- Steam notları: Steam Direct oyun başı 100 $ (1000 $ gelirde geri). Yapay zekâ içerik beyanı zorunlu (2026 Ocak güncellemesi: kod yardımcıları muaf, oyuncunun gördüğü AI içerik beyan edilir) — ama artık AI görselleri kaldırıyoruz. Masaüstü sarmalayıcı (Electron/Tauri) + Steamworks lobi/davet; Render ücretsiz yetmez, ücretli küçük sunucu veya Azure for Students.
- İleride PWA ve Google Play de konuşuldu; önce mobil tarayıcı sağlam olmalı. App Store en son.

### Dal / sunucu durumu
- `main` = CrazyGames'e gönderilen sürüm; **Render `main`'de (`7b47402`) ve DONDURULDU.** (Ret geldiği için artık donuk tutmak zorunlu değil, ama Steam planı netleşene kadar main'i bozmadan `dev`'de çalış.)
- Yerel Production 5080 (main, `publish/`). Dev LAN sunucusu 5090 (`keepfall-dev-lan`), iPhone testi için.

---

## 3. Son iki günde yapılanlar (özet)

- Rehberli maç: bot kalkanı, kuşan→saldır sırası, ikinci tarla adımı (açlık yok), "Yarısı" önerisi + "savunmacı bırak" uyarısı, kaybedilen saldırı ipucu. Rehber x1 testleri geçiyor.
- CrazyGames uyumu: SDK v3 sarmalayıcı (loading/gameplay start-stop, muteAudio, happytime), CORS (tüm origin), dış link temizliği, "Connecting to server…" + yeniden deneme, `/version`.
- Mobil/çok oyunculu (crazy'de bayrakla kapalı, kodda duruyor): yeniden bağlanma, 6 harfli oda kodu + davet, CrazyGames davet katmanı, dokunmatik, iOS bellek çökmesi düzeltmesi (870 MB deniz dokusu), dokunma kayması düzeltmesi, ui-audit aracı, **Tur C** (dokunmatikte min 12 px yazı, 44 px dokunma alanı).
- Ordu çizimi sapması ("deviation") düzeltildi; masaüstü pencere X/−/+ bozulması düzeltildi.
- Ayrıntı ve commit listesi: `docs/sonraki-plan.md`.

### iPhone son gerçek cihaz turu (Tur C sonrası) — DÜZELTİLECEKLER
1. Dokunmatikte **+/- zoom düğmelerini kaldır** (Eren'in kararı; yalnız iki parmak, Clash of Clans gibi).
2. **KRİTİK — iOS çift dokunma sayfa yakınlaştırması:** hızlı çift dokununca sayfa zoom'lanıyor, tuval üst yarıya sıkışıyor. iOS `user-scalable=no`'yu yok sayar. Çözüm: `touch-action: manipulation` (tuvalde `none`), dblclick/gesture* preventDefault, 300 ms ikinci touchend engeli, `visualViewport.scale` güvenlik ağı.
3. Pencerelerin altı kesiliyor (rakip kale: "Gözcü gönder" yarım, ulak/saldırı görünmüyor; Demirhane: "Yükselt" dışarıda). Yükseklik `visualViewport` − safe-area; kaydırma belli olsun; ana eylem düğmesi yapışkan alt çubukta; uzun pencereleri sekmeye çevirmeyi düşün.
4. Rakip avatar paneli minimap'le çakışıyor.
5. Ping arada 190–220 ms (LAN'da; büyük ihtimalle telefon Wi-Fi güç tasarrufu) — izlenecek.
6. **Android gerçek cihaz testi henüz yapılmadı.**
**→ TUR D YAPILDI (2026-11-05, dev):** +/- kaldırıldı (yalnız iki parmak); çift dokunma zoom'u 4 katmanla engellendi (`ui/no-page-zoom.ts`, `tools/double-tap-check.mjs`); pencerelerde kaydırma solması + ok, Yükselt/Saldır yapışkan alt çubuk (yalnız içerik rahat sığıyorsa, eşik 2,5); rakip kale penceresi Gözcü/Ulak/Saldırı sekmelerine bölündü; avatar paneli minimap'le çakışmıyor. touch-check 15/15, rotate 3/3, rehber 852x393 ve masaüstünde tam. Gerçek iPhone'da henüz denenmedi (5090).
Açık: 852x323'te (Safari çubuğu açık) rehber 17. adımda (orman) takılıyor (eski sorun); `touch-offset-check` eski denetim düşüyor; 640x360'ta bildirim kale penceresi sekmesine biniyor.

---

## 4. Büyük görsel geçiş (YAPILDI 2026-11-05/06, dev dalında; ayrıntı `docs/gorsel-envanter.md`)

**Durum:** adımlar 0–7 tamam (envanter, birlikler, kale içi zemin, orman, arayüz+logo, AI görsellerinin silinmesi, test). Oyunda yapay zekâ görseli yüklenmiyor; dosyaları silindi (git geçmişinde duruyor). Renk = oyuncu; krallık yalnız kendi kapındaki sancakta; King her kalenin lordu (yalnız görsel). Logo A (kale + yazı) seçildi, B (`?logo=b`) durur. Testler: dotnet test değişmedi (sunucuya dokunulmadı), smoke 221 denetim geçti, ui-audit masaüstü (`docs/ui-audit-gorsel-gecis.md`) yeni kategori çıkarmadı (bilinen küçük yazı/8 px kaydırma/2–4 px rapor etiketi), rehber x20 masaüstü ve mobil 852x393 tam geçti, gerçek hız rehber koşusu ayrıca denendi. Bu turda bulunan gerileme: yeni üst şerit çerçevesi 16 px taştığı için mobil rehberin orman çerçevesi görünmüyordu; şerit çerçevesi inceltildi (`kf-art.css`). Bilinen kalanlar: çayırlar eskisine göre seyrek (çiçek kümeleri/kuyu/gölet yapay zekâ setindeydi), çerçeve rengi/kalınlığı ince ayar bekliyor, `tools/promo/kingdoms.mjs` eski krallık görsellerine bağlıydı, fragman/Shorts yeni görsellerle yeniden çekilmeli.

**(Eski karar notu, bağlam için:)**

**Karar:** Tüm yapay zekâ görselleri çıkacak; oyun yalnız Pixel Frog **Tiny Swords** varlıklarıyla (Free Pack güncel sürüm + Eren'in alacağı **Tiny Swords Warfare** + gerekirse 15 $ Enemy Pack) tutarlı hale gelecek. Eren Tiny Swords'un küçük/tatlı stilini seviyor; AI eklemeler "videoya resim yapıştırılmış gibi" duruyor.

**Lisans (Tiny Swords sayfası):** ticari kullanım ve değiştirme serbest, isim verme zorunlu değil; ayrı dağıtım/satış yasak; **yapay zekâ eğitiminde kullanmak yasak** → Tiny Swords görsellerini hiçbir AI aracına referans olarak verme. Warfare lisansını Eren sayfadan kontrol edecek.

**Tasarım kuralları:**
- **Renk = oyuncu, krallık DEĞİL.** Krallıklar gizli; kale rengi krallığı gösterirse Kâhin gücü ve gizlilik çöker. Mavi/kırmızı/sarı/mor = oyuncular, **siyah = haydut/tarafsız**.
  (Eren önce "mor büyücü, sarı tüccar, siyah gölge, kırmızı entrikacı" önerdi; gizlilik nedeniyle yukarıdaki kural önerildi — Eren'le netleştir.)
- Krallık kimliği yalnız sahibine: kendi kalesinde krallığa özel sancak/amblem (Tiny Swords kurdele/sancak parçaları) + arayüz kartı. Rakip krallığı yalnız gözcü/Kâhin ile.
- **Kale içi zemin:** surların içi çimen değil; kum/toprak/taş döşeme + kaya, fıçı, sandık, çit süsleri.
- Birlik eşleme: Okçu, Kılıçlı (Warrior), Mızrakçı (Lancer), Keşiş (Monk), Kalkanlı, Mancınık, Süvari → Warfare/Free Pack karşılıkları; karşılığı yoksa Eren'e sor.
- Orman yerleri: Tiny Swords binaları + siyah haydutlar.
- Arayüz: pencere/kart çerçeveleri, amblemler, düğmeler → Tiny Swords **UI Elements** (kâğıt, ahşap, kurdele, ikon). Lobi arka planı oyunun kendi sahnesinden. Logo: Pixelify yazı + Tiny Swords parçalarıyla yeniden (AI logo çıkacak).
- Önce bayrakla kapat, oturunca AI klasörlerini (art/kingdoms, art/forest, art/ui, art/props, art/horse, mancinik vb.) kaldır.
- İleride (bütçe/yayıncı olunca): piksel sanatçısıyla özgün set.
- **KayKit 3D paketleri** (Dungeon Pack 1.1, Medieval Hexagon Pack 1.0, Skeletons 1.1, Adventurers 2.0 — hepsi CC0, ücretsiz): **Keepfall'da KULLANILMAYACAK** (3D model; Tiny Swords'un 2D piksel stiliyle tutarsız). Gelecekteki bir 3D proje için saklandı (Medieval Hexagon altıgen harita stratejisine uygun).

- **8. birlik adayı: Berserker (hızlı, yüksek saldırı, düşük savunma) — görsel geçişten sonra ayrı denge turu.** Warfare'da görseli var (`Berserker/`), şimdilik kullanılmıyor. King birlik değil: her kalenin lordu (kapıda durur, savunma savaşında görünür, kale düşünce düşme animasyonu); yalnız istemci görseli, denge etkisi yok. Birlik eşlemesi ve envanter: `docs/gorsel-envanter.md`.

**Tiny Swords Warfare (Eren SATIN ALDI, 2026-11-05):** renk varyantları VAR, lisans Free Pack ile aynı (sorun yok). İçerik (mağaza görselinden):
- Sıra 1: taç/kalkanlı hafif zırhlı birlik → **Kalkanlı** adayı.
- Sıra 2: hızlı hafif savaşçı (kısa bıçak/balta) → yedek/özel birlik adayı.
- Sıra 3: uzun kılıçlı miğferli ağır piyade → **Kılıçlı** için Warrior'a alternatif.
- Sıra 4: atlı mızraklı → **Süvari** (AI atı kalkar).
- Sıra 5: tekerlekli kuşatma makinesi + atış efekti → **Mancınık** (AI mancınık kalkar).
- Free Pack'ten: Okçu (Archer), Keşiş (Monk), Mızrakçı (Lancer). → 7 birliğin hepsine Tiny Swords karşılığı var görünüyor.
- Kurulum: zip'i aç, `client/public/assets/` altına koy (git'e girmez), yolunu Claude Code'a ver.

Bu iş için hazır prompt sohbette verildi (adımlar 0–7: envanter, renk=oyuncu, birlik eşleme, kale içi zemin, orman, arayüz/logo, AI kaldırma, test). **Henüz Claude Code'a GÖNDERİLMEDİ.**

---

## 4b. Gece çalışması (2026-11-06): köşe düzeltmesi, efekt, ses, hazırlık sıkıştırma (ayrıntı `docs/gece-raporu.md`)

- **Ordu köşeleri**: kendi ordu yol boyunca mesafeyle ilerler, köşeler yumuşar (`Movers.alongSmooth`); `tools/corner-check.mjs`.
- **Efektler**: `scene/Effects.ts` (vuruş duraklaması, slow-mo, taş düşüşü, parıltı, nabız halkası), `ui/juice.ts|css` (pencere aç/kapa, +N, konfeti). Hepsi `html.kf-calm` ile kapanır (efekt azalt / düşük grafik).
- **Ses**: OpenGameArt CC0 kayıtları (`docs/ses-lisanslari.md`), konuma göre ses (`scene/hearing.ts`), kamp ateşi döngüsü, müzik kısılması.
- **Hazırlık sıkıştırma**: `match.prepSpeed` 1,6, hazırlık 5 dk; ölçüm `docs/hazirlik-sikistirma.md`. **Zor bot Orta karşısında %59 → %49** (açık konu). Karar bekleyen: 5 mi 4 dk mı.
- Berserker hâlâ 8. birlik adayı (görsel geçişten sonra ayrı denge turu). `tools/clip.mjs`: önce/sonra mp4. 5090 dev LAN son build'le çalışıyor; Production 5080 kapalıydı.

## 4c. İnce ayar turu (2026-11-06): orman, kale içi, hareket, King, ses (ayrıntı `docs/ince-ayar-raporu.md`)

- **Hazırlık hızı:** gözcü ve ordu hızı hazırlıkta da `prepSpeed` kat (orman gezileri ekonomiye yetişsin; Orta asker 16,4 → 19,5, Zor vs Orta %49 → %65,5, kullanıcı "Zor kalsın" dedi); savaş başlayınca yoldakiler normal hıza döner (`SlowToWarPace`).
- **Orman:** haydutlar ateşin çevresinde halka, sandık yerine altın yığını, büyük kamp kale değil (kule+ev+çit+ateş).
- **Kale içi:** çimen + toprak yollar/aşınmış alanlar, süsler yok, binalar surdan ≥64 px ve çakışmasız (`layout.ts` yeniden yazıldı, `signSpot`), King binaları dolaşır (`Lord.ts`).
- **Hareket:** rakip yürüyenler de yol boyunca mesafeyle (`Movers.followRoadOf`), sütun düzeni birim türüne göre (`FOOT`). `corner-check` 11 durum.
- **Ses:** çınlayanlar tok vuruşa çevrildi (kılıç, ulak, uyarı, onay, örs, kapı); `docs/ses-lisanslari.md` sonu.
- 5090 son build'le çalışıyor (`http://192.168.1.3:5090/?debug=1`). Yenilemek: sunucu kodu değiştiğinden `dotnet publish src/Keepfall.Server -c Release -o ..\keepfall-dev-lan\server` (önce 5090 işlemini durdur).

## 4d. İnce ayar 2 (2026-11-06): okçu sesi, sur/kol, çakışma, sandık (`docs/ince-ayar-2-raporu.md`)

- **Okçu sesi** gerçek yay (CC0 Weapon Textures) + `arrow-hit`; `MAX_SAME` ses sınırı. **Kol** 4 genişlik, mancınık ortada, süvari arkada; **sur halkası** yanındaki yolda kol kayar/sıkışır (`Movers.setWalls`/`fitRow`). **L1–L3 çakışmalar** açıldı, L4 eski yerleşim; `tools/layout-check.steps.json`. **Boş sandık** etiketsiz.
- Seviye 4 çakışma denetimi hâlâ uyarı verir (eski yerleşim, bilerek).

## 4e. Harita ölçeği deneyi (2026-11-06, bayrak arkasında; `docs/harita-olcegi.md`)

- `?mapscale=1.3` / `VITE_MAP_SCALE`: haritadaki tüm mesafeler ve kale içi ×ölçek, sprite boyutu aynı, yolculuk süreleri aynı (karo cinsinden sayım; test `The_map_scale_is_only_a_picture…`). Varsayılan 1 (kapalı), karar Eren'in. 1,3'te rehberli maç x1, corner-check, movers-stall, smoke geçti. Ölçüm: texMB +%8 (1,3) / +%12 (1,5), nesne +%17 / +%22. Sunucuda `map.scale` yalnız sayı (istemci buradan okumaz).

## 4f. İnce ayar 3 (2026-11-06; `docs/ince-ayar-3-raporu.md`)

- **map.scale 1,3 varsayılan** (`?mapscale=1` eski). **Kol** yol şeridine göre (ormanda 1, yolda 2, kavşakta/açıkta 4). **Ordunun geçtiği yer açık kalır** (`MapStateView.Explored`, kalıcı, savaş başında kapanır) + geçtiği orman yerleri keşfedilir + görüşten çıkan rakip ordu **son görülme** (`LastSeen`, 120 sn). **Müzik**: `Music` yeniden yazıldı, `audio-check` tüm geçişleri doğrular. **Debug paneli** sol altta, katlanabilir.
- Smoke notu: kuşanma denetimi artık ×1'de (×20'de pencere 0,75 sn'ydi).

## 4g. Meydan Okuma — tek kişilik mod (2026-11-06; `docs/meydan-okuma.md`)

- `config/challenges.json` (8 meydan okuma, denge sayısı değil) + `Keepfall.Core/Challenges/Challenges.cs` (yükleme/doğrulama, günlük tohum, hedef/yıldız hesabı); `Room.StartChallenge`, hub `GetChallenges/StartChallenge`, `ChallengeResult` olayı (yalnız oyuncuya). Çok oyunculu kurallar değişmedi. İstemci: `ui/challenges.ts|css`, ana menü düğmesi, maç sonu özeti. İlerleme `localStorage.keepfall_challenges`.
- Sunucu `challenges.json`'ı balance.json'ın yanında arar: **5090 dev LAN klasörüne de kopyala** (`keepfall-dev-lan\config\`), `run-smoke.mjs` geçici klasöre kopyalar. Eşikler insanla ölçülmedi.
- Not: bu işte `client/dist` dev derlemesiyle yeniden yazıldı (Production 5080 kapalıydı; main'i yeniden yayınlarken `client/dist` main kodundan derlenmeli).

## 5. Oyun mantığı (sonraki tasarım konuşması — henüz karar yok)

Parti/sosyal strateji yönü için konuşulacaklar:
- Maç süresi seçenekleri (kısa: ör. 3 dk hazırlık + 4 dk savaş; normal: 8+10). İlk aksiyon ilk 30–60 sn içinde.
- **KARAR (2026-11-05): Hazırlık SIKIŞTIRILACAK.** Aynı kararlar, daha kısa süre: hazırlık 8 dk → **5 dk varsayılan** (4 dk de denenecek); hazırlık sonunda ekonomi/ordu bugünkü 8 dk sonundakiyle aynı (±%10).
  - Tek ayar: `match.prepSeconds` + `match.prepSpeed` çarpanı (8/5 = 1.6; 4 dk için 2.0). Hazırlıkta zamanla ilgili her şey çarpanla hızlanır: üretim, nüfus artışı, yükseltme, silah, armSeconds, paralı asker. Mevcut değerleri elle değiştirme.
  - DOKUNMA: yürüme hızları, savaş aşaması/süresi, kıtlık, savaş simülasyonu, gizli bilgi.
  - Oranla ölçeklenecekler: "son 60 sn gözcü yok" kuralı, rehber adım zamanlamaları, botların hazırlık zamanlamaları, ipucu/uyarı zamanları.
  - Ölçüm (`docs/hazirlik-sikistirma.md`): 8/5/4 dk için hazırlık sonu asker, silah, bina seviyeleri, stok, nüfus (bot vs bot, zorluk başına ≥50 maç); bot kazanma oranları; rehberli maç x1 her ayarda; insan simülasyonunda "yapacak bir şey yok" süresi.
  - Denge değişikliği → sayılar Eren onaylayana kadar dev'de; sonra Eren 5 dk maçı kendisi + hiç oynamamış bir arkadaşı oynayarak karar verecek.
  - Hazır prompt sohbette verildi; **henüz Claude Code'a GÖNDERİLMEDİ.**
- Reddedilen fikirler: "Hazırım" düğmesi (gizli bilgi oyununda kimse hazır olduğunu söylemek istemez, ölçütü yok), "orman erken açılsın" (zaten ilk dakikadan açık).
- Sonraya kalan fikir: hazırlıkta ortak hedef (haritada beliren kervan/emanet; kim alırsa küçük bonus; ulakla pazarlık). Sıkıştırmadan sonra hâlâ boşluk varsa.
- Eski öneriler (artık öncelikli değil): "Hazırım" ile hazırlığı erken bitirme (herkes hazırsa; botlar otomatik hazır, tek insanlı maçta oyuncu hızlandırabilir), hazırlıkta yağma akınları (kale düşmez, kaynak/işçi çalınır), orman hedeflerinin erken açılması ve hazırlık mini hedefleri, kısa maç modu.
- Daha az pencere, daha çok doğrudan harita etkileşimi; daha çok animasyon/ses/geri bildirim ("juice").
- İhanet, ulak, blöf mekaniklerini öne çıkarmak; maç sonu "aynı grupla tekrar oyna".
- Steam'de arkadaş daveti/lobi; botlar az oyunculu durumlar için kalır.
- Açık eski konular: Zor bot ~%60 (hedef %75–85), okçu biraz güçlü, skill paneli, birim üretim binaları fikri.

---

## 6. Pazarlama (Red Lion Games)

- Stüdyo adı **Red Lion Games** (Kızılaslan). Ayrı Gmail. YouTube kanalı `@redliongamesstudio` (profil, banner, filigran hazır), TikTok hesabı açıldı. Instagram şimdilik yok (kullanıcı adı rezerve önerildi). Reddit/X/Discord şimdilik yok.
- Google hesabı bir kez "hizmet şartları ihlali" ile kapandı, Eren çözdü. Bu hesaplara **VPN kapalı** gir, ilk haftalarda az ve aralıklı işlem yap.
- Yayında: 1 Short (2026-11-05). Planlı (YouTube + TikTok, 19:30): **Per 05.11** short-01-phantom-army, **Cmt 07.11** short-03-four-kingdoms, **Pzt 09.11** short-02-castle-falls, **Çar 11.11** short-04-worker-lost.
- Video dosyaları (git'te değil, `art/promo/`): `trailer/keepfall-trailer-1080p.mp4` (ana fragman, 62 sn, Epic Medieval — Kulakovka, Pixabay, Content ID kaydı yok), `trailer/keepfall-short-vertical.mp4`, `shorts/short-0{1..4}-*.mp4` (38–44 sn, vuruşa oturan kesim, logolu kapanış), `crazygames/` (kapaklar + kurallara uygun sessiz önizlemeler), `brand/` (Red Lion profil/banner/filigran/şeffaf amblem), çekim klipleri `clips/` (`tools/promo/`).
- Eren'in video tercihi: **kısa değil, 35–45 sn hikâyeli**, sonda logolu kapanış, özenli kurgu.
- **Görsel geçişten sonra fragman ve videolar yeni (yalnız Tiny Swords) görsellerle yeniden çekilmeli** — eski klipler AI görselleri içeriyor.
- İlk hafta sonu: YouTube Analytics + TikTok Analizler (izlenme, ortalama izlenme yüzdesi) değerlendirilecek.
- Fragman YouTube'a henüz yüklenmedi (Steam sayfası/yeni görseller sonrası düşünülecek).

---

## 7. Sıradaki işler (öncelik sırası)

**2026-11-05 kararı: mobil tarafı DURDURULDU, odak Steam (masaüstü).** Mobil kodu dev'de duruyor; bölüm 3'teki iPhone düzeltmeleri bekliyor.

1. ~~Görsel geçiş~~ YAPILDI (bölüm 4). Sırada: Eren'in görsel onayı/ince ayarı.
2. **Hazırlık sıkıştırma** (bölüm 5, karar verildi: 5 dk varsayılan, 4 dk denenecek).
3. Oyun mantığı tasarım konuşması (bölüm 5) → kısa maç modu.
4. Yeni görsellerle fragman/Shorts yeniden çekimi.
5. Steam yol haritası: masaüstü sarmalayıcı, Steamworks lobi, ücretli sunucu, Steam sayfası + wishlist.
6. İsteğe bağlı: CrazyGames'e iyileştirilmiş sürümle yeniden başvuru.

---

## Claude Code'un notları (2026-11-05 oturumu)

**Dal durumu.** CrazyGames incelemesi sürerken `main` ve Render DONDU (main `7b47402`, Render `/version` aynı). Bugünkü tüm iş `dev` dalında, ayrı commit'lerle, hepsi push edildi; main'e merge edilmedi, Render'a deploy edilmedi. `dev` başı: `git log --oneline -1` (bu not dahil). Sunucu kodu dev'de DEĞİŞMEDİ (yalnız istemci, araçlar, belgeler).

**Çalışan sunucular.**
- **5080 Production** (main kodu): `publish/` + repo `client/dist` (4 Kasım derlemesi). Dokunulmadı; dev istemcisi ASLA `client/dist`'e derlenmez (Production oradan sunuyor).
- **5090 dev LAN** (dev dalı, telefon testi): repo dışı `..\keepfall-dev-lan\`, `http://192.168.1.3:5090/?debug=1`, ortam Production (dev hız düğmeleri yok = gerçek yerleşim). Yenileme: `cd client && npx vite build --outDir ../../keepfall-dev-lan/client/dist --emptyOutDir`, sonra `keepfall-dev-lan\server\Keepfall.Server.dll`'i `Keepfall__BalancePath=<keepfall-dev-lan>\config\balance.json` ve `--urls http://0.0.0.0:5090` ile yeniden başlat (ayrıntı: bellekteki `dev-lan-server.md`). Sunucu dll'leri `publish/`'ten kopya (sunucu kodu aynı). Wi-Fi profili Public, dotnet için Public izin var.
- Test sunucuları (5081, Vite 5174/5175) KAPALI.

**Bugün yapılanlar (dev).**
1. CrazyGames: depolama engelli iframe'de rehber yedeği (`ui/safe-storage.ts`), Ayarlar'da Gizlilik bölümü (EN/TR), zaferde `game.happytime()`; `muteAudio` elle doğrulandı (`sonraki-plan.md` §7). Aday paket `..\keepfall-crazygames-build-next` + `keepfall-crazygames-next.zip` (portala YÜKLENMEDİ; bu paket Tur C/D'den ÖNCE üretildi, yeniden başvuruda yeniden üret: `PACK_SUFFIX=-next node tools/pack-itch.mjs <sunucu> --crazy`).
2. **Tur C** (dokunmatik cila, yalnız `pointer: coarse`): 12 px yazı tabanı (`--fs-xs`), 44 px dokunma alanı + 8 px boşluk, ui-audit kritikleri, touch-check flaky testi düzeltildi. Dosyalar: `ui/touch-text.css`, `touch-targets.css`, `touch-fixes.css`. Rapor: `docs/ui-audit-turc.md` (+ önce/sonra ham raporlar).
3. **Tur D** (iPhone 16 Safari bulguları): +/− zoom düğmeleri kaldırıldı; iOS çift dokunma sayfa zoom'u kökten çözüldü (`ui/no-page-zoom.ts`); pencerelerde kaydırma ipucu, yapışkan ana düğme, rakip pencere sekmeleri (`ui/touch-windows.css`, `windows.ts`, `enemy-window.ts`); rakip avatar paneli minimap'e binmiyor. Bölüm 3'teki iPhone düzeltmelerinin KODU hazır (dev'de); **gerçek iPhone'da denenmedi** (kullanıcı 5090 adresinden deneyecek).
4. Araçlar: `tools/ui-audit.mjs` (JSON çıktısı `docs/ui-audit*.json` git'e girmez, `--shots`, yakın hedef denetimi, ölü düğme için kaydırıp bas, yapışkan/sabit başlık altındaki öğeler 'örtülü' sayılmaz), `tools/double-tap-check.mjs`, `tools/touch-check.mjs` (test hatası düzeldi).

**Açık kalan testler / bilinen sorunlar.**
- Gerçek iPhone/Android'de Tur C + D denenmedi.
- `touch-offset-check`: "canvas moved 70 px: the touch is at canvas (426,146), expected (300,180)" Tur C'den ÖNCE de düşüyordu; asıl denetim ("tap still lands on the castle") geçiyor. Test beklentisi gözden geçirilmeli.
- 852x323 (Safari çubuğu açık) mobil rehber (`MOBILE=1 SIZE=852,323 tools/tutorial-check.mjs`) 17. adımda (orman tıklaması, "no frame") takılıyor; Tur D'den önceki kodda da aynı. 852x393'te ve masaüstünde rehber baştan sona geçiyor.
- ui-audit kalanları: ~140 "ölü düğme" (elle denendi, çalışıyor; denetim sınırı), `small` (640x360) cihazda bildirim kale penceresi sekmesinin üstüne biniyor, 8 px'lik yan kaydırma uyarıları (kingdom panel), 2 px rapor etiketi taşması (masaüstü kritik 0–1 arasında oynar), yapışkan çubuğa kayan öğeler 'yakın/örtülü' sayılıyor. Yapışkan çubuk eşiği `windows.ts` `refreshMore` içinde (2,5; gerçek telefonda kısa pencerede alt çubuk yapışmıyorsa orayı ayarla).
- Hızlı Maç x1 rehberli gerçek zamanlı test bugün koşulmadı (rehber x20'de, mobil ve masaüstü, geçti).

**Bilmen gereken başka.**
- Dev'de `docs/ui-audit-turc-before.md`, `...-after.md`, `ui-audit-turd.md` üretilmiş raporlar (büyük); özet `ui-audit-turc.md`.
- Oturum bellek dosyaları: `crazygames-review-freeze.md` (main/Render donmuş, iş dev'de), `dev-lan-server.md`.
- Git çıktısındaki "LF will be replaced by CRLF" uyarıları zararsız (autocrlf); dosyaların biçimine dokunulmadı.
- Production'ı yeniden başlatma kuralı aynı: yalnız kullanıcı söyleyince / iş bitince (CLAUDE.md #5). Bugün 5080'i bir kez yeniden başlattım (kapalı bulunmuştu, mevcut `publish/` ile, main kodu).
