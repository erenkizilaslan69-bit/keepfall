# Gece durumu (2026-11-11 → 12, gözetimsiz oturum)

Sabah buradan devam edilir. Her adımdan sonra güncellenir.

## Bitenler

| Adım | Commit | Not |
|---|---|---|
| A1–A5 Ev sahibi güvenliği | `ec045a5`, `3a76468`, `22479ba` + belgeler | Saldırı yüzeyi ve sınırlar: `docs/steam-paketleme.md` §9. host-check 48/48, host-fuzz 38/38, tunnel-check 11/11, steam-check 17/17, 415 birim testi, duman geçti. |
| B1 Klip yakalama kaldırıldı | (bu commit) | `ui/clip.ts`, sahne kancası, maç sonu düğmesi, 15 dildeki iki metin. Ayar yoktu. "Kim kimi kandırdı" ve director/`tools/clip.mjs` duruyor. |
| B2 Çok oyunculu metinleri 13 dilde | (bu commit) | 37 metin, `docs/ceviri-parca/14.tsv`; `i18n-check` 15 dilde %100. `i18n-extract --keep-order` artık silinen metnin numarasını boş satır olarak korur (yoksa sonraki numaralar kayıp çeviriler yanlış metne düşüyordu). lang-audit (tarayıcı) G adımında. |

## Sıradaki

B3 yıkık kale / sahte ordu efekti → C ayarlar → D ulak filtresi → E krallık kartları → F ana menü → G test + rapor.

## Kararlar (soru sormadan verilenler)

- **Tarayıcıdan LAN'a katılma kaldırıldı**: "statik dosyalar konuğa kapalı" istendiği için konuk yalnız oyunun kendi kopyasıyla katılır.
- Kick yalnız lobide; maçta kopan oyuncuyu bot oynatır (kale alınmaz).
- Yasak kimliği: LAN'da IP, Steam'de Steam kimliği; yalnız o oda için.
- Komut hız sınırı eklenmedi (ölçümde gerek görülmedi; risk olarak yazıldı).

## Sorunlar / açık riskler

- Yeni çeviriler yapay zekâ destekli; anadil gözden geçirmesi yok (diğerleri gibi).
- `i18n-extract` HER ZAMAN `--keep-order` ile çalıştırılmalı (bayraksız çalıştırmak tüm numaraları yeniden dizer).

- Steam tüneli gerçek hatta (iki hesap) denenmedi.
- Bkz. `docs/steam-paketleme.md` §9 "Kalan riskler".
