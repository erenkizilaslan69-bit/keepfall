# Keepfall — Steam planı (2026-11-06)

Hedef: önce **ücretsiz Steam demosu**, sonra tam sürüm. Karar yetkisi bende (Eren: "patron sensin, takılırsan sor"); kullanıcıya yalnız hesap, para, yayın ve değiştirilemez kararlar sorulur. Her parça `dev` dalında, ayrı commit; sayılar (`balance.json`) onaysız değişmez.

## Neden bu sıra
Eleştirinin ana bulguları: (1) çok oyunculu oyun boş lobiyle çıkarsa ölür, (2) elenen oyuncu uzun süre seyrediyor, (3) "bir maç daha" döngüsü ve meta-ilerleme yok, (4) oyunun anlatı gücü (blöf, gizli kimlik) görünmüyor, (5) dengede açık konular (okçu, Zor bot, yeni sıra kuralı), (6) mağaza sayfası ve demo yok.

## Aşamalar

### A. Tek kişilik mod: "Meydan Okuma" (demonun omurgası) — YAPILDI 2026-11-06 (dev; ayrıntı `docs/meydan-okuma.md`)
- Durum: 8 meydan okuma + günlük, sunucu akışı, hedef/yıldız hesabı, istemci ekranları, testler hazır. Açık: yıldız eşikleri insanla ölçülmedi; kısa süreli bot vekil ölçümü ve Eren denemesi sonrası `config/challenges.json` ayarlanır.
- Sabit tohumlu maçlar: her biri tek bir fikri öğretir ve bir hedefi vardır (ör. "Gölge ile sahte orduyla rakibi oyalayıp kazan", "ilk 6 dakikada köy yağmala", "kıtlıktan önce kazan").
- Her meydan okumada 3 yıldız hedefi (kazan / süre / kayıp sınırı). İlerleme yerelde saklanır.
- Günlük meydan okuma: tarihten türeyen tohum, aynı rakip herkeste.
- Altyapı: mevcut `Room` + botlar + `SetGuided`; yeni bir "Challenge" tanımı (JSON, `config/challenges.json`) odayı bu ayarlarla kurar. Çok oyunculu kurallar değişmez.

### B. Elenme sonrası döngü — YAPILDI 2026-11-07 (dev; ajan yalnız tasarlandı)
- **Meydan Okuma**: oyuncu elenince sunucu `Room.FallGraceSeconds` (5 oyun sn, düşüşü görmek için) sonra kalan maçı hemen oynatıp bitirir (`Room.Tick` → `PlayOut`); sonuç ekranı 0 yıldız + "Tekrar dene / Sonraki / Meydan okumalar" kendiliğinden gelir. Yalnız tanımda 2+ bot varsa anlamlı (1 botta düşüş zaten maçı bitirir). Hız değişmez (sunucu hesabı, Production'da da aynı).
- **Botlu hızlı maç** (tek insan): düşer düşmez kart (`ui/game-ui.ts` `updateFinish`): "Maçı izle" (mevcut izleyici akışı) / "Yeni maç" (kalan maç sunucuda oynatılır, aynı bot düzeniyle yeni maç) / "Menü" (maç oynatılıp çıkılır, oda boşuna dönmez). Çok insanlı odada: "Maçı izle" / "Odadan çık" / "Yeni oda"; tüm insanlar elenmişse oda sahibi "Maçı bitir" de görür. Düşen oyuncu odadan çıkınca koltuğu bot olmaz, maç kalanlar için sürer (`Room.Leave`, değişmedi; test + duman denetler); çıkan, sonraki hiçbir mesajı almaz.
- Gizli bilgi kuralı değişmedi (elenen yalnız kendi düşüşünden sonra tam görünümü alır).
- **Ajan**: `docs/ajan-fikri.md` (kural, gizli bilgi, kötüye kullanım, botlar, ölçüm planı, açık sorular). KOD YOK; öneri şimdilik yapma, önce izleyici tahmini gibi güvenli alternatif.
- Testler: `FallFlowTests` (3), duman testi (elenmiş konuk çıkar, koltuk bot olmaz, meydan okuma kendiliğinden biter), `tools/shot-fall.mjs` (kart görüntüleri).

### C. İlerleme ve kozmetik — YAPILDI 2026-11-07 (dev; ayrıntı `docs/ilerleme.md`, liste `docs/basarimlar.md`)
- Durum: 30 başarım (22 sunucuda maç sonunda, 8 geçmişe bağlı istemcide), krallık ustalığı (1/5/15 galibiyet), kozmetik (flama II/III her krallık için + bronz/gümüş/altın avatar çerçevesi; denge etkisi yok), soyut `ProgressStore` (Aşama F'de Steamworks'e bağlanır), ana menüde "Başarımlar ve Ustalık" + maç sonu ilerleme bloğu, duman testi (geçersiz kimlik reddi, flama sızmaz).- Kozmetik: kale/flama/avatar açılımları (denge etkisi yok). Başarımlar (Steam Achievements için liste hazırlanır).
- Krallık ustalığı: her krallıkla N maç → flama/kale süsü.

### D. Anlatı: maç sonu özeti ve tekrar — YAPILDI 2026-11-07 (dev; ayrıntı `docs/kandirma-ozeti.md`)
- Maç sonunda "kim kimi kandırdı" zaman çizelgesi: sahte rapor, hayalet ordu, rüşvet, kılık değiştirme (gizli bilgi artık açık, maç bitti).
- Savaş oynatmasından kısa paylaşılabilir klip.

### E. Denge ve ilk deneyim — YAPILDI 2026-11-07 (öneriler onay bekliyor)
- Ölçüm ve öneriler: `docs/denge-sira-sonrasi.md` (ana öneri: `combat.meleeActiveRows: 2`, önce oynatma işi). Başlangıç modu kodlandı: `Room.SetStarter`/`StartChallenge(fullRules)`, `RoomView.Starter`, ayarlarda "Tam kurallarla oyna".
- Yeni 4 sıralı düzen sonrası okçu/deste/bot ölçümleri (`docs/` altında tablo), öneri sunulur, onayla uygulanır.
- İlk maçlar için "başlangıç" modu: krallık yetenekleri kapalı, daha az sistem.

### F. Steam paketleme (kullanıcı kararı gereken kısım)
- Masaüstü kabuğu (Electron veya Tauri) + Steamworks (başarımlar, bulut kayıt, zengin durum). Oyun şimdiki gibi sunucu ister; demo için **tek kişilik modun sunucusu istemciyle birlikte yerelde** çalışabilir (çevrimdışı demo).
- Mağaza sayfası: tek cümle "Her asker, kaybedilmiş bir işçidir.", 30–45 sn fragman, ekran görüntüleri, açıklama (TR/EN).
- Demo: A'dan 6–8 meydan okuma + hızlı oyna; Next Fest'e uygun.

## Sıra
A → B → E (paralel ölçümle) → D → C → F. Demo = A + B + E + F'nin çevrimdışı kısmı.

## Kullanıcıya sorulacaklar (yalnız bunlar)
1. Steamworks geliştirici hesabı ve 100 USD kayıt ücreti: kullanıcı açar/öder.
2. Fiyat (öneri 8–12 USD) ve demo/Erken Erişim tarihi.
3. Mağaza görselleri için kendi çizimi/Tiny Swords lisansı: **Tiny Swords Free Pack ticari kullanım ve yeniden dağıtım şartları kontrol edilmeli** (Steam'e girecek paketin içinde asset gönderilir). Bu risk çözülmeden Steam yayını yapılmaz.
