# Zor bot ölçümü

`python tools/bot-zor.py 300 docs/bot-zor-tablo.md 4 …` — 2 oyuncu, 15 dk, 300 maç, tohum 4; Zor ve Orta koltukları maçtan maça değişir. İlk sütun: **Zor'un koltuk başına kazanma payı** (hedef %75–85).
Ek tohumlarda (5, 6; 300 maç) şimdiki ayar: %78,2 ve %77,2. Tek bir sayının hata payı yaklaşık ±3 puan.

Okuma: asıl fark **silahı depoda tutmak** (kapatınca %50'ye düşer). Karşı birlik üretimi, erken yükseltme/sık gözcü ve fırsat kollama +-4 puan içinde, yani bu örneklemde gürültüden ayrılmıyor (fırsat kollama yalnız 3-4 oyunculu maçta devreye girer; 2 oyuncuda hiç fırsat yok).

| Deney | Değişiklik | Zor kazanma | Eleme ile biten | Saldırısız maç | Kale saldırısı/maç | Saldırı/koltuk | İlk saldırı | Paralı savaş başı | Paralı maç sonu | Altın/koltuk | Nüfus savaş başı | Nüfus maç sonu | Saldıranın kazanma oranı | Eşit olmayan maç |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Z0 | şimdiki Zor ayarı | %78,8 | %59,3 | %4,7 | 2,66 | 1,46 | 1,7 dk | %14,0 | %16,2 | 159 | 34,3 | 22,2 | %76,0 | 96 |
| Z1 | silah depoda tutma KAPALI | %50,3 | %38,7 | %20,3 | 2,32 | 1,21 | 1,1 dk | %19,8 | %14,7 | 156 | 36,6 | 23,4 | %82,0 | 153 |
| Z2 | karşı birlik üretimi KAPALI | %82,7 | %56,7 | %4,0 | 2,62 | 1,60 | 1,7 dk | %13,9 | %17,3 | 160 | 34,3 | 22,0 | %67,3 | 104 |
| Z3 | fırsat kollama KAPALI | %78,8 | %59,3 | %4,7 | 2,66 | 1,46 | 1,7 dk | %14,0 | %16,2 | 159 | 34,3 | 22,2 | %76,0 | 96 |
| Z4 | erken yükseltme + sık gözcü KAPALI | %79,5 | %58,7 | %3,0 | 2,64 | 1,58 | 1,6 dk | %13,4 | %17,4 | 161 | 33,8 | 22,0 | %71,0 | 112 |
| Z5 | yalnız hız (hepsi KAPALI) | %57,0 | %43,0 | %10,3 | 2,34 | 1,25 | 1,1 dk | %19,7 | %14,3 | 159 | 36,2 | 21,9 | %73,8 | 166 |
| Z8 | fırsat + sık gözcü KAPALI | %85,3 | %66,7 | %1,7 | 2,53 | 1,50 | 1,6 dk | %13,3 | %19,2 | 161 | 34,1 | 22,3 | %72,4 | 87 |
| N2 | silah sırası 6 | %79,5 | %62,3 | %5,3 | 2,47 | 1,68 | 1,7 dk | %13,8 | %17,0 | 160 | 34,2 | 22,5 | %68,9 | 98 |
| N3 | evde bırakma payı %15 | %80,0 | %60,7 | %4,3 | 2,63 | 1,79 | 1,6 dk | %14,0 | %16,7 | 158 | 34,3 | 21,6 | %75,7 | 103 |
