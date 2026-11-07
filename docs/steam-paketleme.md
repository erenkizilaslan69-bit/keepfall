# Keepfall — Steam paketleme (Aşama F, hesap gerektirmeyen kısım)

Durum: **HAZIRLIK YAPILDI** (2026-11-07, `dev`). Çalışan prototip var; Steamworks hesabı, app id, fiyat/tarih ve varlık lisansı teyidi kullanıcıdan bekleniyor (en altta liste). Mağaza metni: `docs/steam-magaza.md`.

## 1. Mimari: çevrimdışı demo

Tek kişilik mod (Meydan Okuma + Hızlı oyna, botlarla) zaten sunucuda oynanıyor; demo için sunucu istemciyle **aynı bilgisayarda** çalışır, internet gerekmez.

```
Keepfall.exe (Electron kabuğu)
 ├─ boş bir yerel port seçer, server/Keepfall.Server.exe'yi 127.0.0.1:port'ta başlatır (yalnız loopback)
 ├─ sayfayı http://keepfall.localhost/ adresinde açar (host-resolver-rules ile o porta eşlenir)
 ├─ pencere kapanınca sunucuyu kapatır; kabuk ansızın ölürse sunucu kendi kapanır (KEEPFALL_PARENT_PID)
 └─ preload.js → window.keepfallSteam (Steam yoksa "kullanılamaz" der)
server/  self-contained .NET sunucu (.NET kurulumu gerekmez) + config/ + client/dist (istemcinin Steam derlemesi)
```

Önemli ayrıntılar (hepsi `tools/steam-check.mjs` ile denetlenir):

- **Sabit kaynak (origin)**: rastgele port yüzünden `localStorage` her açılışta sıfırlanırdı (ilerleme, dil, ayarlar). Sayfa sabit `keepfall.localhost` adresinde açılır, Chromium bunu o gün seçilen porta eşler; `*.localhost` güvenli bağlam sayılır. Yeniden açılışta farklı port, aynı depolama (denetim geçiyor).
- **Dışarıya hiçbir istek**: kabuk `webRequest` ile `keepfall.localhost` dışındaki her isteği iptal eder ve sayar (`window.keepfallSteam.blockedRequests()`); denetim bir Hızlı oyna maçından sonra 0 görüyor. İstemci zaten CDN/Google Fonts kullanmıyor (yazı tipleri `@fontsource`, paketle gelir). Kredilerdeki Tiny Swords adresi yalnız metin.
- **Çok oyunculu/davet kapalı**: `client/.env.steam` → `VITE_FEATURE_PRIVATE_ROOM=0`, `VITE_FEATURE_CRAZY_INVITE=0` (CrazyGames için yapılan bayraklar). Ana menüde yalnız Hızlı oyna, Meydan Okuma, Başarımlar ve Ustalık kalır. Sunucu yalnız 127.0.0.1'i dinler; `Keepfall__MaxRooms=4`.
- Sunucuya tek ekleme: `Program.cs` içinde `KEEPFALL_PARENT_PID` varsa üst süreç ölünce `StopApplication()` (başka yerde ayarsız = etkisiz).
- Gizli bilgi kuralları aynen geçerli: sunucu otoriter, istemci yalnız kendi görünümünü alır (sunucu kodu değişmedi).

### Paketleme ve doğrulama

```bash
node tools/pack-steam.mjs            # istemci (Steam derlemesi) + self-contained sunucu + Electron kabuğu → steam-build/Keepfall/
node tools/steam-check.mjs           # paketi gerçekten çalıştırır (CDP): 16 denetim
node tools/steam-store-check.mjs     # SteamProgressStore + başarım kimlikleri (Steam'siz)
node tools/shot-steam.mjs            # mağaza ekran görüntüleri → art/shots/steam/
```

`steam-build/` git'e girmez (Tiny Swords dosyaları + 100 MB sunucu içerir). Ölçüm (bu makine, Windows 11): paket **444 MB** açık boyut (Electron 317 MB, sunucu 126 MB — istemci 20 MB bunun içinde), Steam deposunda sıkıştırılınca ≈ 150–200 MB beklenir; bellek Hızlı oyna maçında **≈ 1,1 GB (Electron 5 süreç) + ≈ 100 MB (sunucu)**. `steam-check.mjs` sonucu: pencere açılır, sunucu başlar, menüde yalnız tek kişilik kapılar, köprü var, Steam kapalı, maç başlar, dış istek 0, pencere kapanınca sunucu da kapanır, kabuk öldürülünce sunucu da kapanır, yeniden açılışta depolama durur, app id verilip Steam çalışmıyorsa oyun yine açılır (bu makinede Steam istemcisi açıktı: `steam on 480`, yani SDK paket içinden yüklendi).

Bilinen eksikler (prototip): kod imzalama yok (SmartScreen uyarısı), simge yok (Electron'un varsayılanı; `Keepfall.exe` 'ı rcedit ile ayarlanır), sunucu günlüğü kurulum klasörüne yazılır (`server/logs`; Steam kütüphanesi yazılabilir, değilse sessizce atlanır), yalnız Windows x64 (Linux/Mac/Steam Deck için `pack-steam` genişletilir), Steam Cloud/başarım yolu gerçek SDK ile denenmedi.

## 2. Masaüstü kabuğu: karşılaştırma ve karar

| | Electron | Tauri 2 | .NET self-contained + WebView2 penceresi |
|---|---|---|---|
| Ek boyut | ≈ 320 MB açık (≈ 100+ MB sıkışık) | ≈ 10 MB (sistem WebView) | ≈ 5 MB (WebView2 sistemde) |
| Tarayıcı motoru | Kendi Chromium'u: herkeste aynı, Phaser/WebGL öngörülebilir | Sistem WebView: Windows'ta WebView2, Linux'ta WebKitGTK (Phaser/WebGL ve ses farkları, test yükü) | WebView2 (Win10'da güncel olmayabilir, Steam'e ayrı yükleyici gerekir); yalnız Windows |
| Steamworks | `steamworks.js` (Electron örnekleri ve yer paylaşımı/overlay yardımcısı var); topluluk bilgisi bol | Rust `steamworks` kütüphanesi; Rust araç zinciri + köprü yazmak gerek | `Steamworks.NET` sunucu sürecine doğrudan girer, en az köprü; ama Linux/Steam Deck yok |
| Bakım yükü | JS; projenin zaten bildiği dil; sürüm yükseltme (güvenlik) takibi gerek | Rust öğrenme + iki ek araç zinciri | C# tek dil, ama WebView2 pencere/overlay işleri elle |
| Steam Deck / Linux | Çalışır (Chromium) | WebKitGTK'ye bağlı, belirsiz | Yok (Proton'da WebView2 sorunlu) |
| Overlay | steamworks.js `electronEnableSteamOverlay` | Zor | Zor |

**Seçim: Electron.** Gerekçe: (1) istemci bir Phaser/WebGL oyunu ve her yerde aynı Chromium'da denenmiş olması en büyük riski (görüntü/ses farkı) sıfırlıyor; (2) `steamworks.js` başarım, bulut, zengin durum, overlay'i bu yolla hazır veriyor (3. bölüm), kendi Rust/C# köprüsü yazmak gerekmiyor; (3) Steam Deck/Linux'a yol açık; (4) bakım yükü en düşük (proje zaten JS/TS). Bedel boyut (≈ 100–200 MB sıkışık) ve bellek; ücretsiz demo için kabul edilebilir, Steam'de indirme boyutu 1 GB'a kadar normal. Boyut ileride sorun olursa Tauri'ye geçiş mümkün: köprü (`window.keepfallSteam`) arayüzü kabuktan bağımsız, istemci ve sunucu değişmez.

Self-contained sunucu 126 MB: ASP.NET'in kırpması (trimming) desteklenmediği için küçültülmedi; `PublishReadyToRun`/globalization kırpması ile birkaç on MB kazanılabilir (denenmedi).

## 3. Steamworks entegrasyon noktaları (hazır, kapalı)

- **Açma koşulu**: `steam.json` içinde `appId` > 0 (ya da `KEEPFALL_STEAM_APPID`) **ve** `steamworks.js` yüklenebiliyor/Steam istemcisi açık. Aksi halde sessizce kapalı (`steam off (neden)` kabuk günlüğüne düşer; oyun etkilenmez). Yer tutucu: `appId: 0`.
- **Köprü**: `tools/steam/shell/preload.js` → `window.keepfallSteam { status, unlock, cloudRead, cloudWrite, presence, blockedRequests }`; ana süreçte hepsi doğrulanır (başarım kimliği `^[a-z][a-z0-9_]{0,40}$`, bulut dosyası yalnız `progress.json` ≤ 200 KB, durum anahtarı ≤ 40 karakter) ve hata yutulur.
- **`SteamProgressStore`** (`client/src/progress/steam-store.ts`): `ProgressStore` arayüzünü gerçekler; yerel depo çalışma kopyası kalır. Kaydetmede yeni başarımlar Steam'e **bir kez** gönderilir (API adı = `docs/basarimlar.md`'deki kimlik; `steam-store-check` ikisinin aynı olduğunu denetler: 30 kimlik), veri `progress.json` olarak Steam Cloud'a yazılır. Açılışta bulut kopyası yerelle birleşir (sayaçlar büyük olan, başarımlar birleşim/erken zaman, seçimlerde yerel) ve tüm başarımlar yeniden açılır (Steam zaten açık olanı yok sayar: çevrimdışı kazanılanlar onarılır). Bozuk bulut dosyası ya da hatalı köprü oyuna hiçbir şey yansıtmaz. `client/src/steam.ts` `initSteam()` ilerlemeye hiçbir şey dokunmadan önce çağrılır (`main()`).
- **Zengin durum (Rich Presence)**: `steamStatus('menu'|'prep'|'war'|'challenge_prep'|'challenge_war'|'spectating'|'ended')` → `steam_display = #Status_...`; yalnız değişince gönderilir. TR/EN metinler `tools/steam/rich_presence_loc.vdf` (Steamworks → Rich Presence'a yüklenir). Kancalar `main.ts` `announce()`.
- **Başarım tanımları**: Steamworks panelinde 30 başarım elle (ya da toplu) girilir: API adı = kimlik, görünen ad/açıklama `docs/basarimlar.md` + `catalog.ts`/`en-progress.ts` (TR/EN). Simgeler (64x64, kilitli/açık) henüz yok: oyunun kendi çizimiyle yapılmalı.
- **Doğrulanmadı**: gerçek Steam'de başarım açma, bulut yazma/okuma ve overlay (app id yok). `steamworks.js` çağrı adları (`achievement.activate`, `cloud.readFile/writeFile/isEnabledForApp`, `localplayer.setRichPresence`) kütüphane belgesine göre yazıldı; app id gelince ilk iş `Spacewar (480)` ile ya da gerçek app id ile bunları denemek. Steam Cloud için panelde ayrıca kota/dosya tanımı gerekir.
- Yerel depolama (tarayıcı `localStorage`) Steam'siz çalışmaya devam eder; Steam bulutu yalnız ilerleme dosyasıdır (ayarlar/dil buluta gitmez).

## 4. Tiny Swords Free Pack Steam'de — lisans ve risk

> **Karar (Eren, 2026-11-07):** itch.io sayfasındaki lisans metnine göre (varlıklar değiştirilerek kişisel ve TİCARİ projelerde kullanılabilir; kredi gerekli değil ama memnuniyetle karşılanır; dosyalar değiştirilmiş olsa bile yeniden dağıtılamaz/satılamaz/yeniden paketlenemez) ticari kullanım serbest kabul edildi: oyun, ekran görüntüleri ve fragman Free Pack ile yayınlanır. Kredi verilir ("Art: Tiny Swords by Pixel Frog"). Varlık paketi tek başına dağıtılmaz; repoya Free Pack dosyası/medyası girmez (kural aynen). Aşağıdaki sorular engel DEĞİL; Pixel Frog'dan yazılı onay istenmesi hâlâ önerilir (özellikle Steam depo dosyalarında düz PNG olarak okunabilirlik) ama yayını bekletmez.

**Bu bölüm hukuki görüş değildir**; yalnız hangi varlıkların pakete girdiğini ve kullanıcının (Eren) varlık sahibinden/itch.io sayfasından teyit etmesi gereken soruları listeler. Mevcut dayanak: README'ye göre Free Pack'in lisansı **yeniden dağıtıma izin vermediği** için repoda tutulmuyor; itch.io/CrazyGames paketlerinde ise dosyalar oyunla birlikte gidiyor.

### Pakete ne giriyor (Steam demosu)

- `client/public/assets/tiny-swords/**` (Free Pack): birimler (işçi, asker, gözcü), mavi/kırmızı/sarı/mor binalar, ağaç/çalı/kaya, su/kum/çayır karoları, arayüz parçaları (kağıt, ribbon, düğme, çubuk, simgeler), efekt kareleri. Bunlar `dist-steam` içinde (`client/dist-steam/assets`) ve dolayısıyla Steam deposunda.
- Oyunun kendi sanatı / CC0 / OFL: `art/` altından üretilen krallık kale ve bina görselleri (`client/public/art/kingdoms*`), arayüz çizimleri (`art/ui`, orman yerleri, harita süsleri, süvari atı, mancınık, amblemler, zafer/yenilgi görselleri), `client/public/cc0/` (Tiny Swords "TS_old version_CC0": taş sur, tabelalar), sesler (Kenney, RandomMind: CC0), yazı tipleri (Pixelify Sans, Atkinson Hyperlegible: OFL; lisans dosyaları `licenses/` ile gider).
- Dikkat: krallık görselleri "Gemini ile üretilmiş" kaynaklardan temizlenmiş görüntüler (`art/inbox`): Steam'in **yapay zekâ içerik beyanı** formunda bu doğru şekilde beyan edilmeli (kod yardımcıları muaf; oyuncunun gördüğü AI üretimi görsel beyan edilir). Devir notu "AI görselleri kaldırıyoruz" diyor; hangilerinin kaldığı/kaldırıldığı güncellenmeli.

### Eren'in teyit etmesi gereken somut sorular

1. **Ticari kullanım**: Free Pack ücretli/ücretsiz *ticari* üründe (Steam'de ücretsiz demo + ücretli tam sürüm) kullanılabilir mi? Hangi koşulla?
2. **Yeniden dağıtım**: Varlıklar oyunun dosyaları içinde (kodla birlikte paketlenmiş PNG/atlas olarak) oyunculara dağıtılabilir mi, yoksa yalnız "oyunun bir parçası olarak, çıkarılabilir halde olmamak şartıyla" mı? Steam depo dosyaları düz PNG olarak okunabilir; bu kabul edilir mi (README bugün "yeniden dağıtıma izin vermez" diyor: itch.io/CrazyGames'te de aynı durum, o yüzden bu soru zaten açık)?
3. **Atıf**: Hangi metin, nerede (oyun içi krediler, mağaza sayfası, `licenses/`)? Mağazada "Pixel Frog — Tiny Swords" yazılması ve itch.io bağlantısı istenir mi?
4. **itch.io sayfa şartları**: Free Pack'in sayfasındaki lisans metni (ve Free Pack ile varsa ücretli paketlerin lisans farkı) bugünkü hâliyle ne diyor? Sayfa metni zamanla değişmiş olabilir; tarihli ekran görüntüsü/PDF saklanmalı.
5. **Türev eser**: Birleştirilmiş/kesilmiş/yeniden renklendirilmiş görüntüler (takım rengi boyama, süvari binicisi, krallık görselleri "Tiny Swords'a benzetme" amaçlı üretildiyse) türev eser sayılır mı? İzin var mı?
6. **Mağaza görselleri ve fragman**: Kapsül/ekran görüntüsü/fragmanda Free Pack karakterleri/yapıları kullanılabilir mi (pazarlama kullanımı ayrı bir izin konusu olabilir)?
7. **Sahibe doğrudan sormak**: Pixel Frog'a (itch.io mesajı/e-posta) Steam yayını için yazılı onay istemek en sağlamı: onay yazılı olarak saklanmalı; ücretli "Tiny Swords" paketi satın almak/ticari lisans seçeneği var mı?
8. **Sürüm**: Steam sürümüne girecek paketin hangi sürümü (indirme tarihi, sürüm numarası) kullanıldı: kayda geçirilmeli.

Bu sorular (karar notuna göre engel değil, yazılı onay önerisi) yanıtlanmadan Steam'e yükleme yapmak riskli; yine de (mağaza sayfası "Yakında" bile varlık içerir). İzin gelmezse yol 5. bölümde.

## 5. Değiştirilebilecek varlıklar (kaba liste, oyunun kendi sanatıyla)

Öncelik sırası: görünürlüğü en yüksek + en kolay değişen ilk. Kullanıcı "izin yok" derse buradan gidilir; hepsi `client/src/scene/*` ve `ui/*` içinde tek yerden yüklenir.

| Varlık | Şimdi | Değişim | Zorluk |
|---|---|---|---|
| Kale ve 4 bina × 4 krallık | **Zaten oyunun kendi üretimi** (krallık görselleri); sade (krallıksız) Tiny Swords kale yalnız sis/gözcü öncesi rakip kalesinde | Sade hâl de krallık stiliyle çizilir | Düşük |
| Sur/kule/kapı kaldırımı | Taş sur CC0 parçası + Free Pack kule | Kule koddan/üretilmiş | Düşük |
| Arayüz (kağıt, düğme, ribbon, çubuk, simge) | Tiny Swords parçaları + oyunun `kf-art.css` 9-slice paneli, ikonları, logosu | Kalan parçalar aynı üretim hattıyla (`tools/art-ui.mjs`) | Orta |
| Zemin (çayır/su/kum/yol) | Tiny Swords karoları + kodla yol/süs | Üretilmiş karo seti | Orta |
| Ağaç/çalı/kaya/süs | Free Pack + üretilmiş süsler (`props/`) | Tamamen üretilmiş set | Orta |
| Orman yerleri (sandık, köy, kamp) | **Zaten üretilmiş** (`forest/`) | — | — |
| Birimler (işçi, kılıçlı, mızrakçı, kalkanlı, okçu, keşiş, gözcü, ulak) | **Free Pack** (en yoğun bağımlılık; her renk için animasyon sayfası) | Yeni çizim: 8 birim × 4 renk × (bekleme, yürüme, saldırı, ölüm); en pahalı kalem | Yüksek |
| Süvari atı / mancınık | **Zaten üretilmiş** (binici Free Pack mızrakçıdan birleşir → binici yeni çizilmeli) | Binici | Orta |
| Efektler (toz, kıvılcım, ok) | Kodla + Free Pack kareleri | Kodla çizilenler yeter | Düşük |
| Sesler/müzik | CC0 | — | — |

Yani engel ağırlıkla **birimler** ve **zemin/ağaç/arayüz kalanları**: izin çıkmazsa ilk adım birim seti (sipariş çizim ya da CC0/ücretli paket) olur; demo bu yüzden gecikebilir.

## 6. Kullanıcıdan gereken (benim yapamadıklarım)

1. Steamworks geliştirici hesabı, 100 USD uygulama ücreti, vergi/banka bilgisi → **app id** alınır; `steam.json`'a yazılır ve gerçek başarım/bulut/Rich Presence denenir.
2. Fiyat (öneri 8–12 USD) ve demo/Erken Erişim tarihi.
3. Yukarıdaki Tiny Swords soruları (itch.io sayfası/Pixel Frog yazılı onayı).
4. Steam'in yapay zekâ içerik beyanı kararı (hangi görseller AI üretimi).
5. Kod imzalama sertifikası (isteğe bağlı), uygulama simgesi.
