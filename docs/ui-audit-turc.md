# Tur C: dokunmatik / mobil cila (2026-11-05, `dev` dalı)

Kural: her değişiklik yalnız `pointer: coarse` içinde; masaüstü görünümü değişmedi. Ölçüm: `tools/ui-audit.mjs` (tüm cihazlar, EN+TR), önce = Tur C başlamadan (dev `a659538`), sonra = son kod. Ayrıntılı raporlar: `ui-audit-turc-before.md`, `ui-audit-turc-after.md`.

## Sonuç (kritik / önemli / küçük bulgu sayısı)

| cihaz | önce | sonra |
|---|---|---|
| iphone16 (852x393) | 35 / 911 / 2306 | 21 / 38 / 91 |
| iphone16-bar (852x323) | 39 / 907 / 2056 | 36 / 33 / 72 |
| iphoneSE (667x375) | 26 / 691 / 2192 | 20 / 38 / 99 |
| iphoneProMax (932x430) | 33 / 940 / 2301 | 22 / 38 / 64 |
| pixel7 (915x412) | 36 / 917 / 2293 | 21 / 41 / 79 |
| small (640x360) | 44 / 698 / 2202 | 38 / 41 / 133 |
| ipad (1180x820) | 10 / 207 / 3289 | 0 / 52 / 28 |
| **masaüstü** cg1196 / cg1024 / desk1366 / desk1920 | 6 / 7 / 5 / 8 kritik | 0 / 0 / 0 / 1 kritik |

Dokunmatikte türe göre (7 cihaz toplamı): küçük yazı 8189 → **0**, küçük dokunma hedefi 4037 → **0**, yakın hedef (<8 px) 9056 → 523, örtülen 29 → 6, ekran dışı 31 → 1, güvenli bant 246 → 43. Masaüstünde kritik 26 → 1; masaüstü yazı bulguları (1606 → 1586) bilerek aynı kaldı (Tur C yalnız dokunmatik).

## Ne yapıldı
1. **Yazı** (`ui/touch-text.css`): `--fs-xs: 12px` token'ı (yalnız coarse'ta tanımlı); tüm `font-size` değerleri `max(var(--fs-xs, 0px), …)` ile yazıldı, masaüstünde değişken tanımsız olduğu için etkisiz. Daha geniş çıkan üst şerit (saat: evre kelimesi zamanın altına, kaynak sayıları) telefona sığacak şekilde ayarlandı.
2. **Dokunma alanı** (`ui/touch-targets.css`): `--tap: 44px`, `--tap-gap: 8px`; düğme/alan/onay kutusu/kaydırıcı en az 44 px; görsel küçük kalan oyuncu çipleri ve +/− düğmeleri `::after` ile büyür; komşular arası en az 8 px (satır aralıkları dahil).
3. **ui-audit kritikleri** (`ui/touch-fixes.css`, `ui/step-buttons.ts`, `ui/touch.ts`): menüde sayfa aşağı kayarken yuvarlak düğmeler çekilir (deste kartı çevirme simgesi örtülmez); kayan panel başlığının altında kalan seçiciler (`scroll-padding`); pencere/panel yan kaydırması (kapat düğmesi köşenin içinde, kd-head); pencere gövdesi kapat düğmesinin altından başlar; saldırı formunda +/−/Tümü/Yarısı etkisizken pasif görünür; yardım düğmesinin nabzı artık büyümez. Bildirimin pencere X'ini örtmesi iPad'de 0'a indi.
4. **touch-check 'titreme dokunuş sayılır'**: test hatasıydı (sürükleme sonrası kale ekran merkezinde değildi; kale seçilince kamera kaleye ortalanır; kamera yavaşlayarak durur). 20 koşuda eski %50 düşüyordu, düzeltilmiş 20/20 geçti.

## Kalan bulgular (bilinçli / araç gürültüsü)
- **Ölü düğme (kritik) ~150**: elle denendi, düğmeler çalışıyor (kingdom +, demirci +1, ayarlar Hakkında/Gizlilik/Nasıl oynanır, rehber). Denetimin sunucuya giden eylemlerde, kaydırılmış panellerde değişikliği yakalayamaması; çoğu `iphone16-bar`/`small`. Gerçekten etkisiz kalan (kaynak yok, asker yok) düğmeler pasif görünür hale geldi.
- `small` (640x360) saldırı formunda `+` bir kaydırma konumunda kapat düğmesinin altında kesilmiş görünür: kaydırılmış satır, pencerenin kenarına gidiyor (kaydırınca düzelir).
- `notes-many` (3–4 bildirim aynı anda, test patlaması), `note-over-modal` (düşen kale geri sayımı üstünde bildirim), 8 px'lik yan kaydırma uyarıları (kingdom panel), `outside-safe-area` (üst şerit 59 px'lik çentik bandına ~2 px) — küçük, ileride.
- **touch-offset-check** "canvas moved 70 px: the touch is at canvas (426,146), expected (300,180)" Tur C'den ÖNCE de düşüyordu (eski kodda aynı sayı); asıl denetim ("tap still lands on the castle") geçiyor. Test beklentisi gözden geçirilmeli.

## Araç değişiklikleri
`tools/ui-audit.mjs`: JSON çıktısı (`--out x.md` → `x.json`, git'e girmez), `--shots`, yakın hedef (<8 px) denetimi, `::before` dokunma alanı, ölü düğme için görünmeyen düğmeyi kaydırıp bas + sunucu cevabı için ikinci bekleme + giriş değerlerini imzaya kat, dev hız düğmeleri gizli (Production'da yok), alt güvenli bant sayfa kayarken yok sayılır, kendi kaydırıcısında kesilen öğe 'dışarıda' sayılmaz, düğme adlarında 's' harfi kayboluyordu (düzeltildi).

# Tur D: iPhone 16 Safari gerçek cihaz bulguları (2026-11-05, `dev`)
1. **+/− zoom düğmeleri kaldırıldı** (yalnız dokunmatik; yakınlaştırma iki parmakla, masaüstünde tekerlek aynen).
2. **iOS çift dokunma sayfa zoom'u** (`ui/no-page-zoom.ts`, `touch.css`): `touch-action: manipulation` (harita `none`), gesture/dblclick iptali, 300 ms içindeki ikinci `touchend` iptali ve basış elle iletilir (hızlı +1/+1 iki sayılır), `visualViewport.scale≠1` ise viewport sıfırlanır. Test: `tools/double-tap-check.mjs` (WebKit; sayfa ölçeği 1, ikinci touchend iptal, iki dokunuş = iki silah, sekme/çip/ayarlar).
3. **Pencereler** (`ui/touch-windows.css`, `windows.ts`, `enemy-window.ts`): kaydırılabilirlik kenarda solma + ok ile belli; Yükselt / Saldır yapışkan alt çubukta (gövde yeterince yüksekse; kısa pencerede akışta kalır, içeriği örtmez); rakip kale penceresi Gözcü / Ulak / Saldırı sekmeleri (rehber doğru sekmeyi kendisi açar).
4. **Rakip avatar paneli** minimap'in soluna/üstüne kayar, üstüne binmez.

Testler: touch-check 15/15, rotate-check 3/3, double-tap-check geçti, rehber 852x393 mobil ve 1280x720 masaüstü baştan sona (32/34 adım). ui-audit (Tur C sonrasına göre): dokunmatikte kritik aynı seviyede (small 38→28), masaüstü kritik 0–1 (yalnız 2 px'lik rapor etiketi taşması, önceden de vardı). Kalanlar: yapışkan çubuğun altına kaydırılmış öğeler (denetim 'örtülü/yakın' sayıyor), `small` cihazda bildirim sekmenin üstünde, touch-offset-check'in eski düşen denetimi.
**Bilinen:** 852x323 (Safari çubuğu açık, en kısa) mobil rehber 17. adımda (orman tıklaması) takılıyor; Tur D'den önceki kodda da aynı.
