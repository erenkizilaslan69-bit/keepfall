# Yayın: itch.io (istemci) + Render (sunucu)

İki parça var: **istemci** (tarayıcı oyunu) itch.io'da, **sunucu** (C# ASP.NET Core + SignalR, `/hub`) Render'da çalışır. Sunucu Node değil .NET olduğu için Render'da **Docker** ile açılır (Render'ın .NET çalışma zamanı yok). Sunucuya istemci dosyaları girmez; yalnız `/hub`, `/api/*`, `/health`, `/ping` yanıtlar.

## 1. Render (sunucu)
1. Render → New + → **Web Service** → bu GitHub deposu. (Ya da **Blueprint**: kökteki `render.yaml` her şeyi doldurur.)
2. Ayarlar: **Language/Runtime: Docker**, **Root Directory: boş** (depo kökü), **Dockerfile Path: `./Dockerfile`**, **Build Command / Start Command: boş bırak** (Docker kendisi derler ve `dotnet Keepfall.Server.dll` ile başlatır), Instance Type: Free, **Health Check Path: `/health`**.
3. Ortam değişkeni gerekmez: `PORT`'u Render verir, sunucu onu dinler (`Program.cs`); ayar dosyası imajda `/app/config/balance.json`.
4. Açılınca adres `https://<ad>.onrender.com` olur. Deneme: `https://<ad>.onrender.com/ping` → `pong`.
5. **Uyku engeli**: cron-job.org (ya da UptimeRobot) ile `GET https://<ad>.onrender.com/ping` her 10 dakikada. Ücretsiz sunucu 15 dk istek gelmezse uyur; uyuyan sunucu odaları kaybeder (odalar bellektedir), uyanması ~1 dk sürer.

CORS her origin'e açık (`Program.cs`; çerez/parola yok, koltuk jetonu sayfanın kendi gönderdiği değer). WebSocket için ek ayar yok.

## 2. itch.io (istemci)
```bash
node tools/pack-itch.mjs https://<ad>.onrender.com
```
`client/dist-itch` derlenir (göreli yollar `./`, sunucu adresi koda gömülür) ve ana dizinde **`keepfall-itchio.zip`** oluşur (`index.html` kökte). itch.io → Upload → **Kind of project: HTML** → zip'i yükle → *This file will be played in the browser* → viewport **1280×720**, *Fullscreen button* açık. Adres `client/.env.itch` içindeki `VITE_SERVER_URL` ile de verilebilir (varsayılan yer tutucu).

## 3. Doğrulama araçları
- `tools/serve-dist.mjs`: harf duyarlı statik sunucu, oyunu `/html/12345/` alt yolunda sunar (itch.io gibi).
- `tools/itch-check.mjs`: başka origin'den (8099 → sunucu 5081) odaya girip maça başlar; başarısız istek / hata listeler.

## 4. Uyarılar
- **Tiny Swords (Free Pack)** dosyaları zip'in içindedir (oyun onlarsız çizilmez). Lisansı oyunun içinde kullanmaya izin verir ama dosyaların kendi başına dağıtılmasını yasaklar: zip'i yalnız itch.io'ya yükle, depoya **girmez** (`.gitignore`). Yayın öncesi paketin lisans sayfasını bir kez daha oku.
- Render ücretsiz: 512 MB RAM, ~0,1 CPU. 4 oyunculu maçta tick gecikebilir; ilk canlı testte izle. Aylık 750 saat tek servise yeter.
- Odalar bellekte: yeniden dağıtım ya da uyku odaları siler (istemci "oda kayboldu" bandı gösterir).
- itch.io iframe'inde adres çubuğu yoktur: oda kodu kullanılır (kod kutusu + Kopyala). Pano reddedilirse yedek yöntem var.
- Sunucu adresi `https` olmalı (itch.io sayfası https; `http`/`ws` karışık içerik olarak engellenir).
