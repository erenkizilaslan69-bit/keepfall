# Gece durumu (2026-11-11 → 12, gözetimsiz oturum)

Sabah buradan devam edilir. Her adımdan sonra güncellenir.

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

## Sıradaki

E krallık kartları → F ana menü → G test + rapor.

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
