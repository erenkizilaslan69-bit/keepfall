# Render ölçümü (2026-11-03)

Araç: `node tools/render-probe.mjs <adres> [maç=1] [saniye=60]` (kod değişmedi; HTTP /ping, SignalR gidiş-dönüş, sonra M eş zamanlı maç: her biri 1 insan koltuğu + 3 Orta bot, gerçek hız). Ölçen makine: Türkiye (İstanbul), ev bağlantısı.

## Gecikme (https://keepfall-server.onrender.com)
- Uç nokta Cloudflare **İstanbul** (`CF-RAY …-IST`): TCP bağlantısı ~35 ms. Sunucunun kendisi büyük olasılıkla Frankfurt (Render'ın Avrupa bölgesi): WebSocket gidiş-dönüşü **p50 ≈ 58 ms, p95 ≈ 80–100 ms**; HTTP /ping ≈ 72 ms. Bölge panelden doğrulanmalı (Render yanıtta bölge yazmıyor).
- SignalR bağlanma (negotiate + WebSocket): 350–550 ms. Taşıma WebSocket (uzun yoklamaya düşmüyor).
- Ölçüm sırasında sunucu uyanıktı. Uyuyan sunucuda ilk bağlantı ~1 dk sürer (docs/yayin-itch-render.md).

## Sunucu gücü (1 / 3 / 5 eş zamanlı 4 kişilik maç, hazırlık evresi, Render)
- Sunucu her tick'te 1 sn aralıkla CastleState/MapState yollar. Varış aralığı: p50 1000 ms, **p95 ≈ 1100 ms, en kötü 1,4 s** (1, 3 ve 5 maçta aynı): ağ titremesi, sunucu gecikmesi değil. 1,5 sn'yi aşan itme: 0.
- Yerelde aynı yük: 5 maç ≈ %3 çekirdek (hazırlık); ×20 hızda hazırlık+savaş 23 oyun dk ≈ %11 çekirdek, maç sayısından bağımsız. Render ücretsiz plan ~0,1 CPU: gerçek zamanlı 5 maç rahat, 10+ maçta tick gecikmesi görülebilir (ölçülmedi; savaş evresi Render'da denenmedi, çünkü hazırlık 8 dk sürüyor).

## İstemci
- Sunucu 1 Hz yollar, istemci aradaki 1 sn'yi doldurur (`scene/Movers.ts`): kendi ordumuz rota boyunca hız × geçen süre, başkaları yol çokgenleri boyunca; yeni tick'te en fazla 1,5 tick öteye gider, sonra düzeltmeye `dt*12` ile kayar (3 karodan büyük sapmada sıçrar). Yani hareket **tick'ler arasında yumuşatılıyor**; 1,1–1,4 sn'lik titreme görünür kesinti yapmıyor.
- Sayılar (yemek, işçi, silah) saniyede bir güncellenir: bu bir "takılma" gibi hissedilebilir ama sunucu gücüyle ilgisi yok.

## Sonuç
Sunucu gücü ve mesafe (58 ms) takılmanın sebebi gibi görünmüyor. Kalan adaylar: (1) arkadaşların makinesinde çizim hızı (Phaser/sis dokusu; FPS kendi makinelerinde ölçülmeli), (2) Render uykusu/uyanması, (3) itch.io çerçevesinde ölçeklenen tuval, (4) savaş evresinde Render CPU'su (ölçülmedi). Azure'a geçmek mesafeyi/CPU'yu iyileştirir ama (1) ve (3) için bir şey değiştirmez.

## Kapasite (savaş fazı, bir çekirdeğin %10'una kısılmış sunucu) — 2026-11-03
Yöntem: `powershell -ExecutionPolicy Bypass -File tools/capped-run.ps1 -Matches N` — sunucu ayrı bir klasöre yayınlanır, Windows job nesnesiyle **bir çekirdeğin %10'u** (Render ücretsiz planın ~0,1 CPU'su) sert sınırına konur; odalar hazırlığı ×20'de geçer, savaşa girince 15 sn daha ×20 (ordular yola çıksın), sonra **×1'de 90 sn ölçülür**, sınır savaş başında devreye girer. Her oda: 1 insan koltuğu + 3 Orta bot. İstemci tarafı: 1 sn'lik CastleState itmelerinin aralığı.

| Eş zamanlı maç | İtme aralığı p95 | en çok | >1,5 sn | Tick işi ort / p95 (kısılmış) | Bellek |
|---|---|---|---|---|---|
| 10 | 1015 ms | 1428 | 0/870 | 30–60 / 50–450 ms | ~105 MB |
| 15 (savaşın başı) | 1029 ms | 1542 | 5/1305 | 45–200 / 130–1000 ms | ~112 MB |
| 15 (savaş ortası) | 1016 ms | 1460 | 0/1084 | 35–40 / 47–58 ms | ~120 MB |
| 20 (savaş ortası) | **1160 ms** | 1556 | **8/1563** | 125–230 / 470–600 ms | ~118 MB |

- Bellek hiçbir yükte 130 MB'ı geçmedi (Render ücretsiz: 512 MB): sınır CPU.
- 15 oda 1 sn'lik ritmi koruyor; 20'de itme aralığı kaymaya başlıyor (p95 +160 ms, ara ara 1,5 sn). Bu yüzden `Keepfall:MaxRooms` = **15** (lobi ve maç dahil toplam oda). Sınırda "Oda kur" ve "Hızlı oyna" `Sunucu dolu, birazdan tekrar dene.` der (`tools/full-check.mjs`); var olan odaya katılmak çalışır.
- Sunucu dakikada bir loga yazar: `Load: N rooms (M in a match), P players connected; tick work avg/p95/max; tick lateness p95/max; memory`. Render Logs'ta "Load:" ara.
- Uyarı: job nesnesi sınırı Render'ın gerçek kısıtlamasının (paylaşımlı, değişken) birebir kopyası değil; gerçek sunucuda `Load:` satırları izlenmeli (tick işi p95 sürekli >500 ms ise `MaxRooms` indirilir, `Keepfall__MaxRooms` ortam değişkeniyle, yeniden derlemeden).
