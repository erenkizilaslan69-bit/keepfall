# Yayın öncesi tur (2026-10-31)

Amaç: demo / erken erişim öncesi kod sağlamlığı, oynanış ve yayın hazırlığı. Oyun kurallarına ve `balance.json` sayılarına dokunulmadı.

## 1. Yapılan denetimler

| Denetim | Sonuç |
|---|---|
| `dotnet test -c Release` | 276 test geçti (1 yeni: ad/emoji) |
| `tools/run-smoke.mjs` (gizli bilgi, sis, izleyici, krallıklar) | 221 denetim geçti |
| `npm --prefix client run build` (tsc dahil) | temiz |
| `tools/fuzz-hub.mjs` (yeni): 55 bozuk/saldırgan komut, bozuk çerçeve, 60 oda, aşırı büyük gövde | sunucu ayakta, bağlantı yaşıyor |
| `tools/reconnect-check.mjs` (yeni): kısa kesinti, 50 sn kesinti, sayfa yenileme, ikinci sekme, sunucu yeniden başlama | hepsi geçti (aşağıdaki düzeltmelerden sonra) |
| `tools/soak.mjs 1 20 3` (tam maç, hata ayıklama katmanı açık) | 0 ihlal, FPS ort. 39 (başsız yazılım GL) |
| `logs/client-errors.log` | son kayıt 2026-10-28; sonrasında yeni hata yok |

## 2. Bulunan ve düzeltilen hatalar

1. **Oyuncu adı oda kurmayı çökertebiliyordu.** Ad 16 karaktere kesilirken emoji ikiye bölünebiliyordu; yarım karakter JSON'a yazılamadığından `CreateRoom` hata veriyordu (emojili ad yazan her oyuncu). Artık yarım karakter, denetim ve yön-değiştirme karakterleri ayıklanır, kesim emojiyi bölmez. Ulak mesajında da yarım karakter reddedilir. Test eklendi.
2. **Bağlantı bildirimi hiç görünmüyordu.** `#banner` için CSS yoktu: "Sunucuyla bağlantı yok" yazısı sayfanın görünmeyen bir yerine düşüyordu. Kırmızı tabela olarak stillendi.
3. **Sunucu yeniden başlayınca oyun donuk kalıyordu**, üstte sonsuza dek "yeniden deneniyor" yazıyordu (oda artık yok). Artık "Oda kapanmış… ana menüye dönmek için tıkla" çıkar.
4. **Uzun kesinti (≈40 sn üstü) kütüphanenin yeniden denemesini bitiriyordu**; oyuncu sayfayı yenilemek zorundaydı. Yeniden bağlanma 10 dakika boyunca 5 sn'de bir denenir, kale yerinde durur.
5. Duman testinde "maç sürerken oda görünümünde krallık yok" denetimi, maç bitişinin iki kez gönderilmesiyle ara sıra düşüyordu (hata değil, denetim); bitmiş durumlar dışarıda bırakıldı.

## 3. Bilinen / düzeltilmeyen

- SignalR, 32 KB'dan büyük mesajda bağlantıyı keser (bilinçli, koruma); normal oyuncu bu sınıra ulaşmaz.
- Aynı tarayıcıda ikinci sekme canlı maçın koltuğunu çalmaz ("Maç başladı, yeni oyuncu katılamaz" der); kullanıcıyı korumak için doğru, ama mesaj "bu maçta zaten oynuyorsun" demiyor.
- Oda sayısı / bağlantı başına istek sınırı yok (60 oda 160 ms'de açıldı). Halka açık barındırmada bellek için oda sınırı ve IP başına hız sınırı önerilir (aşağıda).
- Hata ayıklama katmanı uyarıları yalnız geliştirme derlemesinde ve düşük FPS'te (üretimde kapalı).
- Lobide "Boş yer 4" yazısı dar kutuda iki satıra bölünüyor (kozmetik).

## 4. Lisans ve yayın notları

- **Tiny Swords (Pixel Frog)**: itch sayfası: ticari ve kişisel projelerde kullanım serbest, değiştirmek serbest, atıf zorunlu değil (istenir); **"yeniden dağıtmak, satmak ya da paketini yeniden yapmak yasak"**. Oyunda kullanmak serbest; ama dosyalar oyunla birlikte sunulduğundan (tarayıcı indirir) repoya ve açık depoya konmaz (şu an böyle). Öneri: oyunda ve mağaza sayfasında "Tiny Swords by Pixel Frog" atfı (ayarlar → hakkında'da var mı kontrol edilmeli).
- **Ses**: Kenney (CC0), RandomMind (CC0), kaynaklar `client/public/audio/LICENSES.txt`.
- **Yazı tipleri**: Pixelify Sans ve Atkinson Hyperlegible Next, SIL OFL 1.1 (lisans metinleri `client/licenses/`).
- **Üretilmiş görseller** (Gemini ile üretilen krallık kaleleri, arayüz, orman, afiş): kullanılan aracın hizmet şartlarında ticari kullanıma izin verdiğinden emin ol; **Steam gibi mağazalar yapay zekâ kullanımının beyanını ister**.
- Sürüm numarası oyunda "Ayarlar → Hakkında"da görünüyor (0.1.0).

## 5. Barındırma (demo için)

- Şu anki yol: kendi bilgisayarında Production + `cloudflared` hızlı tünel. Sınırlar: bilgisayar açık olmalı, her açılışta yeni rastgele adres, tünel kesilirse tüm odalar (bellekte) kaybolur; oyuncu artık sebebini görür (madde 2.3).
- Bir demo için küçük bir VPS (1–2 vCPU) yeterli: sunucu tek süreç, oda başına hafif. Önerilen: sabit alan adı + Caddy/nginx (HTTPS, WebSocket), `publish/` klasörü, systemd.
- Halka açıkta eklenmesi gerekenler: IP başına oda ve bağlantı sınırı, hub komutlarına hız sınırı (şu an yalnız `/api/client-log` sınırlı), günlük döndürme (`logs/client-errors.log` büyür).
- Gizlilik: sunucu yalnız oda kodu, takma ad ve oyun durumunu bellekte tutar; istemci hata günlüğü adres/tarayıcı bilgisi içerir (IP yazılmaz). Mağaza/erken erişim için kısa bir gizlilik notu yeterli.

## 6. Oynayarak gözlemler

Bu bölüm ve eklenti önerileri tanıtım görüntüleriyle birlikte kullanıcıya özet olarak iletildi (aşağı bak).
