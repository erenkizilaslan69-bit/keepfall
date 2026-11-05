# Sonraki güncelleme planı: mobil ve davetli çok oyunculu

**Durum (2026-11-04):** CrazyGames'e şimdilik **masaüstü + mevcut sağlam özelliklerle** başvuruluyor. Mobil/dokunmatik ve davetli çok oyunculu iş **iptal değil, sonraki güncellemeye kaldı**.
Hiçbir şey silinmedi: crazy yapısında yalnız bayrakla kapalı (bkz. "Bayraklar ve geri açma"). itch.io ve yerel yapıda her şey açık.

## 1. Bu turda yapılanlar (commit'ler)

| Konu | Commit'ler |
|---|---|
| Yeniden bağlanma (son oda kaydı, görünür sekmede hat denetimi, "Reconnecting...", lobi koltuğu 60 sn) | `5ed2066` |
| Davet sistemi (6 harflik kod, `?room=`, Quick Match / Private Room, botla doldur, hata metinleri) | `7dd4e95` |
| CrazyGames davet katmanı (updateRoom, showInviteButton/hide, getInviteParam, isInstantMultiplayer, muteAudio) | `19b7557` |
| Mobil/dokunmatik (viewport, 1 parmak sürükleme + 2 parmak zoom, uzun basma ipuçları, 44 px, "Rotate your device", düşük grafik varsayılanı) | `cb5c8c6` |
| **iOS çökmesi**: 15104x15104 deniz TileSprite (870 MB) → düz dikdörtgen; doku belleği 1046 → 176 MB; `?debug=1` paneli, 30 sn'de bir `diag` günlüğü, WebGL kayıp kurtarma | `1556fba` |
| Tuval/safe-area, döndürünce harita ortası | `43d43b0` |
| **Dokunma kayması** (Safari çubuğu kanvası 70 px kaydırır): dokunma→tuval dönüşümü anlık `getBoundingClientRect`'ten | `8cb0bdf` |
| Bina seviye görseli, performans (sis yalnız değişince çizilir: 32→65 FPS yazılım GL) | `390aa05`, `c13d747` |
| iPhone 16 gerçek cihaz turları (kamera düğmeleri etiketli, pencereler safe-area içinde, bildirimler, krallık paneli, kompakt adımlayıcılar, bağlantı mesajları, keep-alive 10/60 sn) | `332d7b3`, `b639ccc`, `24a86df`, `d8cf52d` |
| Bölüm 2: Android geri tuşu, +/- zoom, eylemsizlik, `navigator.share`, ikinci sekme devralma, oda kodu hız sınırı, sürüm uyuşmazlığı (`Hello`/`PROTOCOL`), "Play again with this group" | `9ade28f`, `93d90b5` |
| Sunucu yeniden başlayınca mesaj + kendiliğinden ana menü | `d358e6f` |
| **ui-audit** + kalibrasyon + düzeltmeler | `86f9a28`, `ac7b1c3`, `0597692` |
| Ordu çizimi sapması ("deviation"): haber 1,5 sn'den uzun kesilince sütun donup 7,5 kare zıplıyordu | `ac7b1c3` |

### Test araçları (hepsi `tools/`)
- `ui-audit.mjs` — 9 cihaz × EN/TR otomatik arayüz denetimi (`docs/ui-audit.md`, `art/shots/ui-audit/`).
- `touch-check.mjs` (dokunma/sürükleme/pinch), `touch-offset-check.mjs` (WebKit, kayık tuval), `rotate-check.mjs`.
- `invite-check.mjs` (3 tarayıcı: özel oda → davet → katıl → maç → kopma), `tab-check.mjs` (ikinci sekme, kod hız sınırı), `reconnect-check.mjs`, `restart-check.mjs`.
- `crazy-sdk-check.mjs` (SDK taklidi), `cors-check.mjs`, `zip-check.mjs`, `iframe-check.mjs` + `crazy-iframe.html`.
- `load-test.mjs` (15 oda: tick işi p95 30 ms, gecikme p95 11 ms), `perf-profile.mjs`, `movers-stall-check.mjs` (ordu çizimi, haber kesintisi), `webkit-shots.mjs`, `layout-shots.mjs`, `layout5-shots.mjs`, `mobile-shots.mjs`.
- `mem.mjs`: bellek ölçümü kalıcı dosya olarak yok; komut dosyası oturum geçici dizinindeydi. Aynı ölçüm `?debug=1` paneli ve `diag` günlüğünde (doku sayısı, MB, heap). Gerekirse `tools/perf-profile.mjs` doku MB'sini de yazar.

## 2. ui-audit'in son bulguları ve önceliklendirme

Son koşu: 1258 ekran, ham kritik 811 (ilk koşuda 3183; düşüşün çoğu kalibrasyondan).

**Tur A — kalibrasyon (yapıldı):** pencere arkasında kalan öğeler örtülü sayılmaz, ferman bulut perdesinden sonra çekilir, geliştirme düğmeleri hariç, ölü düğmeler ayrı liste, deste kartının arkası dönük yüzü yok sayılır.
**Tur B — kritikler (çoğu yapıldı):** pencere yüksekliği (başlık+çerçeve payı), kamera/zoom düğmeleri pencere açıkken gizli, bildirimler pencere açıkken sol şeritte, Kaydet şeridi dokunuşu geçirir, oyuncu şeridi dokunmatikte isimsiz, `?` vurgusu taşmaz.
Kalan kritik/önemli: ölü düğme adayları (267; çoğu sınırda anlamlı "+1/Yarısı"), kapatma düğmesi bazı koşullarda "Yemek azalıyor" bildirimiyle örtülüyor, krallık panelinde seçicilerin sabit başlığın altında kalması, deste kartı çevirme simgesi ayar düğmesinin altında (dokunmatik).
**Tur C — yazı ölçeği (yapılmadı):** dokunmatikte en küçük yazı 11–12 px, ortak token/ölçekle (şu an 8213 küçük yazı bulgusu: 8–10 px etiketler, deste kartları, "+3.0", "prep"); küçük dokunma alanı (2054) ve safe-area bandı (554) bu turda.

## 3. iPhone gerçek cihaz bulguları (özet)
1. Çökme (bellek) → çözüldü. 2. Tuval sol %55 → çözüldü. 3. Dokunma kayması → çözüldü. 4. Pencereler/paneller sağdan taşma, X yeri, bildirim çakışması, krallık paneli soldan kesik, saldırı satırı → çözüldü (yeni gerçek cihaz turuyla doğrulanmadı). 5. "connection lost" → keep-alive/ zaman aşımı + kısa kopuk gizleme + "Reconnected". 6. İlk 3 maçta bot zorluğu Kolay.

## 4. Açık kalan işler
- **Gerçek Android** testi (hiç yapılmadı; yalnız Chromium emülasyonu).
- `touch-check` içindeki **flaky "a tap (with a small wobble)"** denetimi (makine yükünde ara sıra düşüyor, tekrarında geçiyor).
- **Wi-Fi → 4G** gerçek geçişi, iOS'ta çubuk açık/kapalı geçişleri (Playwright WebKit boyut küçülünce harita çizmiyor, yalnız gerçek cihazda görülebilir).
- **iframe test sayfası** (`crazy-iframe.html`) ve yavaş 4G: yapıldı ama throttle'ın iframe'e tam uygulandığından emin değiliz.
- Rehberi gerçek telefonda baştan sona oynamak, dokunmatik laptopta fare+dokunma birlikte.
- Tur C (yazı ölçeği), kalan ui-audit kritikleri.
- CrazyGames portalı çok oyunculu gereksinimleri sayfası okunamadı (404): başvuruda tam metin elle kontrol edilmeli.

## 5. Bayraklar ve geri açma

`client/src/features.ts`: `VITE_FEATURE_PRIVATE_ROOM` ve `VITE_FEATURE_CRAZY_INVITE` (`0` = kapalı, tanımsız/başka = açık). `client/.env.crazy` ikisini `0` yapar; itch ve yerel yapı değişmedi.

**Geri açmak için:**
1. `client/.env.crazy` içindeki iki satırı sil (ya da `1` yap).
2. Sunucu zaten destekliyor (`Hello`, `/version`, kod hız sınırı, oda kapanışı); Render'ın güncel olduğunu `/version` ile doğrula.
3. `node tools/crazy-sdk-check.mjs` (bayraklar açık; kapalı sınaması `FLAGS=off`, vite'a iki `VITE_FEATURE_*=0` ekle), `node tools/invite-check.mjs`, `node tools/tab-check.mjs`, `node tools/touch-check.mjs` koştur.
4. Mobil için önce Tur C ve gerçek cihaz turu, sonra `docs/crazygames.md` kutuları (Mobil uyumlu, Çok oyunculu, Instant Multiplayer) işaretlenir.

## 6. CrazyGames masaüstü paketi: bilinen küçük sorunlar (2026-11-05)
- Masaüstü ui-audit (`docs/ui-audit-desktop-final.md`): ayarlar/rehber/krallık panelinde 8 px'lik yatay kaydırma uyarısı (görsel sorun yok), kaydırılan krallık panelinin altındaki adımlayıcılar "sınır dışı" sayılıyor (yanlış alarm), "+1/Yarısı" gibi sınırdaki düğmeler "ölü düğme" görünüyor, savaş raporu etiketi (TR) 2 px taşıyor.
- Rehberli maç/hızlı maç testleri `FinishMatch` ile bitirilemiyor (içinde insan varken sunucu reddediyor): maç sonu x1 gerçek süreyle (~18 dk) denenir (`tools/run-regression2.mjs`).
- `?debug=1` paneli ve `keepfall*` kancaları crazy yapısında yok; itch/yerel yapıda `?debug=1` hâlâ çalışır.
- Fragman çekim araçları `tools/promo/`; çekimde başka pencere görünürse take reddedilir (ekranda yalnız oyun olmalı). Çıktılar `art/promo/` (git'te yok).

## 7. Açık küçük işler: depolama engeli ve muteAudio (2026-11-05)
- **Depolama engelli iframe'de rehber yedeği (yapılmadı).** `ui/tutorial.ts`: `tutorialDone()` localStorage hata verirse `true` döner ("tarayıcı bir şey tutmuyorsa rehberi tekrar tekrar gösterme"); `armTutorial()` durumu sessionStorage'da tutar, o da hata verirse rehber hiç başlamaz. Üçüncü taraf iframe'de depolamayı engelleyen bir tarayıcıda (ya da gizli pencerede) ilk açılışta rehber çıkmaz. Çözüm taslağı: `tutorialDone()` hata verince bellekteki bayrağa baksın (başta `false`), `store.set` hata verince bellekteki bayrağı güncellesin, `armTutorial/disarm/tutorialArmed` için bellek yedeği olsun (yalnız sayfa yenilenince unutulur). Yeniden üretim: `STORAGE=blocked node tools/crazy-iframe-check.mjs <önek> http://localhost:5174` (depolama engelliyken rehber kartı/çerçeve yok görünür); bu tur yazılıp geri alındı, kod commit'lenmedi. Not: `guide.ts` `tutorialSeen()` de hata verince `true` döner, ama rehber artık kendiliğinden açılmıyor, etkisi yok.
- **muteAudio doğrulaması: DOĞRULANDI (2026-11-05, kullanıcı elle denedi).** CrazyGames önizlemesinde site ses düğmesi sesi kapatıp açıyor (`settings.muteAudio` + `addSettingsChangeListener` → `sfx.setSiteMuted`). Bir sonraki CrazyGames sürümünde başvuru formundaki "sesi kısma / muteAudio" kutusu işaretlenebilir.

