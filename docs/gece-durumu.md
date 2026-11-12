# Gece durumu (2026-11-11, gözetimsiz oturum) — SABAH RAPORU

## Kısaca

A–G'nin hepsi bitti ve `dev`'e push'landı. Test sunucuları kapalı; 5090, Production (5080), main, Render, `balance.json` ve müziğe dokunulmadı.

**Son test turu (hepsi son commit'lerle):**

| Denetim | Sonuç |
|---|---|
| `dotnet test -c Release` | 432 / 432 |
| Duman testi (`run-smoke`, gizli bilgi) | 273 geçti, 1 düştü: "every picture is of the live game (no delay)" (`CLAUDE.md`'de kayıtlı, ara sıra düşen zamanlama denetimi) |
| `host-check` (ev sahibi + 3 konuk) | 47 / 48; düşen tek satır betiğin kendi beklentisiydi (düğme metninde "host" arıyordu, sayfa Türkçe açıldı), düzeltildi, **yeniden koşulmadı** |
| `host-fuzz` | 38 / 38 |
| `tunnel-check` | 11 / 11 |
| `steam-check` (paket) | 17 / 17 |
| `i18n-check` | 15 dil %100 (1114 metin) |
| `envoy-filter-check` | geçti (D adımında; sonra yeniden koşulmadı) |
| Rehberli maç ×1 (`tutorial-check`, en, 1280x720) | 7 / 7 adım, sayfa hatası yok |
| Ayarlar sekmeleri taşma | 15 dil × 5 sekme = 75 / 75 |
| Ana menü taşma | 15 dil (1920x1080) + 6 dil (1280x720), hepsi temiz |
| Krallık kartı taşma | 8 dil × 4 krallık × 2 karo = 64 / 64 |
| `ui-audit` masaüstü (1366x768, 1920x1080; en, tr, de, ru, zh-CN, ja; `--quick`) | 542 ekran; 2 kritik, 309 önemli, 496 küçük. Rapor `docs/ui-audit-gece.md` |

**ui-audit bulguları (düzeltilmedi):**
- Kritik (2): savaş raporu etiketi 1920x1080'de de ve zh-CN'de 2–3 px ekran dışına taşıyor.
- Önemli: Almancada bina pencereleri (tarla, oduncu, maden) 46 px yatay kaydırıyor; ayarlar ve rehber 8 px (eskiden de vardı); 3 bildirimin aynı anda görünmesi.
- Küçük: 496 "küçük yazı" (masaüstünde 12 px altı etiketler; eski bulgu).
- `lang-audit` (15 dilin tamamı, tüm ekranlar) KOŞULMADI; yerine yukarıdaki üç hedefli taşma denetimi ve 6 dilli ui-audit yapıldı.

## Bitenler

| Adım | Commit | Not |
|---|---|---|
| A1–A5 Ev sahibi güvenliği | `ec045a5`, `3a76468`, `22479ba` + belgeler | Saldırı yüzeyi ve sınırlar: `docs/steam-paketleme.md` §9. host-check 48/48, host-fuzz 38/38, tunnel-check 11/11, steam-check 17/17, 415 birim testi, duman geçti. |
| B1 Klip yakalama kaldırıldı | (bu commit) | `ui/clip.ts`, sahne kancası, maç sonu düğmesi, 15 dildeki iki metin. Ayar yoktu. "Kim kimi kandırdı" ve director/`tools/clip.mjs` duruyor. |
| B2 Çok oyunculu metinleri 13 dilde | (bu commit) | 37 metin, `docs/ceviri-parca/14.tsv`; `i18n-check` 15 dilde %100. `i18n-extract --keep-order` artık silinen metnin numarasını boş satır olarak korur (yoksa sonraki numaralar kayıp çeviriler yanlış metne düşüyordu). lang-audit (tarayıcı) G adımında. |
| B3a Düşen kale opak yıkıntı | (bu commit) | YAPILMAMIŞTI (rakip kale %45 saydamdı). Artık kalenin kendi resminden (sade ya da krallık) bellekte kesilen yıkıntı: tepe kırık, isli taş, dipte moloz; sur ve avlu da opak. Görüntü: `art/shots/ruin/cmp-castle.png` (sol ayakta, orta eski, sağ yeni). |
| B3b Hayalet ordu dağılma efekti | (bu commit) | YAPILMAMIŞTI (ordu bir karede yok oluyordu). Artık askerler mora dönüp incelerek yükselir + koyu duman. Tetik: kendi hayaletimiz (Gölge), Kâhin'in sahte gördüğü ordu, ya da kapımıza kadar gelip savaşsız kaybolan ordu. Sunucuya dokunulmadı. Görüntü: `art/shots/ruin/cmp-phantom.png`. Araç: `node tools/shot-ruin.mjs`. |
| C Ayarlar penceresi sekmeli | (bu commit) | Ses (ana / müzik / efekt ayrı + sessize al) · Görüntü (grafik kalitesi, tam ekran, arayüz ölçeği %85–130, efektleri azalt, FPS) · Dil (15) · Oyun (ipuçları, ulak mesajları, tam kurallar, rehberi sıfırla) · Kontroller (kısayol listesi). Altında Hakkında / Gizlilik / Ana menüye dön. Kalıcı (localStorage, try/catch). Ana ses yalnız düzey çarpanı; müzik akışına dokunulmadı. Harita ölçeği ayarı yok (oyunda tekerlek / + − var), not olarak yazıldı. Görüntüler `art/shots/ui-tur/settings/`; araç `node tools/shot-settings-tabs.mjs` (taşma denetimi: en, tr, de, ru temiz; kalan diller çeviri sonrası G'de). |
| D Ulak filtresi iki katman | (bu commit) | Nefret söylemi sunucuda HER ZAMAN maskeli (kapatılamaz); hafif küfür alıcının oyununda, Ayarlar → Oyun → "Hafif küfürleri filtrele" (varsayılan açık). 15 dil listesi ikiye ayrıldı (`docs/kufur-filtresi.md`). `node tools/envoy-filter-check.mjs` geçti (filtre açık: `you **** and you ******`; kapalı: `you shit and you ******`). |
| E Krallık paneli kart | (bu commit) | Form yerine kart: krallığın kendi renginde çerçeve + flama üstünde amblem, ad, unvan, 2 satır kimlik cümlesi; yetenekler ikon + kısa başlık karoları (uzun metin üzerine gelince `title`, dokununca altında açılır); seçilen karo hafif büyür ve krallık renginde parlar; bir seferde tek yeteneğin denetimleri açık. Gizli krallık kuralı aynen (panel yalnız kendi krallığını gösterir, sunucuya dokunulmadı). **Seçilen: A** (kart üstte, karolar yan yana). Neden: mevcut 360 px panele sığıyor, haritayı/avluyu örtmüyor, 1280x720'de kaydırma yok; B (kart solda dikey flama, denetimler sağda) 520 px istiyor ve avlunun üstüne biniyor. B geri gelir: `?kd=b` ya da `localStorage keepfall_kd = b`. Görüntüler: `art/shots/ui-tur/kingdom-compare.png` (sol+orta A, sağ B), `kingdom-{a,b}-en-*.png`. Araç: `node tools/shot-kingdom-cards.mjs` (taşma denetimi). |
| F Ana menü | (bu commit) | Canlı harita arka planı + logo + tek net ana düğme "Oyna" (hızlı maç), ikinci sırada Meydan Okuma / Başarımlar, çok oyunculu girişler (Oyun kur, adresle katıl, Steam listesi) kendi küçük kartında KORUNDU, ad + "Oyundan çık" (yalnız masaüstü) altta küçük; düğmeler üzerine gelince hafif yükselir + kısık tık sesi. **Seçilen: B** (büyük kağıt panel yok, düğmeler haritanın üstünde). Neden: harita ve logo öne çıkıyor, "Oyna" ekrandaki en büyük şey, mağaza görüntüsüne daha yakın; A (her şey kağıt panelde, eski düzenin toparlanmışı) haritanın ortasını kapatıyor. A geri gelir: `?home=a` ya da `localStorage keepfall_home = a`. Görüntüler (1920x1080): `art/shots/ui-tur/home-b-en-desktop.png`, `home-a-en-desktop.png`, yan yana `home-compare.png`; tr/de ve 1280x720 (`720/`) da çekildi, taşma yok. Araç: `node tools/shot-home.mjs` (`HOSTED=1` masaüstü girişleri). |

## Sıradaki

Listede kalan iş yok (A–G bitti). Sabah bakılacaklar aşağıda.

## Kararlar (soru sormadan verilenler)

- Ulak filtresi: `envoy.profanityFilter` (balance.json) anahtarı yerinde ama artık etkisiz (nefret katmanı kapatılamaz, hafif katman oyuncunun ayarı). Oyuncu ADLARI iki katmanla sunucuda maskelenmeye devam ediyor.
- Ölüm dilekleri (ja 死ね vb.) ve engellilik hakaretleri (retard, 병신, 脑残) "emin değilsen her zaman filtreli" kuralıyla nefret katmanına kondu.

- Hayalet ordu yolda başka orduya rastlayıp dağılırsa rakip tarafında efekt YOK (istemci bunu görüş dışına çıkmaktan ayıramaz; sunucuya/gizli bilgiye dokunmamak için böyle bırakıldı). Kapıda dağılma ve sahibinin kendi görünümü efektli.

- **Tarayıcıdan LAN'a katılma kaldırıldı**: "statik dosyalar konuğa kapalı" istendiği için konuk yalnız oyunun kendi kopyasıyla katılır.
- Kick yalnız lobide; maçta kopan oyuncuyu bot oynatır (kale alınmaz).
- Yasak kimliği: LAN'da IP, Steam'de Steam kimliği; yalnız o oda için.
- Komut hız sınırı eklenmedi (ölçümde gerek görülmedi; risk olarak yazıldı).

## Sorunlar / açık riskler

- Yeni çeviriler yapay zekâ destekli; anadil gözden geçirmesi yok (diğerleri gibi).
- `i18n-extract` HER ZAMAN `--keep-order` ile çalıştırılmalı (bayraksız çalıştırmak tüm numaraları yeniden dizer).

- Steam tüneli gerçek hatta (iki hesap) denenmedi.
- Bkz. `docs/steam-paketleme.md` §9 "Kalan riskler".

## Eren'in karar vermesi / bakması gerekenler

1. **E ve F seçimleri**: krallık kartında A, ana menüde B uygulandı; görüntülere bak (`art/shots/ui-tur/kingdom-compare.png`, `home-compare.png`). Diğeri `?kd=b` / `?home=a` ile açılır.
2. **Tarayıcıdan LAN'a katılma kaldırıldı** (konuğa dosya sunulmuyor). İstenirse geri gelmez; konuk oyunun kendi kopyasıyla katılır.
3. **Nefret / hafif küfür ayrımı** (`docs/kufur-filtresi.md`): ölüm dilekleri ve engellilik hakaretleri "her zaman filtreli" tarafta. Liste kısa; anadil gözden geçirmesi yok.
4. **Yıkık kale görünümü** (`art/shots/ruin/cmp-castle.png`): kalenin kendi resminden kodla kesiliyor; beğenmezsen elle çizilmiş yıkıntı ile değişir.
5. **Çeviriler**: gece eklenen 65 metin (çok oyunculu 37 + ayarlar/menü 28) yapay zekâ çevirisi, 13 dilde gözden geçirilmedi.
6. **Gerçek Steam testi** hâlâ senin elinde (`docs/steam-paketleme.md` §8); tünel, davet ve lobi listesi iki hesapla denenmedi.
7. ui-audit'in 2 kritik + Almanca bina penceresi taşması düzeltilsin mi (küçük iş, bu gece yapılmadı).

## Yapılamayanlar / eksik kalanlar

- `lang-audit` tam turu koşulmadı (yukarıda).
- `host-check` betik düzeltmesinden sonra yeniden koşulmadı (47/48'in düşeni betik hatasıydı).
- Hayalet ordu yolda başka orduya rastlayıp dağılırsa rakip tarafında efekt yok (yalnız kapıda ve sahibinde).
- Ayarlarda "harita ölçeği" yok (oyunda tekerlek ve + / − var).
- Komut hız sınırı eklenmedi (risk olarak `steam-paketleme.md` §9'da).
- Yeni ekranlara (ayarlar, krallık kartı, ana menü) İngilizce görüntülerde gözle bakıldı; diğer dillerde yalnız otomatik taşma denetimi var.
- ui-audit için Playwright geçici klasöre kuruldu (oturum scratchpad'i); kalıcı değil.

## Commit listesi (bu oturum, eskiden yeniye)

| Commit | İş |
|---|---|
| `ec045a5`, `3a76468`, `22479ba`, `009cecf` | A: ev sahibi güvenliği (sunucu sınırları + kick, kapı bekçisi, fuzz, belgeler) |
| `5ef82e4` | B1: klip yakalama kaldırıldı |
| `368ec90` | B2: çok oyunculu metinleri 13 dilde + çeviri numaralandırma düzeltmesi |
| `574e914` | B3: opak yıkık kale + hayalet ordu dağılması |
| `e22bfa5` | C: sekmeli ayarlar |
| `d33aaec` | D: ulak filtresi iki katman |
| `3701226` | E: krallık kartı |
| `ec5da88` | F: ana menü |
| `17ebcee` | G: kalan metinler 13 dilde |
| (bu commit) | G: test turu, `docs/ui-audit-gece.md`, sabah raporu, devir notu |

---
## Gece turu 2: modlar, XP, görev takibi (2026-11-12)
- [x] A1/A2/A3 Çekirdek: `match.modes` tablosu, `MatchMode`, `Room.SetMode`, hub `SetMode`, bot hızı maçtan, 10 yeni test (442). Ölçüm: `docs/maç-modlari.md`.
- [ ] A4/A5 Lobi seçici, açık oyunlar listesi, Steam lobi verisi, Rich Presence, 15 dil
- [ ] B XP/seviye/ödül, profil, maç sonu, fuzz
- [ ] C Görev takibi
- [ ] D Testler + rapor
- [x] A4/A5 Lobi seçici (ev sahibi seçer, herkes görür), ana menüde "Oyna" altında seçici (tarayıcıda hatırlanır), açık oyunlar listesinde mod etiketi, Steam lobi verisi `mode`, Rich Presence `{%mode%}`, rehber metni, 15 dil (19.tsv, 20.tsv). Görüntü: `art/shots/modes/`.
- [x] B-sunucu: `Progress/Xp.cs` (XP kuralları, anlar, seviye eğrisi 30 seviye, unvan/desen izin listeleri), `MatchFacts` genişledi (kandırma günlüğünden), `ProgressResultView.Xp`, hub `SetProfile` (unvan/seviye/desen, yalnız bilinen kimlik; tümden red), `PlayerView/RankView` Title/Level/Pattern, `CastleView.Stats` (görev takibi için kendi sayıların), 15 yeni test (457).
- [ ] B-istemci: depo (xp, anlar), seviye hesabı, profil ekranı, maç sonu XP, lobi gösterimi, desenler; C görev takibi; i18n
- [x] B-istemci + C: depo (xp, anlar, unvan/desen seçimi, steam birleştirme), `progress/level.ts` (eğri, 13 unvan, 8 desen), profil bölümü, maç sonu XP dökümü + dolma animasyonu, lobi/sıralamada Sv·desen·unvan, ilk geçiş bonusu, görev takibi (J, ayar), 62+3 yeni metin 15 dilde. Görüntüler `art/shots/xp/`.
- [ ] D: duman/fuzz genişletme, tam testler, rehberli maç, her moddan tam maç, ilerleme.md tablosu, rapor
- [x] D: dotnet 457/457, duman geçti, host-check + host-fuzz + steam-check geçti, i18n-check 15 dil %100, lang-audit (bölünen kelime 0, ham kimlik 0), rehberli maç x1 (gerçek hız) geçti, her moddan tam maç (`mode-match-check`) geçti, paket yeniden derlendi. Görüntüler `art/shots/modes`, `art/shots/xp`.

---
## Cila turu 3 (2026-11-12)
- [x] 1 çoğul · 2-4 lobi · 5 rehberli görev takibi · 6 bot stoku · 7 DE sekme (commit'ler dev'de). Kalan: test turu (tutorial x1, smoke, host-check, paket) → ardından gece turu (ulak, savaş müziği, tek kişilik lobi, krallık rozeti hatası).
