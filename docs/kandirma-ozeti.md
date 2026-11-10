# Kim kimi kandırdı? (Steam planı Aşama D, 2026-11-07)

Maç sonu ekranında krallıkların hilelerinin zaman çizelgesi ve savaştan kısa klip.

## Günlük (sunucu)
- `GameState.DeceptionLog` (`Match/GameState.Deceptions.cs`): `DeceptionEvent(At, Kind, Actor, Target, As, Count, Detail)`; anahtarlar kale anahtarı, oyun saniyesi. En çok 600 kayıt. Yalnız **olan** yazılır; başarısız komut iz bırakmaz; nedensellik iddiası yok.
- Olaylar: sahte rapor hazırlandı / gözcü okudu / Kâhin yalan olduğunu gördü; hayalet ordu gönderildi / hedef kale gördü / kapıda dağıldı / yolda orduya rastlayıp dağıldı; Kâhin gelen hayaleti ya da kılıklı ordu gerçeğini gördü; rüşvet (kaç asker, kimin ordusu); kamp kiralandı / kiralık haydutlar kapıda savaştı (kale düştü/ayakta); başkası adına ulak gönderildi/ulaştı; başkası adına ordu gönderildi / savaştı; kimlik ortaya çıktı (süre doldu ya da gözcüyle).
- "Hayalet ordu X'i oyaladı" gibi iddialar bilerek YOK: sunucu hedefin tepkisini nedene bağlamaz, yalnız "gördü / kapıya varıp dağıldı" yazar.
- **Gizlilik**: `ViewMapper.ResultOf` günlüğü yalnız `Phase == Ended` iken `ResultView.Deceptions` olarak koyar; maç sürerken hiçbir oyuncuya, izleyiciye ya da bota gitmez (botlar yalnız Views kullanır; `BotIsolationTests` geçer). Başlangıç modunda (krallık yok) liste boş.
- Testler: `DeceptionLogTests` (6): olaylar doğru yazılıyor, başarısız hile iz bırakmıyor, `Result` öncesi görünümde yok, sonrasında var. Duman testi: maç sürerken oda/kale/harita/izleyici mesajlarında günlük izi yok, sonunda `result.deceptions` var.

## İstemci
- `ui/deceptions.ts`: olay → cümle (TR/EN, `en-guide.ts`), oyuncu renk şeridi + amblem, `EndScreen` sıralamanın altında kaydırılabilir "Kim kimi kandırdı?" bölümü. Krallıksız maçta bölüm yok; krallıklı ama hilesiz maçta "Bu maçta kimse hile yapmadı."
- Araç: `node tools/shot-deceptions.mjs <önek>` (örnek olaylarla çizelge ekran görüntüsü + MediaRecorder denetimi; Vite 5174 açık olmalı). Görüntüler `art/shots/kandirma/` (git'e girmez).

## Açık
- Klip gerçek maçta (WebGL canvas, GPU'lu Chrome) gözle denenmedi; başsız Chrome'da 2D canvas ile kaydın çalıştığı görüldü.
- Çizelge çok uzun maçlarda uzar (600 kayıt sınırı); gerekirse filtre/özet eklenir.
