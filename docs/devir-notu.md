# Keepfall — Devir Notu (2026-11-05)

Bu belge, yeni bir oturumun / yeni bir asistanın projeye kaldığı yerden devam edebilmesi için yazıldı.
Kural kaynağı yine `CLAUDE.md`; ayrıntılı teknik plan `docs/sonraki-plan.md`.

---

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
