# Keepfall

2–4 kişilik, maç tabanlı bir kale strateji oyunu. Her oyuncunun tek bir kalesi var. **Hazırlık fazında** işçileri işlere dağıtır, silah üretir ve askerleri hazırlarsın; **savaş fazında** ordular haritada yürür, yolda ve kale kapısında çarpışır. Son ayakta kalan kale kazanır; süre dolarsa en yüksek nüfus kazanır.

Tarayıcıda oynanır. Tüm oyun mantığı sunucudadır; istemci yalnızca komut gönderir ve sunucunun gösterdiğini çizer.

## Oyun

**Maç**
- 15 dk modu: 10 dk hazırlık + 5 dk savaş. 30 dk modu: 20 dk hazırlık + 10 dk savaş (`config/balance.json`).
- Oda kurulur (`/oda/ABCD`), link arkadaşlara gönderilir, herkes "Hazırım" der, oda sahibi başlatır.

**Hazırlık: ekonomi**
- İşçileri çiftçi, oduncu, madenci ve demirci olarak çalıştırırsın; yemek, odun ve demir üretilir. İnsanlar yemek yer; yemek biterse tüm üretim yarıya iner.
- Binalar (tarla, oduncu kampı, maden, demirhane) 3 seviyedir; yükseltince kapasite ve üretim artar.
- Demirhane silah üretir; silah verilen işçi asker olur: okçu, kılıçlı, mızrakçı, kalkanlı.
- Nüfus otomatik büyür; her yeni kişi bir öncekinden pahalıdır ve yemek rezervi korunur.
- Gözcü gönderip rakibin askerlerini ve bina seviyelerini öğrenebilirsin; rapor yaklaşıktır (±%20, en az ±1).

**Savaş: harita**
- Ortak kare bir harita: kaleler köşelerde, ortada orman, aralarında yollar. Her köşeden komşulara ve çapraz köşeye olan yollar adil olacak şekilde kurulmuştur.
- Ordular ve gözcüler yollarda gerçekten yürür; yolculuk süresi mesafeye bağlıdır.
- **Savaş sisi:** Yalnızca kalenin, kendi ordularının ve gözcülerinin gördüğü yeri görürsün. Sis sunucu tarafındadır: görüş dışındaki hiçbir şey istemciye gönderilmez. Düşman ordusu kalenin görüşüne girince uyarı çıkar ve askerleri görünür.
- Yolda karşılaşan iki ordu (farklı oyunculara ait) durup savaşır. Yoldaki orduyu **geri çağırabilir** ya da ordu göndermek yerine **önünü kesme** emri verebilirsin.
- Savaşlar görünürdür ve gerçek zamanlı oynar: askerler karşı karşıya gelir, okçular ok atar, düşenler kayıttaki anda düşer. Kale savaşında savunanlar kapıya iner; saldıran kazanırsa kapıya vurur.
- Kale canı 500'dür; sıfırlanan oyuncu elenir ve izleyici olur: önce "izleme N sn sonra başlıyor" geçiş ekranını görür (`match.spectatorWaitSeconds`, varsayılan 5 oyun sn), sonra tüm haritayı canlı ve sissiz izler (her kalenin içi, bütün ordular, gözcüler ve savaşlar). İstenirse `match.spectatorDelaySeconds` ile gecikme eklenebilir (`config/balance.json`, varsayılan 0). Bu görünüm yalnızca elenen oyuncuya gönderilir; hâlâ oynayan kimse bunu alamaz (duman testi bunu denetler). Savaşın son %30'unda kıtlık başlar (yemek üretimi yarıya iner).

**Arayüz:** Oyun tam ekrandır, sayfa kaymaz; her şey haritanın üstünde Tiny Swords parçalarıyla (kağıt, ribbon, düğme, çubuk) çizilir.
- Üstte hep görünen şerit: yemek / odun / demir ve dakikalık artış, nüfus ve asker, boştaki işçi uyarısı, süre ve faz, kale canı, oyuncular (birine tıklayınca kamera o kaleye gider).
- Bir şeye tıklayınca yanında pencere açılır: **bina** (işçi ekle/çıkar, yükselt; demirhanede silah üretimi ve sıra), **kendi kalen** (asker verme, büyüme, savunma dizilişi), **rakip kale** (gözcü, son rapor, saldır / önünü kes), **kendi ordun ya da gözcün** (bilgi, geri çağır), **orman** (yakında). Esc, boş yere tıklamak ya da çarpı pencereyi kapatır.
- Bildirimler şeridin altında ribbon olarak çıkar; savaş raporları sol altta küçük etiketlerdir (tıklayınca ayrıntı). Sağ altta mini harita ve "Kaleme dön" düğmesi (boşluk tuşu da aynısı). Kamera: sürükle ya da WASD / oklar, tekerlekle yakınlaş.

**Gizli bilgi:** Oyuncu yalnızca kendi kalesini görür. Başkalarının kalesi yalnızca gözcü ve savaş raporlarıyla bilinir; savaş kaydı yalnızca savaşan iki tarafa gider.

## Yapı

| Yol | Ne |
| --- | --- |
| `config/balance.json` | Tüm denge sayıları: süreler, ekonomi, bina seviyeleri, harita hızları ve görüş, savaş, birlikler, karşılık matrisi. Kaynak: `docs/kale_oyunu_sayilar.xlsx`. |
| `src/Keepfall.Core` | Oyun mantığı: `Combat` (savaş simülatörü ve kaydı), `Economy` (kale), `Match` (maç, ordular, savaşlar), `World` (harita, yollar, görüş), `Lobby` (oda). |
| `src/Keepfall.Server` | ASP.NET Core + SignalR. Tick döngüsü ve gizli bilgi kuralı burada. |
| `src/BattleSim` | Konsol aracı: tek savaş ve denge raporu. |
| `client/` | Vite + TypeScript + Phaser istemcisi. |
| `tests/Keepfall.Core.Tests` | Birim testleri (ekonomi, savaş, harita, görüş, oda). |
| `tools/smoke-test.mjs` | Gizli bilgi duman testi. |

## Çalıştırma (geliştirme)

Gereken: .NET 10 SDK ve Node.js.

```bash
npm --prefix client install
dotnet run --project src/Keepfall.Server
npm --prefix client run dev
```

Son iki komut ayrı terminallerde çalışır. Sonra http://localhost:5173 adresini aç: "Oda kur" ile oda kurulur, linki (`/oda/ABCD`) diğer oyunculara gönder.

Geliştirme modunda:
- Oda sahibine ×5 / ×20 hız butonları çıkar ve tek kişiyle de maç başlatılabilir.
- Aynı tarayıcıda birden fazla oyuncu denemek için her sekme ayrı oyuncudur; `?oyuncu=N` sabit bir test kimliği seçer, örneğin `http://localhost:5173/oda/ABCD?oyuncu=2`.
- Konsolda `window.keepfallNet` (komut gönderir) ve `window.keepfallScene` (sahne) bulunur.

### Görseller (Tiny Swords)

İstemci [Pixel Frog](https://pixelfrog-assets.itch.io/tiny-swords)'ın **Tiny Swords Free Pack**'ini kullanır. Lisansı yeniden dağıtıma izin vermediği için repoda yok:

1. https://pixelfrog-assets.itch.io/tiny-swords adresinden **"Tiny Swords (Free Pack).zip"** dosyasını indir.
2. Zip'i `client/public/assets/tiny-swords/` içine aç. Sonuç: `client/public/assets/tiny-swords/Tiny Swords (Free Pack)/Units/...`
3. `client/public/assets/` git tarafından yok sayılır.

### Kaynaklar ve lisanslar

- **Tiny Swords (Free Pack)** — Pixel Frog. Görseller: https://pixelfrog-assets.itch.io/tiny-swords (yukarıdaki kuruluma bak; lisansı yeniden dağıtıma izin vermez, repoda yok).
- **Pixelify Sans** — arayüz yazı tipi, The Pixelify Sans Project Authors (https://github.com/eifetx/Pixelify-Sans), SIL Open Font License 1.1. `@fontsource/pixelify-sans` paketi olarak gelir; lisans metni `client/licenses/PixelifySans-OFL.txt`. Türkçe karakterlerin (ç ğ ı İ ö ş ü, büyük ve küçük) hepsini içerdiği glif tablosundan doğrulanmıştır.

### Testler

```bash
dotnet test
```

Gizli bilgi duman testi (geliştirme modunda çalışan sunucuya karşı; üç bağlantıyla kısa bir maç oynar, sisi ve savaş kaydının kime gittiğini kontrol eder):

```bash
node tools/smoke-test.mjs
```

## Arkadaşlarla oynama (tünel)

Arkadaşlar için tek bir adres yeter: sunucu, derlenmiş istemciyi ve oyun bağlantısını (`/hub`) aynı portta (5080) sunar. Tüneli **Vite'a (5173) değil, sunucuya (5080)** yönelt; Vite yabancı alan adlarını reddeder.

```bash
npm --prefix client run build
ASPNETCORE_ENVIRONMENT=Production dotnet run --project src/Keepfall.Server --no-launch-profile --urls http://localhost:5080
```

PowerShell'de: `$env:ASPNETCORE_ENVIRONMENT = 'Production'` yazıp `dotnet run --project src/Keepfall.Server --no-launch-profile --urls http://localhost:5080` çalıştır. `--no-launch-profile` şart: yoksa `dotnet run` kendi profilini kullanır ve sunucu yine `Development` açılır (açılışta yazılan "Hosting environment" satırından kontrol edebilirsin).

Sonra tüneli 5080'e aç. Hesapsız, geçici bir adres için Cloudflare Quick Tunnel:

```bash
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:5080
```

Çıkan `https://….trycloudflare.com` adresini aç, oda kur ve oda linkini (`…/oda/ABCD`) arkadaşlara gönder. (`ngrok http 5080` de olur.)

- İstemciyi her değiştirdiğinde `npm --prefix client run build` komutunu tekrar çalıştır; sunucu `client/dist`'i okur.
- `config/balance.json` sunucu açılırken okunur: değiştirince sunucuyu yeniden başlat. Odalar bellektedir, yeniden başlatınca kaybolur.
- `Production` modunda hız butonları ve tek kişiyle maç başlatma kapalıdır; maç en az 2 oyuncuyla başlar. Bunlar gerekirse sunucuyu `Development` ile çalıştır.
- Tünel adresi her açılışta değişir. Tüneli ya da sunucuyu kapatınca oyun da kapanır.

## BattleSim (denge aracı)

```bash
dotnet run --project src/BattleSim -c Release -- denge
dotnet run --project src/BattleSim -c Release -- denge --butce kaynak --mac 20000
dotnet run --project src/BattleSim -c Release -- savas "okcu:10,kalkanli:10" "kilicli:20" --hedef-b okcu
```

- `denge`: birlik tablosu, düellolar, rastgele turnuva, kompozisyon ligi, hedef seçiminin etkisi ve özet.
  `--butce kisi` (varsayılan) iki ordunun asker sayısını, `--butce kaynak` kaynak değerini eşitler.
- `savas`: iki ordu, savaş günlüğüyle. `--tekrar 500` ile kazanma oranı.
- `kontrol`: ayar dosyasını doğrular.

Ayar dosyası çalışma klasöründen yukarı doğru `config/balance.json` olarak aranır; `--config <yol>` ile başka bir dosya verilebilir. Sayıları değiştirmek için derlemeye gerek yok.

## Savaş kuralları

- Yakın birlikler, düşmanın ön sırası düşene kadar arka sıraya ulaşamaz. Okçular, öncelikli tür seçildiyse arka sıradaki o türü de vurabilir.
- Uzak birlikler (okçu) her sıradan vurur. Yakın birlikler sadece ön sıradan vurur; arkaya konan yakın birlik yedektir, ön sıra düşünce öne geçer.
- Savaş başında yakın dövüşçüler `approachTime` saniye hedefe ulaşamaz; bu sürede okçular serbest atış yapar.
- Hasar = birliğin hasarı × karşılık çarpanı. Bir adımdaki tüm vuruşlar aynı anda işlenir.
- Yakın dövüşçüler her zaman en öndekine vurur. Okçular varsayılan olarak da ön sıraya vurur; ordu başına öncelikli bir birlik türü seçilebilir (`--hedef-a okcu`).
- Kale savaşını saldıran kazanırsa kale hasarı = hayatta kalanların toplam DPS'i × 5 sn (okçular ×0,5), kalan canla sınırlı.
