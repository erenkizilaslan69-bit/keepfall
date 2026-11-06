# Keepfall — Steam planı (2026-11-06)

Hedef: önce **ücretsiz Steam demosu**, sonra tam sürüm. Karar yetkisi bende (Eren: "patron sensin, takılırsan sor"); kullanıcıya yalnız hesap, para, yayın ve değiştirilemez kararlar sorulur. Her parça `dev` dalında, ayrı commit; sayılar (`balance.json`) onaysız değişmez.

## Neden bu sıra
Eleştirinin ana bulguları: (1) çok oyunculu oyun boş lobiyle çıkarsa ölür, (2) elenen oyuncu uzun süre seyrediyor, (3) "bir maç daha" döngüsü ve meta-ilerleme yok, (4) oyunun anlatı gücü (blöf, gizli kimlik) görünmüyor, (5) dengede açık konular (okçu, Zor bot, yeni sıra kuralı), (6) mağaza sayfası ve demo yok.

## Aşamalar

### A. Tek kişilik mod: "Meydan Okuma" (demonun omurgası)
- Sabit tohumlu maçlar: her biri tek bir fikri öğretir ve bir hedefi vardır (ör. "Gölge ile sahte orduyla rakibi oyalayıp kazan", "ilk 6 dakikada köy yağmala", "kıtlıktan önce kazan").
- Her meydan okumada 3 yıldız hedefi (kazan / süre / kayıp sınırı). İlerleme yerelde saklanır.
- Günlük meydan okuma: tarihten türeyen tohum, aynı rakip herkeste.
- Altyapı: mevcut `Room` + botlar + `SetGuided`; yeni bir "Challenge" tanımı (JSON, `config/challenges.json`) odayı bu ayarlarla kurar. Çok oyunculu kurallar değişmez.

### B. Elenme sonrası döngü
- Elenen oyuncu "Yeni maç" ve "izleyiciyi atla" seçeneği alır (bot maçında hemen yeni maç).
- Çok oyunculuda: elenen kısa bir **ajan** görevi (kalan oyunculardan birine sahte rapor/uyarı gönderme hakkı) denenecek; ölçülüp karar verilir.

### C. İlerleme ve kozmetik
- Kozmetik: kale/flama/avatar açılımları (denge etkisi yok). Başarımlar (Steam Achievements için liste hazırlanır).
- Krallık ustalığı: her krallıkla N maç → flama/kale süsü.

### D. Anlatı: maç sonu özeti ve tekrar
- Maç sonunda "kim kimi kandırdı" zaman çizelgesi: sahte rapor, hayalet ordu, rüşvet, kılık değiştirme (gizli bilgi artık açık, maç bitti).
- Savaş oynatmasından kısa paylaşılabilir klip.

### E. Denge ve ilk deneyim
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
