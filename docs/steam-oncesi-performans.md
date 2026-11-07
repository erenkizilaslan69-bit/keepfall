# Steam öncesi performans, lag ve donma denetimi (2026-11-07, `dev`)

Hedef: Steam'e yüklemeden önce istemci ve sunucuda takılma/sızıntı kalmasın. Davranış, kurallar ve `balance.json` değişmedi; yalnız çizim/bellek/zamanlayıcı düzeltmeleri. Ölçüm makinesi: RTX 4060 dizüstü, Windows 11, başsız Chrome (CDP).

## Araçlar (hepsi `tools/`, dev sunucu 5081 + Vite 5174 gerekir)

| Araç | Ne yapar |
|---|---|
| `perf-run.mjs <etiket> <hız> <GxY> <düşük 0/1> <bot>` | 1 insan + N botla TAM maç; kare süresi dağılımı (p50/p95/p99, >50 ms), yığın, DOM, Phaser nesneleri, uzun görevler, SignalR mesaj dökümü, kare başına adım profili (`guarded` zamanlayıcısı). Çıktı `art/shots/perf/*.json`. `GPU=1` gerçek ekran kartı (yoksa yazılım GL), `GC=1` her örnekte çöp toplama, `CPUPROF=1` başlangıç CPU profili |
| `perf-loop.mjs [tur] [sn]` | maç → menü → maç döngüsü; her turdan sonra GC + yığın/DOM/dinleyici sayımı (sızıntı) |
| `perf-windows.mjs [tur]` | pencere (kale, bina, orman, rakip) aç/kapa ×1100, aynı sayımlar |
| `fps.mjs` | 3 kalabalık savaş (3×24v24); `SIZE`, `GPU`, `LOW`, `THROTTLE=6` (CPU 6× yavaş), `CPUPROF=1` (fonksiyon bazında CPU) |
| `perf-shot.mjs <önek>` | önce/sonra ekran görüntüsü (kale, kamp 1×/3×, boşta çiti) |
| `perf-steam-start.mjs` | Steam paketinin açılış süresi ve süreç bellekleri |

DEV'de `?nodebug=1` hata ayıklama katmanını kapatır (ölçümde şart). Not: başsız Chrome'da yazılım GL (ekran kartı yok) ≈ 8 FPS verir; bu kötümser sınırdır, sıralama için kullanılır, mutlak sayı için değil.

## Ölçüm tablosu (1 insan + 3 bot, ×5, tam maç)

| Durum | kare p50 / p95 / p99 | >50 ms | en uzun | yığın (GC'li) | DOM | Phaser nesne |
|---|---|---|---|---|---|---|
| **Önce**, ekran kartı, 1280×720 | 5 / 5,2 / 6 ms (hazırlık); 5 / 5,9 / 7 (savaş) | 16 / 0 | 1216 ms (maç başı) | 75 → 117 (GC'siz dalgalı) | 446 | 903 |
| **Sonra**, ekran kartı, 1920×1080 | 5 / 5,2 / 6,2 (hazırlık); 5 / 6,1 / 11,1 (savaş) | 11 / 4 | 1077 ms (maç başı) | **69,9 → 75,8** (düz) | 441 | 874 |
| Sonra, ×1 gerçek hız, 1080 | 5 / 5,3 / 6,1 | 11 | 903 ms (maç başı) | 75,8 → 74,8 | – | – |
| Sonra, düşük grafik, 1080 | 5 / 5,2 / 5,6 (savaş) | 13 / 1 | 950 ms (maç başı) | düz | – | 904 |
| Önce, yazılım GL, 1280×720 | ≈110–130 ms (≈8 FPS) | çoğu kare | 3741 ms (maç başı) | 75 → 103 | 455 | 892 |

- Kare süresi 5 ms = başsız Chrome'un 200 FPS tavanı; savaş evresindeki izleyici (elenme sonrası, tüm harita çiziliyor) dahil kare başına JS işi ortalama **0,2 ms**.
- Kalabalık savaş (`fps.mjs`, 3 savaş × 24'e 24, 144 asker, 1920×1080, ekran kartı): p50 5 / p99 7,1 ms, 0 takılma. Düşük grafik açık/kapalı fark yok (p99 13–18 ms her ikisinde; bu makinede GPU sınırı yok).
- CPU 6× yavaşlatılmış (zayıf dizüstü benzetimi), 1080, kalabalık savaş: p50 14–19 ms, p95 20–26 ms ⇒ **50–90 FPS**; 0 kare >50 ms (gürültü ±%30: makinedeki başka yük).
- Elenme, izleyici, maç sonu ekranı: tam maç koşusunda (bizim insan elendi, izleyici + sona kadar) 0 hata, kare p99 11 ms; `spectator-state` ortalama 1,3 ms.
- Ağ (JSON SignalR, 1 insan): `CastleState` 4,8 KB, `RoomState` 0,9 KB, `MapState` 0,2 KB, saniyede bir ⇒ **≈ 6 KB/sn** (×5 hızda ≈ 15 KB/sn). Gereksiz tam görünüm yok denecek kadar; sorun değil.
- Sunucu (dev, 15 oda botla, ×10): tick işi ort 18–62 ms, p95 80–114 ms, en çok 154–390 ms (1 sn'lik tick'te %6–11), gecikme p95 11–15 ms, bellek 107 MB (heap 9–16). Gerçek hızda (×1) bunun ~onda biri. `docs/olcum-render.md` kapasite tablosu ile uyumlu. Oyuncusuz kalan oda botlarla 10 dk (`AbandonedRoomMinutes`) çalışmaya devam eder: tasarım gereği (yeniden bağlanma), ama Render'da `MaxRooms` 15'i doldurabilir.

## Bulunan sorunlar ve düzeltmeler (her biri ayrı commit)

1. **Bellek sızıntısı: her maçtan sonra sahne ve arayüz kalıyordu** (`4bf605c`). `perf-loop` 8 tur: yığın **+2,8 MB/tur**, DOM **+350 düğüm/tur**, dinleyici +27/tur ⇒ düzeltmeden sonra yığın **+0,1 MB/tur**, DOM sabit, dinleyici +6/tur (kalan 6: Phaser'ın ses kilidi açma + görünürlük dinleyicileri; başsız Chrome'da hiç tıklanmadığı için kalıyor, gerçek oyuncuda ilk tıklamada silinir).
   - `WorldScene`: `game.destroy()` sahneyi yalnız `destroy` olayıyla bitirir; `pointerup`/`blur` pencere dinleyicileri `shutdown`'a bağlıydı ⇒ tüm sahne (çocuklar, dokular çevresindeki kapanışlar) yaşıyordu.
   - `Notifications` (250 ms) ve `ReportTags` (400 ms) `setInterval`'ı hiç durmuyordu: her maçtan sonra kopmuş öğeler üzerinde `querySelector`/yerleşim çalışmaya devam ediyordu (maç sayısı arttıkça kare süresini de yerdi). Artık `destroy()`.
2. **Kamp ateşi taşları ve boştaki işçi çiti her karede yeniden üçgenleniyordu** (`4a843aa`). Phaser `Graphics` her karede tüm komutlarını tekrarlar ve dolguları `earcut` ile böler; kamp ≈ 2960, çit 320 komut. Tek seferlik `RenderTexture`'a (4× çözünürlük, yumuşatmalı) alındı (`scene/Bake.ts`). CPU profili: `GraphicsWebGLRenderer` + `earcut` ≈ **%10 kare süresi → listeden çıktı**. Önce/sonra görüntü aynı (`art/shots/perf/before-*`, `after-*`).
3. **Maç başlangıcında tek parça iş** (`CourtyardFloor`, `Roads`). CPU profili (başlangıç): `bakeRoads` 313 → ~70 ms, `dirtCover` 278 → 33 ms, `drawRoads` 193 → ~40 ms (toplam ≈ −640 ms); görünüm aynı. (Patika kapsamı dört kalede aynı: bir kez hesaplanır; yol hücrelerinde karekök öncesi sınır kutusu denetimi.)
4. `prefs.reducedEffects()` / `lowGraphics()` kare başına çok kez `matchMedia` / `URLSearchParams` kuruyordu (`739ed60`); artık bir kez. Küçük (profilde %0,4–1,2).

## Düzeltilmeyen / kalan riskler

- **Maç başı ≈ 1 sn'lik tek görev** (ekran kartıyla 0,6–1,1 s, yazılım GL'de 3,7 s): `Phaser.Game` her maçta yeniden kurulduğu için GL sürücüsü shader bağlama (`getProgramParameter` ~560 ms), doku yükleme (`texImage2D` ~800 ms) ve framebuffer denetimi (`checkFramebufferStatus` ~620 ms) yapıyor. Bulut perdesinin arkasında (oyuncu zaten bekliyor); JS tarafı bu turda 640 ms kısaldı. Daha fazlası için oyun nesnesini menüde tutmak/yeniden kullanmak gerekir (büyük değişiklik, yapılmadı).
- **Doku belleği ≈ 315 MB** (278 doku, GPU'ya açılmış; en büyük tek doku 5 MB): birim sayfaları 4160×320 ve 5 renk × 7 birim × ~10 animasyon, kullanılmayan renkler de yükleniyor. Zayıf entegre ekran kartlarında (1–2 GB paylaşımlı) zorlayabilir. Öneri: yalnız maçtaki renklerin sayfalarını yükle (≈ %20) ve boş kareleri kırp/atlas yap (ayrı iş).
- **Ekran kartı yoksa** (Chromium yazılım GL'ye düşer) oyun ≈ 8 FPS: Steam sayfasına asgari gereksinim olarak "OpenGL/D3D11 destekli ekran kartı" yazılmalı.
- Steam paketi (Electron kabuğu, sunucu self-contained): pencere **2,7–3,4 s**, ilk menü **3,3–4,1 s** (≈ 0,9 s'si sunucu: `PublishReadyToRun` denendi, ≤ 0,1 s kazanç, uygulanmadı), yeniden yüklemede menü 0,6 s, Hızlı oyna → harita 1,1 s. Bellek (bir maçta, 1 oyuncu + 3 bot): sunucu ≈ **100 MB** (`DOTNET_gcServer=0` zaten kabukta), Electron toplam çalışma kümesi ≈ 1,15 GB (GPU süreci ≈ 470 MB/930 MB özel, görüntüleyici ≈ 440 MB) — çoğu doku; zamanla artmıyor (58 sn'de düz).
- `army-check`'te ara sıra tek `AUDIT seen:…: 0 drawn, 1 expected` çıkıyor (×20 hızda başkasının ordusu bir kare çizilmeden önce); `Movers` bu turda değişmedi, CLAUDE.md'deki bilinen zamanlama uyarılarından biri gibi; hata ayıklama oturumunun ele alması için not.

## Düşük özellikli makine için öneri

1. İlk açılışta kare hızı düşükse mevcut "Düşük grafik" teklifi çalışıyor (30 sn'nin 20'sinde <30 FPS).
2. Steam sayfasında asgari gereksinim: 64-bit Windows 10, 4 GB RAM, D3D11 destekli GPU (≥ 1 GB bellek), 1 GB boş alan.
3. (Sonraki tur) Yalnız kullanılan renklerin doku sayfalarını yükle; Phaser oyununu menüde canlı tut.
4. Bir CPU'su 4–6 kat yavaş makine (benzetim) hâlâ 50+ FPS veriyor; sorun çıkarsa önce GPU/doku belleği aranmalı, JS değil.

## Regresyon

`dotnet test -c Release` 358/358 geçti; `node tools/run-smoke.mjs` "All checks passed"; `tsc --noEmit` + `vite build` (geçici klasöre; `client/dist` Production'ın) temiz; `node tools/replay-check.mjs` donma yok, istisna yok; `node tools/army-check.mjs` istisna yok (yukarıdaki tek AUDIT notu).

## Diğer bulgular (bu görevin dışında, düzeltilmedi)

- Dev sunucuda oyuncusuz odalar 10 dk botlarla sürer ve `MaxRooms` 15'i doldurur: arka arkaya birçok test oturumu "Sunucu dolu" ile başarısız olur (testleri sunucuyu yeniden başlatarak koş).
- `tools/steam-launch.mjs` tabanlı eski betikler `taskkill /IM Keepfall.exe` ile aynı makinedeki başka bir Keepfall oturumunu da kapatabilir (`perf-steam-start.mjs` yalnız kendi süreçlerini kapatır).
