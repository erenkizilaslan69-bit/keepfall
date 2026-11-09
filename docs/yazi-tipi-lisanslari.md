# Yazı tipleri ve lisansları (15 dil)

Tüm yazı tiplerinin lisansı **SIL Open Font License 1.1 (OFL)**: ticari kullanım, oyunla birlikte dağıtım ve gömme serbest; yazı tipi tek başına satılamaz. Dosyalar repoda (OFL buna izin verir; Tiny Swords'tan farklı olarak).

| Yazı tipi | Nerede kullanılır | Kaynak | Lisans | Boyut |
|---|---|---|---|---|
| **Pixelify Sans** | başlıklar, düğmeler, tabelalar (Latin, Latin-ext) | `@fontsource/pixelify-sans` 5.3.0 | OFL-1.1 | zaten vardı |
| **Atkinson Hyperlegible Next** | küçük açıklama metni, sayılar (Latin, Latin-ext) | `@fontsource/atkinson-hyperlegible-next` | OFL-1.1 | zaten vardı |
| **Noto Sans** (yalnız Kiril alt kümesi, 400/700) | ru/uk açıklama metni | `@fontsource/noto-sans` 5.3.0 | OFL-1.1 | ~30 KB |
| **Fusion Pixel Font 12px proportional** (`latin`, `zh_hans`, `zh_tw`, `ja`, `ko`) | Kiril başlıkları (ru/uk), Çince, Japonca, Korece (tüm metin) | github.com/TakWolf/fusion-pixel-font, sürüm 2026.11.10 (`fusion-pixel-font-12px-proportional-otf.woff2`) | OFL-1.1 (üretim programı MIT); içinde Ark Pixel, Cubic 11 ve Galmuri (hepsi OFL) | dosya başına ~700 KB |

Lisans metinleri: `client/src/fonts/fusion-pixel/OFL.txt` ve `LICENSES/` (Ark Pixel, Cubic 11, Galmuri). Telif: Fusion Pixel Font, Copyright (c) 2022 TakWolf.

## Doğrulama (2026-11-10)

- **Pixelify Sans Latin + Kiril:** Latin ve Latin-ext (Türkçe ğ ı ş İ, Lehçe ą ę ł, Fransızca é è ç œ, Almanca ß ä ö ü vb.) eksiksiz. **Kiril alt kümesinde О, П, І, Ѝ, ѝ harfleri YOK** (Google'ın yayınladığı dosyada; `tools/i18n-tofu.mjs` ve tarayıcıda gerçek çizimle doğrulandı: bu harfler yedek yazı tipinden çıkıyor). Bu yüzden Kiril başlıklar Pixelify yerine Fusion Pixel `latin` dosyasıyla çizilir (Kirilin tamamı piksel stilinde).
- **Atkinson Hyperlegible Next:** Latin + Latin-ext var, **Kiril yok** (fontsource'ta kiril dosyası yok): ru/uk açıklama metni için Noto Sans yedeği.
- **Çince/Japonca/Korece:** Pixelify ve Atkinson bunları içermez. Tek çözüm piksel uyumlu bir CJK yazı tipi: Fusion Pixel Font (her dil için kendi Han biçimleri: `zh_hans` = Basitleştirilmiş, `zh_tw` = Tayvan Geleneksel, `ja`, `ko`; her dosyada ~38 bin glif: Latin, Kiril, kana, hangul, Han). Alternatifler (DotGothic16 yalnız Japonca; Galmuri yalnız Korece ağırlıklı; Zpix lisansı OFL değil) elendi.
- **Yükleme (boyut):** `client/src/ui/fonts.css` her dil için ayrı `@font-face` tanımlar ve yalnız seçilen dilin ailesini `html[data-script]` ile yığına koyar; tarayıcı kullanılmayan dosyayı indirmez. Yani Türkçe/İngilizce/Latin dillerde sıfır ek yük; Çince/Japonca/Korece/Kiril seçilince ~700 KB (+ ru/uk'da ~30 KB Noto).
- **Tofu denetimi:** `node tools/i18n-check.mjs --tofu` her dilin çevirilerindeki karakterleri yazı tiplerinin gerçek cmap tablosuyla karşılaştırır (WOFF2'den okunur); kutu (tofu) çıkacak karakter varsa listeler.
- **Piksel ızgarası:** Fusion Pixel 12 px ızgarada tasarlandı; oyundaki yazı boyutları (14–18 px gibi) tam katı olmadığı için kenarlar hafif yumuşak görünebilir. Keskin görünüm istenirse CJK dillerinde yazı boyutları 12/24 px'e yuvarlanabilir (ayrı iş; ekran görüntüleri `docs/diller-ekran/` altında).
- **Phaser tuvali (harita etiketleri):** `WorldScene.ts` `system-ui` kullanır; Windows/macOS sistem yazı tipleri CJK'yi çizer (tofu çıkmaz), piksel stili değil.
