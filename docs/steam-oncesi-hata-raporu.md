# Steam öncesi hata, kenar durum ve cila denetimi (2026-11-07, `dev`)

Kapsam: kod incelemesi + uçtan uca koşturma + kenar durumlar + çevrimdışı Steam paketi. Performans başka oturumda (burada yalnız gözlem). Sayılar/denge ve oyun kuralları **değişmedi**; gizli bilgi kuralları aynen.

## 1. Özet

- **1 gerçek hata ağır** (hub'a elle yazılmış bir komut bir oyuncunun maçını sonsuza kadar bozabilirdi), **1 orta** (sayı taşması), birkaç küçük. Hepsi yeniden üretildi, kök sebep düzeltildi, regresyon testi eklendi, ayrı commit.
- Uçtan uca akışlar (Hızlı oyna, öğretici, çok oyunculu oda, davet, ikinci sekme, ağ kopması, sayfa yenileme, elenme + izleyici, maç sonu, düşük grafik, ses açık/kapalı, TR/EN, 800x450 / 1280x720 / 1920x1080) **konsol hatası, işlenmeyen istisna ya da sunucu istisnası olmadan** geçti.
- Temiz klasörde üretilen Steam paketi: açılış, kapanış (sunucu kalmıyor), ikinci açılış, dış istek 0, bozuk kayıt, boyutlar, çökme günlüğü **geçti**; iki küçük sağlamlaştırma eklendi.
- Testler: `dotnet test -c Release` **358 / 358** (başlangıçta 338; +20 yeni), `node tools/run-smoke.mjs` **268 / 268**, i18n taramaları **0 / 0**, `tsc --noEmit` temiz.

## 2. Bulgular

| # | Önem | Bulgu | Nasıl yeniden üretildi | Düzeltme |
|---|---|---|---|---|
| B1 | **Yüksek** | Hub, enum parametrelerini doğrulamıyordu. `SetDefense({okcu: 99})` (ya da `SendArmy` satır tablosunda 99/−1) kabul edilip savunma sırası olarak saklanıyordu; sonra o oyuncuya saldırı olunca savaş simülasyonu `IndexOutOfRange` atıyordu, `TickLoop` her saniye yutup tekrar atıyor: **o odadaki maç donuyor**. Aynı kapıdan `MoveWorkers(99, …)`, `UpgradeBuilding(77)`, `SendExplore(12)`, `ArmyMode 5`, `AddBot(99)` `KeyNotFoundException` fırlatıyordu (hata mesajı yerine istisna). SignalR sayıyı enum olarak kabul ettiği için istemciyi elle yazan herkes yapabilir. | `CommandGuardTests` (doğrulama kapatılınca 2 test düşüyor: `KeyNotFound`, savunma satırı) | `847cec5`: `CommandGuard.Check` (Core, her komutun girişinde): tanımsız Job/Building/Corner/Row/Mode, 16'dan çok girişli tablo, 64 karakterden uzun kimlik reddedilir; `AddBot` zorluğu doğrulanır. Duman testine denetim eklendi (`6efe853`). |
| B2 | Orta | Birim sayıları: aynı birim iki yazımla (`okcu`, `OKCU`) `int.MaxValue` ile gönderilince `Enumerable.Sum` taşıp `OverflowException` atıyordu (`SendArmy`, `SendDecoy`). Durum bozulmuyor ama hata mesajı yerine hub istisnası. Rastgele komut testi (fuzz) buldu (seed 3, 4). | `CommandFuzzTests`, `Counts_that_would_overflow…` | `caf54c4`: tek komutta en çok 1.000.000 kişi/silah; tablo girişleri aynı sınırda. |
| B3 | Düşük | Biten maçta herkes menüye dönünce oda 10 dakika sunucunun `MaxRooms` (15) yuvasını tutuyordu (lobi boşalınca hemen kapanıyordu, biten maç kapanmıyordu). | Kod okuması (`LeaveRoom`) | `6c2ef13` |
| B4 | Düşük | Erişilebilirlik: Meydan Okuma ve İlerleme (menü ekranları) Esc ile kapanmıyordu (ayarlar/rehber kapanıyordu). | Playwright süpürmesi | `d19f187` (başka pencere açıkken o önce alır; maç başlatılırken yok sayılır) |
| B5 | Düşük | i18n: yeni sunucu metinleri ("Geçersiz komut.", "Geçersiz bot zorluğu.") İngilizcesiz; eski 10 "sarılmamış metin" uyarısı yanlış alarmdı (CSS seçici, dev önizleme sayfası, `console.warn`); meydan okuma dosyası doğrulama hataları oyuncuya gitmiyor. | `i18n-scan` / `i18n-server-scan` | `7d93577`: sözlük + tarayıcıların yanlış alarmları (iki tarama da 0). |
| B6 | Düşük | Steam kabuğu: sayfa süreci çökerse (bellek, GPU) boş pencere kalıyordu; çökme izi hiçbir yere yazılmıyordu. | `Page.crash` ile (`steam-edge-check`) | `558dda4`: bir kez yeniden yükler (60 sn içinde ikinci çökme = mesaj + kapanış), `%APPDATA%/Keepfall/crash.log`. |
| B7 | Düşük | Bozuk ilerleme kaydı (`keepfall_progress_v1`) sessizce sıfırlanıp bir sonraki kayıtta üstüne yazılıyordu; elle onarım mümkün değildi (Steam bulutu açıksa geri gelir, yoksa kaybolur). | `damaged.mjs` | `921312e`: ham metin `keepfall_progress_v1_damaged` altında saklanır. |
| B8 | Araç | Test araçlarında yanlış alarmlar: `smoke-test` "herkes elendi" denetimi yalnız son kareye bakıyordu (×20'de botlar bir yoklamada maçı bitirince düşüyordu), `reconnect-check` hemen yeniden bağlanan hattı "kopmadı" sayıyordu, `run-smoke` başka oturumun 5081 sunucusuyla çakışıyordu. | gözlem | `6efe853` (`KF_SMOKE_PORT`, `KF_SMOKE_EXE`) |

Yeni testler: `CommandGuardTests` (7), `CommandFuzzTests` (6 tohum × 6000 saniyelik maç, 4 oyuncu rastgele/hasmane komutlar, krallıklar açık: istisna yok, `ContinuityViolations` 0, maç biter), `RoomFuzzTests` (8 tohum × 4000 adım: katıl/ayrıl/kop/hazır/bot/deste/ad/kozmetik/başlat; koltuklar benzersiz, oda sahibi odadan biri, görünüm JSON'a çevrilebilir). Araçlar: `tools/steam-edge-check.mjs` (ikinci açılış, bozuk depolama, pencere boyutları, çökme kurtarma, dış istek).

## 3. Denetlenen alanlar (sonuç)

- **Hub girdi doğrulaması**: tüm metotlar okundu; negatif/sıfır sayı, bilinmeyen kimlik, kendine/elenmişe hedef, yinelenen emir (aynı hedefe gözcü/ordu), yanlış faz, başkasının adıyla gönderme (yalnız Entrikacı), kilit altındaki komutlar zaten reddediliyordu; boşluklar B1–B2'ydi. Ad: kontrol/yönlendirme karakterleri ve yarım vekil çiftler temizleniyor, uzunluk 16, küfür maskesi; XSS denendi (`<img onerror>` ad olarak lobide ve oyunda: çalışmadı, işaretleme olmadı).
- **Oda ömrü / yarış**: tüm oda işlemleri `session.Lock` altında; tek bağlantı tek oda; yanlış oda kodu hız sınırı (6/dk) çalışıyor (`tab-check`); oda sahibi ayrılınca (lobi: hemen, maç: 30 sn sonra) devir; boşalan lobi hemen kapanır, terk edilmiş oda 10 dk; sahipsiz koltuk botla dolmaz.
- **Elenme / bitiş**: son ayakta kalan, süre dolumunda nüfus beraberliği (ortak birincilik), tüm insanlar elenince izleyici + `FinishMatch`, meydan okumada düşünce 5 sn sonra oynatma, `PlayOut`: kodla ve duman testiyle sınandı.
- **Gizli bilgi**: duman testi (267 denetim) geçti: kendi kalen, sis, rapor, tokenlar, izleyici, kandırma günlüğü yalnız maç sonu, kozmetik yalnız maç sonu.
- **Ağ**: `reconnect-check` (hat kesme, çevrimdışı 12 sn, sayfa yenileme), `invite-check` (3 tarayıcı, biri telefon: oda kodu/davet, bot ile doldurma, kopma + dönüş, geç gelen), `tab-check` (ikinci sekme koltuğu devralır, eski sekme mesaj gösterir).
- **Arayüz**: TR/EN × 800x450, 1280x720, 1920x1080: ana menü, Meydan Okuma, İlerleme, lobi: yatay kaydırma yok, konsol hatası/başarısız istek yok; Esc menülere dönüyor. Düşük grafik (`?low=1`), efekt kapalı, ses kapalı/yüksek, azaltılmış hareket, 800x450 EN: maç 12 sn konsol hatasız.
- **Oynanış koşuları** (başsız Chrome, ×5): `qa-player` normal (Gölge) + `die` kipi (elen, izleyici düğmeleri, maç sonu), `tutorial-check` (öğretici baştan sona 32 adım, sayfa hatası yok), `army-check`, `soak` (konsol/istisna yok). Komut hataları yalnız beklenenler (altın yetmedi, elenmişe gözcü).
- **Ölü kod**: `tsc --noUnusedLocals` temiz; sunucuda yalnız test projesinde nullable uyarıları.

## 4. Steam paketi (temiz klasör `steam-build/audit`, sonra silindi)

`node tools/pack-steam.mjs --out steam-build/audit` (444 MB: sunucu 126, istemci 20, kabuk+Electron 318) → `steam-check` **16/16** (açılış, tek kişilik kapılar, köprü, Steam kapalı, maç, dış istek **0**, pencere kapanınca sunucu kapanır, kabuk öldürülünce sunucu kapanır, yeniden açılışta depolama durur, Steam açıkken app id'li ama Steam çalışmıyorsa oyun yine açılır) ve `steam-edge-check` (yeni): ikinci açılış hemen kapanıp ilk pencereyi korur ve ikinci sunucu başlatmaz (port çakışması olası değil: boş port seçilir); bozuk depolama (ilerleme/ayar/ses/meydan okuma/deste/aktif oda) menüyü ve İlerleme penceresini bozmaz, betik hatası yok; 960x540, 1280x720, 1920x1080, 800x450 görünümlerinde kaydırma çubuğu yok, "Hızlı oyna" tam görünür; Hızlı oyna 8 sn betik hatası yok; çökme kurtarma (`Page.crash`) ve `crash.log`; sunucu günlüğü kurulum klasöründe (`server/logs`, yoksa atlanır); kabuk öldürülünce sunucu kalmıyor. Ses: kabuk Chromium'u ses çalar, ses ayarı (kapalı/yüksek) tarayıcı denetiminde sınandı; pakette sesli çıkış cihazı olmadan elle dinlenmedi.

## 5. Denetlenmeyenler ve kalan riskler (dürüstçe)

1. **F11 tam ekran** CDP ile basılamadı (olay sayfaya gider, kabuğun `before-input-event`'ine değil): elle denenmeli. Esc tam ekrandan çıkarmaz (oyun Esc'i pencere kapatmaya kullanıyor); F11 tek yol.
2. **Gerçek Steam**: başarım açma, Steam Cloud, overlay, Rich Presence app id olmadan sınanamadı (`steamworks.js` çağrıları belgeye göre yazılı). `SteamProgressStore` birleştirme mantığı okundu: tutarlı; Steam bir başarımı açamazsa aynı oturumda yeniden denenmez (sonraki açılışta `syncFromCloud` hepsini yeniden açar).
3. **Gerçek GPU / gerçek ses çıkışı / farklı Windows sürümleri / yüksek DPI** denenmedi (başsız yazılım GL, 5–40 FPS). Kod imzalama yok (SmartScreen uyarısı), `Keepfall.exe` simgesi Electron'un.
4. **Çevrimiçi sunucu**: bir bağlantı en çok bir oda açar ama IP başına sınır yok; `MaxRooms` (15) dolunca yeni oda reddedilir (basit yuva doldurma saldırısı mümkün). Steam çevrimdışı demosu etkilenmez (yalnız loopback, `MaxRooms` 4). Çevrimiçi yayınlanırsa IP başına oda sınırı eklenmeli.
5. **Başka oturumun alanı (dokunulmadı)**: `SpectatorFeed.Capture` her saniye, kimse düşmemişken bile tüm dünyanın karesini üretiyor (performans); izleyici savaş oynatmasında hata ayıklama katmanı bir koşuda 4 "stray red-suvari-attack" bildirdi (oynatma bitiminden 0,7 sn sonra, sönme tweeni sürerken: büyük ihtimalle geçici, `scene/*` alanı); `army-check` sonunda iki "AUDIT: 0 drawn" (başsız düşük FPS). Kullanıcıya görünen sorun gözlenmedi.
6. Özel oda lobisinde 1280x720'de alt düğme satırı ekran kenarına bitişik (sığıyor, boşluk yok; Steam demosunda özel oda kapalı).
7. Oyun kuralı gözlemi (değiştirilmedi): kıtlık/süre dolumu/beraberlik kuralları beklendiği gibi; `docs/sonraki-plan.md` §4'teki mobil/Android açık işleri bu denetimin dışında (Steam masaüstü odaklı).

## 6. Test sonuçları

- `dotnet test -c Release`: 358 / 358.
- `node tools/run-smoke.mjs` (`KF_SMOKE_PORT=5083`, yayımlanmış Release sunucu): 268 / 268 denetim geçti (bu denetimde eklenen bozuk-komut denetimi dahil).
- `node tools/i18n-scan.mjs`: 0 sarılmamış / 0 İngilizcesiz; `node tools/i18n-server-scan.mjs`: 0.
- İstemci: `tsc --noEmit` temiz, `vite build` (geçici klasöre; `client/dist` Production'ındır) başarılı.
- Steam: `steam-check` 16/16, `steam-edge-check` tümü geçti.

## 7. 5090 dev-LAN sunucusu

İşin sonunda 5090'da aktif oda/oyuncu yoktu (günlük: `0 rooms, 0 players`; kurulu bağlantı yok). Yeniden derleme **yapılmadı**: sunucuyu durdurma/yeniden başlatma izni otomatik denetimde reddedildi. 5090 hâlâ eski sunucu koduyla çalışıyor (B1/B2 düzeltmeleri yok). Yenilemek için `docs/devir-notu.md` §4c'deki adımlar: önce 5090 işlemini durdur, sonra `dotnet publish src/Keepfall.Server -c Release -o ..\keepfall-dev-lan\server`, `cd client && npx vite build --outDir ../../keepfall-dev-lan/client/dist --emptyOutDir`, `config/challenges.json` kopyası, yeniden başlat.
