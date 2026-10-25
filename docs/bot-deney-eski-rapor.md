# Eski/eksik rapor ile saldırı (200 maç, gözcü hızı 1,8)

Değişiklik: `bots.staleReportSeconds` 120 → 180; rapor eskiyse ya da yoksa Orta bot son bildiğiyle (hiç yoksa kendi ordusunun %80'i kadar rakip sanarak) beklenen düşmanı `1 + blindMargin` kat büyük sayıp yine saldırabilir; savaşta gözcü aralığı 70 → 50 sn.

| Ayar | Orta kazanma | Eleme ile biten | Saldırısız maç | Saldırı/koltuk | İlk saldırı | Paralı (savaş başı) | Nüfus maç sonu |
|---|---|---|---|---|---|---|---|
| Önceki (Orta vs Orta) | — | %9,0 | %39,5 | 0,87 | 2,1 dk | %19,8 | 28,2 |
| Yeni, blindMargin 0,3 (Orta vs Orta) | — | %13,5 | %0,0 | 2,28 | 0,0 dk | %19,8 | 19,5 |
| blindMargin 0,6 | — | %14,5 | %0,0 | 2,24 | 0,1 dk | %19,8 | 19,5 |
| blindMargin 0,9 | — | %12,0 | %0,0 | 2,31 | 0,1 dk | %19,8 | 19,4 |
| Önceki (Orta vs Kolay) | %62,5 | %22,0 | %9,5 | 1,16 | 1,1 dk | %17,9 | 26,6 |
| Yeni, blindMargin 0,3 (Orta vs Kolay) | %64,0 | %26,5 | %1,5 | 1,67 | 0,3 dk | %17,9 | 25,0 |
