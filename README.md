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
- Gözcü gönderip rakibin askerlerini ve bina seviyelerini öğrenebilirsin; rapor yaklaşıktır (±%20, en az ±1). Gözcü dönünce üstte "Gözcün döndü" şeridi çıkar (tıklayınca rapor açılır); son rapor rakibin kalesinin altındaki tabelada (asker simgeleri, yaklaşık sayılar, "N dk önce") ve sol alttaki rapor etiketlerinde kalır.
- **Orman:** Haritanın ortasındaki orman dört çeyreğe bölünür; her köşe kendi çeyreğinde aynı sayıda ve türde yer alır (köşe başına 2 sandık, 1 köy, 1 haydut kampı; ortada büyük kamp). Yerleşim her maç rastgele ama adildir: her yuva için tek bir yol uzaklığı çekilir, her köşe aynısını kullanır (testle denetlenir). Yerler yoldan patikalarla ayrılır; **kimseye bildirilmez**, ancak bir gözcü o çeyreği keşfederse (ormana tıkla → "Bu bölgeyi keşfet"; kendi çeyreğin yakın, rakip çeyrekleri uzak, ortadaki büyük kamp her keşifte görünür) o oyuncuya gider ve haritada kalır. Başkası bir yeri boşaltırsa, onu tekrar canlı görene kadar eski haliyle görürsün.
  - **Sandık:** gözcü gider, altını alır ve eve dönünce kasaya girer (20–40 altın; ilk gelen alır).
  - **Köy:** en az 3 askerle savaşsız yağmalanır (altın + 2–4 kişi, ordu eve dönünce gelir); yağmalanınca yok olur.
  - **Haydut kampı:** görünür bir savaş (hazırlıkta da): kazanırsan altın ve hazır silahlar eve dönünce gelir, kaybedersen kamp kalan haydutlarla kalır. Ortadaki büyük kamp en zengin ödülü ve en güçlü haydutları taşır.
  - **Altın ve paralı asker:** kale penceresindeki "Kirala" sekmesinde altınla anında asker kiralanır (fiyatlar `balance.json` → `mercenary`); işçiden eksilmez, nüfusa sayılır, yemek yer ve bir daha işçi olamaz.
  - Hazırlık fazında orman akınları yapılabilir; kalelere saldırı yalnız savaşta, ve hazırlıkta farklı oyuncuların orduları yolda karşılaşmaz. Sayılar `config/balance.json` → `forest`.
- **Gözcü izi:** Gözcünün yürüdüğü yolun çevresi (gözcü görüşü kadar) geçtikten sonra `map.scoutTrailSeconds` (120 sn; 0 = maç sonuna kadar) canlı görüşte kalır, son 10 sn'de soluklaşarak kapanır; bu alandan geçen ordular, gözcüler ve savaşlar görünür. Rakibin kale bölgesinin içini açmaz: kalenin içi yalnızca raporla öğrenilir.

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
| `src/Keepfall.Views` | Oyuncuya gösterilen görünüm kayıtları ve onları oyundan üreten eşleyiciler (`ViewMapper`, `MapViewMapper`). Sunucu istemcilere, botlar kendi karar girdisi olarak bunu kullanır. |
| `src/Keepfall.Bots` | Botların beyni. Sadece oyuncuya gösterilen görünümleri (`Keepfall.Views`) ve herkese açık kuralları görür; `GameState`/`Room` tiplerine başvuramaz (`BotIsolationTests` derlemenin başvurduğu tipleri denetler). |
| `src/Keepfall.BotHost` | Botları odaya oturtur: her bota insanla aynı görünümleri verir, komutlarını `Room.Execute` ile çalıştırır. Sunucu ve simülatör aynı sınıfı kullanır. |
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
- **Atkinson Hyperlegible Next** — sayılar ve küçük açıklama yazıları için (Pixelify'da 2 rakamı 8'e, 5 rakamı S'ye benziyordu): Braille Institute / The Atkinson Hyperlegible Next Project Authors (https://github.com/googlefonts/atkinson-hyperlegible-next), SIL Open Font License 1.1. `@fontsource/atkinson-hyperlegible-next` paketi olarak gelir; lisans metni `client/licenses/AtkinsonHyperlegibleNext-OFL.txt`. Türkçe karakterlerin (ç ğ ı İ ö ş ü, büyük ve küçük) hepsini içerdiği glif tablosundan doğrulanmıştır. Başlıklar, ribbon'lar ve tabela adları Pixelify Sans'ta kalır; rakamları `ui.css` içindeki `Keepfall Digits` yazı tipi (`unicode-range`) bu yazı tipinden alır.

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

Production sunucusu `bin/Debug` yerine ayrı bir yayın klasöründen (`publish/`, git'e girmez) çalışır; böylece geliştirirken derlemek ve test koşmak çalışan oyunu kilitlemez. Depo kökünden:

```bash
npm --prefix client run build
dotnet publish src/Keepfall.Server -c Release -o publish
ASPNETCORE_ENVIRONMENT=Production dotnet publish/Keepfall.Server.dll --urls http://localhost:5080
```

PowerShell'de: `$env:ASPNETCORE_ENVIRONMENT = 'Production'` yazıp `dotnet publish/Keepfall.Server.dll --urls http://localhost:5080` çalıştır. Komutu **depo kökünden** çalıştır (sunucu `config/balance.json` ve `client/dist`'i oradan bulur). Açılışta yazılan "Hosting environment" satırı `Production` olmalı.

Yeni sürümü yayınlamak için sunucuyu durdur, `dotnet publish` komutunu yeniden çalıştır (çalışan sunucu `publish/` dosyalarını kilitler) ve tekrar başlat; derleme ve testler için durdurmak gerekmez.

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
- `bot`: arayüzsüz bot vs bot maçları (bkz. Botlar). `bot --izle` tek maçı dakika dakika gösterir.

## Botlar

Oda sahibi lobide boş koltuğa **Bot ekle** (Kolay / Orta) der; bot kendi rengi ve adıyla ("Bot Kırmızı") oturur, hep hazırdır. Oyunda üst şeritte, rakip kale penceresinde ve savaş raporlarında küçük bir bot ikonu görünür.

- **Aynı kapıdan girer.** Bot sunucuda çalışır ama sadece oyuncuların kullandığı komutları kullanır (`Room.Execute`). Girdisi, oyuncuya giden görünümlerin aynısıdır (`Keepfall.Views`): kendi kalesi, görüş alanı, gözcü ve savaş raporları. Sunucunun gerçek durumuna erişmez; bu yapıyla garanti edilir: `Keepfall.Bots` derlemesi `GameState`/`Room` tiplerine başvuramaz (`BotIsolationTests` derlemenin başvurduğu tipleri denetler) ve aynı görünümlerle farklı gizli durumda aynı komutları verdiği ayrıca test edilir.
- **Davranış** (`src/Keepfall.Bots`, modül modül): ekonomi (işçi dağılımı, büyüme, yemek), bina yükseltme (tarla, oduncu kampı, maden, demirhane), silah/asker üretimi (`bots.mix` karması), gözcülük ve rapora göre karşılık, orman (sandık, köy, kamp; savaş hesaplayıcısıyla kendi gücüne göre), paralı asker, saldırı (rapora göre en zayıf/en yakın rakip) ve savunma (silah kuşanma, dizilim, geri çağırma, gerekirse önünü kesme).
- **İnsan gibi tepki.** Botlar OYUN saniyesiyle çalışır (hız ×N olunca onlar da aynı oranda hızlanır). Kolay bot daha seyrek düşünür, olayları geç fark eder, bazen yanlış yapar (`bots` bölümündeki `mistake`, `slack`, süreler). Orta bot puana duyarlıdır (`scoreAware`): savaşın ilk saniyesinden cesurca saldırır, bu yüzden Orta vs Orta maçlarında saldırısız maç azdır; oyun kuralı (nüfus) değişmez. Kolay'ın ekonomisi iyidir, zayıflığı hızı (düşünme 7–12 sn) ve taktik hatalarıdır. Ölçümler: `docs/bot-deney-son.md`, `python tools/bot-deney.py`.
- **Tüm insanlar elenince** oda sahibine "İzlemeye devam" / "Maçı bitir" çıkar; "Maçı bitir" kalan süreyi sunucuda hızlıca oynatır (botlar aynı kurallarla devam eder) ve doğrudan maç sonu ekranını getirir.
- **Ayarlar** `config/balance.json` → `bots` (süreler, hata oranı, ordu karması ve payı). Simülasyon: `dotnet run --project src/BattleSim -c Release -- bot --mac 200 --zorluk karisik` ortalama nüfus, ordu büyüklüğü, maç süresi, kazananın stratejisi ve orman kullanımını yazar; ilk çıktılar `docs/bot-raporu.md`'de.

Ayar dosyası çalışma klasöründen yukarı doğru `config/balance.json` olarak aranır; `--config <yol>` ile başka bir dosya verilebilir. Sayıları değiştirmek için derlemeye gerek yok.

## Savaş kuralları

- Yakın birlikler, düşmanın ön sırası düşene kadar arka sıraya ulaşamaz. Okçular, öncelikli tür seçildiyse arka sıradaki o türü de vurabilir.
- Uzak birlikler (okçu) her sıradan vurur. Yakın birlikler sadece ön sıradan vurur; arkaya konan yakın birlik yedektir, ön sıra düşünce öne geçer.
- Savaş başında yakın dövüşçüler `approachTime` saniye hedefe ulaşamaz; bu sürede okçular serbest atış yapar.
- Hasar = birliğin hasarı × karşılık çarpanı. Bir adımdaki tüm vuruşlar aynı anda işlenir.
- Yakın dövüşçüler her zaman en öndekine vurur. Okçular varsayılan olarak da ön sıraya vurur; ordu başına öncelikli bir birlik türü seçilebilir (`--hedef-a okcu`).
- Kale savaşını saldıran kazanırsa kale hasarı = hayatta kalanların toplam DPS'i × 5 sn (okçular ×0,5), kalan canla sınırlı.
