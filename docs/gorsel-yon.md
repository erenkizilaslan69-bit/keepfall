# Keepfall görsel yön

Hedef his: **chunky, medieval, cozy.** Kalın hatlar, sıcak ahşap ve pergament, derin mavi-kırmızı kumaşlar, altın süsler. Konsept görseli (yapay zekayla üretilmiş, yazıları bozuk) yalnız havayı verir, birebir kopyalanmaz.

## Kural
- **Tiny Swords kalır:** karakterler (birimler, işçiler) ve binalar.
- **Biz çizeriz:** arayüz (panel, buton, tabela, şerit, mini harita, logo), arazi süsleri, efektler. CSS, SVG, canvas ya da prosedürel; dış görsel dosyası yok.
- Yeni kütüphane yok (React yok): mevcut TypeScript + HTML/CSS katmanı. Sunucuya ve oyun mantığına dokunulmaz.

## Palet
| Rol | Renk | Nerede |
|---|---|---|
| Pergament | `#e4d6a7` (açık `#f0e6c2`, koyu `#cdbb86`) | panel içi, şerit içi |
| Ahşap açık / orta / koyu | `#a8723a` / `#7a4a25` / `#4b2e17` | çerçeve, tabela, direk |
| Mürekkep | `#3a2a18` (yumuşak `#6b5434`) | pergament üstü yazı |
| Lacivert kumaş | `#243a6b` (koyu `#17264a`) | bayrak, saat paneli |
| Altın süs | `#e0b040` (koyu `#9a7220`) | kenar, çivi, halka |
| Kırmızı kumaş | `#c0392b` | tehlike, saldırı, kırmızı oyuncu |
| Oyuncu renkleri | mavi `#4a8fd9`, kırmızı `#d9534a`, sarı `#e2b93b`, mor `#9b6bd1` | buton, çip, kenar (mevcut `COLOR_CSS`) |
| Çimen / kum / su | `#5fa83c` / `#e6c98a` / `#2f8fb5` | harita (Aşama 2) |

Renk tek başına bilgi taşımaz: her duruma ikon ya da yazı eşlik eder.

## Tipografi
- **Başlıklar ve etiketler:** Pixelify Sans (mevcut `--font-pixel`), kalın.
- **Rakamlar ve uzun metin:** Atkinson Hyperlegible Next (`--font-text`) kalır. Sayılar her yerde net okunur; pixel font rakamlarda yalnız büyük, tek başına duran değerlerde (saat).
- Pergament üstünde koyu mürekkep, koyu zeminde (ahşap, lacivert) açık krem yazı; her zaman yeterli karşıtlık.

## İlkeler
1. **Kalın ve kabartmalı:** 3–4 px koyu dış çizgi, altta daha koyu kalınlık (yükseklik hissi), üstte ince açık parlama.
2. **Ahşap çerçeve + pergament içi** her panelin temeli (`BasePanel`); düz renk kutu yok.
3. **Fiziksel butonlar** (`TactileButton`): üst yüzey ana renk, alt kenar çok koyu; basınca 2–4 px çöker.
4. **Haritayı kapatma:** harita üstündeki bağlamsal pencereler (bina, kale, ordu) bulanıklaşmaz, en fazla çok hafif karartma. Oyunu duraklatan büyük pencereler (rehber, savaş raporu, maç sonu) arkayı `blur(2px) brightness(.7)` yapar.
5. **Dünyaya bağlı etiketler:** bina isimleri direğe çakılı ahşap tabelalar; HUD üstten sarkan bayrak ve şerit paneller.
6. **Tek kaynak:** renk, kalınlık, gölge CSS değişkenlerinde (`--kf-*`); bir yerden değişir. Panel ve butonun çerçevesi tek bir katmanda tanımlı, ileride gerçek 9-slice görsele `border-image` ile geçilebilir.
7. **Okunabilirlik:** 1000×640'ta da taşma yok; küçük ekranda şeritler daralır, etiketler kısalır.

## Aşamalar
1. **Arayüz bileşenleri:** BasePanel, TactileButton, Tarla paneli, tüm pencereler, tabelalar, üst şerit, mini harita, kamera butonları, logo.
2. **Harita:** kumsal ve kayalarla kıyı, animasyonlu su ve dalga köpüğü, çimen ton çeşitliliği, çiçekler, toprak lekeleri, yol kenarları, gölgeler.
3. **Efektler:** vuruş parlaması, toz, kıvılcım, ok izleri, kale hasarı ve yıkılma, kamera sarsıntısı, ekran geçişleri.

## Tiny Swords kalitesine ulaşamayacağım yerler
- Elle çizilmiş piksel sanat dokusu (ahşap damarı, kumaş kıvrımı, taş oyma): CSS ile benzeri yapılır ama el çizimi kadar zengin olmaz. 9-slice'a geçiş kapısı bu yüzden açık bırakıldı.
- Konsepttekiler gibi detaylı ikon seti: ikonları sade SVG olarak çiziyorum; Tiny Swords ikonları (et, odun, demir, altın…) mevcut yerlerde kalır.
