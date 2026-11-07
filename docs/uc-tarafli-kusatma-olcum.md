# Üç taraflı kuşatma: bot ölçümü (2026-11-07)

`BattleSim bot --mac 200 --oyuncu 4 --zorluk <kip>`; "önce" = geçici config'te `war.joinSiege=false` (eski bekleme), "sonra" = varsayılan (`true`). Ham çıktılar `docs/gece/uc-tarafli-bot-*.txt`. Hiçbir denge sayısı değişmedi.

| Kip | Önce | Sonra |
|---|---|---|
| karışık (Orta/Kolay) | Orta koltuk %35,0, Kolay %15,0 | Orta %34,8, Kolay %15,3 |
| orta | saldırgan koltuk %25,8, büyük ordu %26,7 | %25,8, %26,0 |
| zor-orta | saldırgan %26,0, büyük ordu %12,4 | %25,6, %14,0 |

Fark örnekleme hata payı içinde (200 maç). Botlar kapıda katılmayı kendiliğinden kullanıyor ama kazanma oranlarını oynatmıyor. Botlar "kime vurulsun" seçmez (varsayılan: önce kale). Duman testindeki iki saldıranın aynı anda varması bu koşuda gerçekleşmedi (katılım birim testleriyle doğrulandı: `SiegeJoinTests`).
