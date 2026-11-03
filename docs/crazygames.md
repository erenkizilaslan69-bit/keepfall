# CrazyGames yayını (2026-11-03)

Kaynak: docs.crazygames.com (requirements: technical, gameplay, multiplayer; SDK v3: intro, game, user). Sayfalar değişebilir; yüklemeden önce yeniden oku.

## Yapı
- `cd client && npm run build:crazy` ya da `node tools/pack-itch.mjs https://<sunucu> --crazy` → `keepfall-crazygames.zip` (git'e GİRMEZ: Tiny Swords dosyaları içerir). `client/.env.crazy`: `VITE_PLATFORM=crazygames` + sunucu adresi.
- Yalnız bu yapıda SDK yüklenir (`client/src/crazy.ts`, betik `https://sdk.crazygames.com/crazygames-sdk-v3.js`). SDK ortamı `disabled` (başka site) ya da betik yüklenemezse hiçbir şey olmaz; itch.io ve kendi sunucumuz eskisi gibi.
- Boyut (ölçüldü): 656 dosya (sınır 1500), 13 MB açık / 9 MB zip (sınır toplam 250 MB, ilk indirme 50 MB, mobil ana sayfa için 20 MB); yollar göreli.
- Yerel deneme: Vite'ı `VITE_PLATFORM=crazygames` ile aç, `node tools/crazy-check.mjs` (SDK `local` kipi: kullanıcı "User1", davet bağlantısı demo). Siteyi taklit etmek için sayfaya `?useLocalSdk=true`.

## SDK'nın kullanıldığı yerler
| Ne | Nerede |
|---|---|
| Kullanıcı adı (`user.getUser()`) | Ana ekranda ad kutusunda önerilir (kendi yazdığı ad önceliklidir) |
| Oda (`updateRoom`/`leftRoom`) | `main.ts onRoom`: lobide `isJoinable: true`, maç başlayınca `false`, menüye dönünce `leftRoom` |
| Davet (`inviteLink`, `getInviteParam('room')`, `addJoinRoomListener`) | Lobide "Bağlantıyı kopyala" SDK bağlantısını verir; sayfa davetle açılırsa odaya girer; oyundayken davet gelirse çıkıp katılır |
| Instant multiplayer (`isInstantMultiplayer`) | Doğrudan kendi özel odamız (lobi) açılır |
| `gameplayStart/Stop` | Maç ekranında başlar; lobi, maç sonu ve menüde durur |
| `loadingStart/Stop` | Açılışta |
| `settings.disableChat`, `muteAudio` | Chat kapalıysa ulak mesajı kutusu çıkmaz ve gelen mesaj gizlenir; ses kapalıysa oyun sessiz |
Reklam yok (Basic Implementation): para kazanma kapalı, harici reklam yok.

## Uyum notları
- **Doğrudan oyuna**: Ana ekranda "Hızlı oyna" (1 tık, 3 bota karşı).
- **İngilizce** var (TR/EN anahtarı; tarayıcı dili Türkçe değilse İngilizce açılır). Özel tam ekran düğmemiz yok. Menüde başka oyun/platform reklamı yok.
- **Sohbet denetimi**: ulak mesajı ve oyuncu adlarında küfür filtresi sunucuda (`envoy.profanityFilter` açık), ayarlarda "Ulak mesajlarını göster".
- **Okunabilirlik**: 800x450 (mobil) ve 1080x607 (tablet), devicePixelRatio 1'de arayüz denenmedi: yüklemeden önce bak. Dokunmatik denetim yok (fare/klavye); mobil için başvuruda "yalnız masaüstü" seç.
- **İçerik**: PEGI 12 sınırı (savaş var, kan yok). Lobi boyutu: 2-4 oyuncu.
- **Sunucu** CrazyGames'te yok, kendi sunucumuz (Render) gerekli (bkz. `olcum-render.md`).

## Riskler / sorulacaklar
1. **Tiny Swords (Free Pack) lisansı**: oyunda kullanıma izin verir, dosyaların ayrı dağıtımını yasaklar. CrazyGames kuralında lisans maddesi yok, yalnız "dağıtım hakkın olmalı" ve "özgün olmalı" (klon/asset-flip elenir). Build'de ham PNG'ler var; paketin lisans sayfası yüklemeden önce bir kez daha okunmalı, gerekirse yapımcıdan yazılı izin alınmalı. Sprite atlas'a birleştirmek dosyayı çıkarmayı zorlaştırır ama lisansı değiştirmez; dosya sayısı zaten sınırın altında olduğu için yapılmadı (animasyon/yükleme kodunun yarısını değiştirmek gerekir).
2. **Yapay zekâ içeriği**: CrazyGames dokümanında YZ'ye özel kural ya da beyan zorunluluğu bulunmadı. Krallık görselleri, arayüz çerçeveleri, süvari atı, mancınık Gemini ile üretildi (oyun içinde "Hakkında"da belirtiliyor). Başvuru formu sorarsa dürüstçe belirt.
3. **Render ücretsiz plan**: ilk ölçümde eş zamanlı 5 maçta tick gecikmesi yok; ama 15 dk boşta uyku (ilk bağlantı ~1 dk) ve CPU sınırı var. Yayından önce pinger (`/ping`) ya da ücretli plan.
