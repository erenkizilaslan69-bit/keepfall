# Bot vs bot simülasyon raporları

İlk rapor (bot adımı 7/7). Komut: `dotnet run --project src/BattleSim -c Release -- bot <seçenekler>` (`BattleSim yardim` hepsini yazar).
Tohum 1. Süreler oyun saatidir; her maç bağımsız ve aynı tohumla aynı çıkar. Bu dosya bir anlık görüntüdür: ayarlar değişince komutu yeniden çalıştır.

Şu an bilinen durum ve üzerinde konuşulacak noktalar README'de ve sohbette; bu dosya sadece ham çıktıyı saklar.

## 2 oyuncu, Orta + Kolay karışık, 15 dk

```
Bot maçları: 200 maç · 2 oyuncu · 15 dk (10+5) · zorluk: karisik · tohum: 1

1. Sonuçlar
───────────
   Elemeyle biten: 195/200 (%97,5) · süre sonunda biten: 5
   Ortalama maç süresi: 11,9 dk (oyun saati)
   Hiç kale saldırısı olmayan maç: 0/200 (%0,0)

   Zorluk  Koltuk  Kazanma payı  Elenme  Ort. son nüfus
   ------  ------  ------------  ------  --------------
   Kolay      200          %0,0   %97,5            17,0
   Orta       200        %100,0    %0,0            49,5
   Kolay bot hiç kazanmadı.

2. Ekonomi ve ordu
──────────────────
   Zorluk  Nüfus savaş başı  Asker savaş başı  Zirve nüfus  Son nüfus  Son asker  En büyük saldırı ordusu  Ort. saldırı ordusu
   ------  ----------------  ----------------  -----------  ---------  ---------  -----------------------  -------------------
   Kolay               29,2              13,8         31,8       17,0        1,1                       17                 11,3
   Orta                49,1              37,3         51,7       49,5       41,7                       30                 19,4
   Nüfus/asker savaş başlarken (hazırlığın sonu), zirve ve maç sonu; askerler yoldakiler dahil.

3. Savaş
────────
   Zorluk  Kale saldırısı/maç  Pusu/maç  Ort. kale hasarı  Ölen asker  Öldürülen düşman  Savunma tepkisi/maç
   ------  ------------------  --------  ----------------  ----------  ----------------  -------------------
   Kolay                 0,91      0,00                 2        21,9               8,0                  0,4
   Orta                  1,20      0,02               496         8,9              45,8                  2,3
   Maç başına: kale savaşı 1,38 · yol savaşı 0,75

4. Orman
────────
   Zorluk  Kazanılan altın  Harcanan altın  Paralı asker  Köy yağması  Kamp saldırısı  Büyük kamp  Gözcü sandığı  Casusluk
   ------  ---------------  --------------  ------------  -----------  --------------  ----------  -------------  --------
   Kolay               111             101           3,8          0,6             1,2        0,16            3,9       1,7
   Orta                690             677          26,1          4,2             3,4        0,48           10,5       5,0
   Maç sonunda kullanılmış yerler: sandık %100,0 · köy %100,0 · küçük kamp %93,1 · büyük kamp %48,0
   Kamp savaşlarının kazanılma oranı: %92,8 (906 savaş)

5. Kazananın stratejisi
───────────────────────
   Strateji                             Koltuk  Kazanan  Kazanma oranı  Kazananlar içinde pay
   -----------------------------------  ------  -------  -------------  ---------------------
   ormancı (köy+kamp ≥ 4, altın ≥ 150)     201      200          %99,5                 %100,0
   paralı (≥ 6 kiralık)                    222      200          %90,1                 %100,0
   saldırgan (≥ 1 kale saldırısı)          371      199          %53,6                  %99,5
   savunmacı (hiç saldırmadı)               29        1           %3,4                   %0,5
   pusucu (≥ 1 pusu)                         3        3         %100,0                   %1,5
   büyük ordu (savaşa ≥ 15 asker)          326      200          %61,3                 %100,0
   Berabere biten maçta (süre sonunda en çok nüfus aynıysa) birden çok kazanan sayılır.

Özet
────
  Eşik dışında kalan bir şey yok.

Süre: 10,9 sn
```

## 2 oyuncu, Orta vs Orta, 15 dk

```
Bot maçları: 200 maç · 2 oyuncu · 15 dk (10+5) · zorluk: orta · tohum: 1

1. Sonuçlar
───────────
   Elemeyle biten: 33/200 (%16,5) · süre sonunda biten: 167
   Ortalama maç süresi: 14,7 dk (oyun saati)
   Hiç kale saldırısı olmayan maç: 121/200 (%60,5)

   Zorluk  Koltuk  Kazanma payı  Elenme  Ort. son nüfus
   ------  ------  ------------  ------  --------------
   Orta       400         %50,0    %8,3            34,3

2. Ekonomi ve ordu
──────────────────
   Zorluk  Nüfus savaş başı  Asker savaş başı  Zirve nüfus  Son nüfus  Son asker  En büyük saldırı ordusu  Ort. saldırı ordusu
   ------  ----------------  ----------------  -----------  ---------  ---------  -----------------------  -------------------
   Orta                39,0              25,5         40,8       34,3       22,2                       32                 16,4
   Nüfus/asker savaş başlarken (hazırlığın sonu), zirve ve maç sonu; askerler yoldakiler dahil.

3. Savaş
────────
   Zorluk  Kale saldırısı/maç  Pusu/maç  Ort. kale hasarı  Ölen asker  Öldürülen düşman  Savunma tepkisi/maç
   ------  ------------------  --------  ----------------  ----------  ----------------  -------------------
   Orta                  0,40      0,00                68        11,1              22,7                  1,4
   Maç başına: kale savaşı 0,72 · yol savaşı 0,11

4. Orman
────────
   Zorluk  Kazanılan altın  Harcanan altın  Paralı asker  Köy yağması  Kamp saldırısı  Büyük kamp  Gözcü sandığı  Casusluk
   ------  ---------------  --------------  ------------  -----------  --------------  ----------  -------------  --------
   Orta                364             353          13,7          2,7             2,7        0,08            6,3       6,1
   Maç sonunda kullanılmış yerler: sandık %100,0 · köy %100,0 · küçük kamp %98,3 · büyük kamp %15,0
   Kamp savaşlarının kazanılma oranı: %99,9 (817 savaş)

5. Kazananın stratejisi
───────────────────────
   Strateji                             Koltuk  Kazanan  Kazanma oranı  Kazananlar içinde pay
   -----------------------------------  ------  -------  -------------  ---------------------
   ormancı (köy+kamp ≥ 4, altın ≥ 150)     376      210          %55,9                  %96,8
   paralı (≥ 6 kiralık)                    399      217          %54,4                 %100,0
   saldırgan (≥ 1 kale saldırısı)          116       67          %57,8                  %30,9
   savunmacı (hiç saldırmadı)              284      150          %52,8                  %69,1
   pusucu (≥ 1 pusu)                         0        0              —                   %0,0
   büyük ordu (savaşa ≥ 15 asker)          400      217          %54,3                 %100,0
   Berabere biten maçta (süre sonunda en çok nüfus aynıysa) birden çok kazanan sayılır.

Özet
────
  ! Maçların %61'inde hiç kale saldırısı olmadı (botlar birbirine saldırmıyor).

Süre: 19,6 sn
```

## 2 oyuncu, Kolay vs Kolay, 15 dk

```
Bot maçları: 200 maç · 2 oyuncu · 15 dk (10+5) · zorluk: kolay · tohum: 1

1. Sonuçlar
───────────
   Elemeyle biten: 139/200 (%69,5) · süre sonunda biten: 61
   Ortalama maç süresi: 13,4 dk (oyun saati)
   Hiç kale saldırısı olmayan maç: 0/200 (%0,0)

   Zorluk  Koltuk  Kazanma payı  Elenme  Ort. son nüfus
   ------  ------  ------------  ------  --------------
   Kolay      400         %50,0   %34,8            24,3

2. Ekonomi ve ordu
──────────────────
   Zorluk  Nüfus savaş başı  Asker savaş başı  Zirve nüfus  Son nüfus  Son asker  En büyük saldırı ordusu  Ort. saldırı ordusu
   ------  ----------------  ----------------  -----------  ---------  ---------  -----------------------  -------------------
   Kolay               31,2              15,6         34,4       24,3        8,9                       20                  9,2
   Nüfus/asker savaş başlarken (hazırlığın sonu), zirve ve maç sonu; askerler yoldakiler dahil.

3. Savaş
────────
   Zorluk  Kale saldırısı/maç  Pusu/maç  Ort. kale hasarı  Ölen asker  Öldürülen düşman  Savunma tepkisi/maç
   ------  ------------------  --------  ----------------  ----------  ----------------  -------------------
   Kolay                 1,91      0,00               206        19,7              21,4                  0,3
   Maç başına: kale savaşı 2,32 · yol savaşı 1,39

4. Orman
────────
   Zorluk  Kazanılan altın  Harcanan altın  Paralı asker  Köy yağması  Kamp saldırısı  Büyük kamp  Gözcü sandığı  Casusluk
   ------  ---------------  --------------  ------------  -----------  --------------  ----------  -------------  --------
   Kolay               175             163           6,2          1,0             1,2        0,24            3,9       2,2
   Maç sonunda kullanılmış yerler: sandık %50,0 · köy %49,9 · küçük kamp %44,4 · büyük kamp %7,0
   Kamp savaşlarının kazanılma oranı: %69,4 (529 savaş)

5. Kazananın stratejisi
───────────────────────
   Strateji                             Koltuk  Kazanan  Kazanma oranı  Kazananlar içinde pay
   -----------------------------------  ------  -------  -------------  ---------------------
   ormancı (köy+kamp ≥ 4, altın ≥ 150)      28        9          %32,1                   %4,4
   paralı (≥ 6 kiralık)                    332      191          %57,5                  %93,6
   saldırgan (≥ 1 kale saldırısı)          382      204          %53,4                 %100,0
   savunmacı (hiç saldırmadı)               18        0           %0,0                   %0,0
   pusucu (≥ 1 pusu)                         0        0              —                   %0,0
   büyük ordu (savaşa ≥ 15 asker)          280      193          %68,9                  %94,6
   Berabere biten maçta (süre sonunda en çok nüfus aynıysa) birden çok kazanan sayılır.

Özet
────
  ! Kamp savaşlarının yalnızca %69,4 kazanılıyor.

Süre: 5,8 sn
```

## 3 oyuncu, karışık, 15 dk

```
Bot maçları: 150 maç · 3 oyuncu · 15 dk (10+5) · zorluk: karisik · tohum: 1

1. Sonuçlar
───────────
   Elemeyle biten: 98/150 (%65,3) · süre sonunda biten: 52
   Ortalama maç süresi: 13,9 dk (oyun saati)
   Hiç kale saldırısı olmayan maç: 0/150 (%0,0)

   Zorluk  Koltuk  Kazanma payı  Elenme  Ort. son nüfus
   ------  ------  ------------  ------  --------------
   Kolay      225          %2,0   %93,3            17,3
   Orta       225         %64,7   %14,7            32,0
   Orta bir koltuk başına kazanma oranı Kolay'ın 32,3 katı.

2. Ekonomi ve ordu
──────────────────
   Zorluk  Nüfus savaş başı  Asker savaş başı  Zirve nüfus  Son nüfus  Son asker  En büyük saldırı ordusu  Ort. saldırı ordusu
   ------  ----------------  ----------------  -----------  ---------  ---------  -----------------------  -------------------
   Kolay               29,2              13,6         31,9       17,3        1,3                       18                  8,9
   Orta                41,6              28,6         43,1       32,0       21,8                       33                 16,1
   Nüfus/asker savaş başlarken (hazırlığın sonu), zirve ve maç sonu; askerler yoldakiler dahil.

3. Savaş
────────
   Zorluk  Kale saldırısı/maç  Pusu/maç  Ort. kale hasarı  Ölen asker  Öldürülen düşman  Savunma tepkisi/maç
   ------  ------------------  --------  ----------------  ----------  ----------------  -------------------
   Kolay                 1,33      0,00                60        22,1               9,9                  0,5
   Orta                  1,97      0,01               520        17,4              42,9                  4,4
   Maç başına: kale savaşı 3,32 · yol savaşı 1,61

4. Orman
────────
   Zorluk  Kazanılan altın  Harcanan altın  Paralı asker  Köy yağması  Kamp saldırısı  Büyük kamp  Gözcü sandığı  Casusluk
   ------  ---------------  --------------  ------------  -----------  --------------  ----------  -------------  --------
   Kolay                98              87           3,3          0,4             1,1        0,18            3,4       4,2
   Orta                422             412          16,0          2,9             2,7        0,21            6,2      10,2
   Maç sonunda kullanılmış yerler: sandık %100,0 · köy %100,0 · küçük kamp %97,0 · büyük kamp %34,0
   Kamp savaşlarının kazanılma oranı: %91,3 (693 savaş)

5. Kazananın stratejisi
───────────────────────
   Strateji                             Koltuk  Kazanan  Kazanma oranı  Kazananlar içinde pay
   -----------------------------------  ------  -------  -------------  ---------------------
   ormancı (köy+kamp ≥ 4, altın ≥ 150)     204      144          %70,6                  %94,1
   paralı (≥ 6 kiralık)                    237      149          %62,9                  %97,4
   saldırgan (≥ 1 kale saldırısı)          422      153          %36,3                 %100,0
   savunmacı (hiç saldırmadı)               28        0           %0,0                   %0,0
   pusucu (≥ 1 pusu)                         2        1          %50,0                   %0,7
   büyük ordu (savaşa ≥ 15 asker)          370      151          %40,8                  %98,7
   Berabere biten maçta (süre sonunda en çok nüfus aynıysa) birden çok kazanan sayılır.

Özet
────
  Eşik dışında kalan bir şey yok.

Süre: 15,4 sn
```

## 4 oyuncu, Orta, 15 dk

```
Bot maçları: 100 maç · 4 oyuncu · 15 dk (10+5) · zorluk: orta · tohum: 1

1. Sonuçlar
───────────
   Elemeyle biten: 1/100 (%1,0) · süre sonunda biten: 99
   Ortalama maç süresi: 15,0 dk (oyun saati)
   Hiç kale saldırısı olmayan maç: 52/100 (%52,0)

   Zorluk  Koltuk  Kazanma payı  Elenme  Ort. son nüfus
   ------  ------  ------------  ------  --------------
   Orta       400         %25,0    %8,8            29,3

2. Ekonomi ve ordu
──────────────────
   Zorluk  Nüfus savaş başı  Asker savaş başı  Zirve nüfus  Son nüfus  Son asker  En büyük saldırı ordusu  Ort. saldırı ordusu
   ------  ----------------  ----------------  -----------  ---------  ---------  -----------------------  -------------------
   Orta                34,8              20,8         36,6       29,3       15,9                       24                 10,5
   Nüfus/asker savaş başlarken (hazırlığın sonu), zirve ve maç sonu; askerler yoldakiler dahil.

3. Savaş
────────
   Zorluk  Kale saldırısı/maç  Pusu/maç  Ort. kale hasarı  Ölen asker  Öldürülen düşman  Savunma tepkisi/maç
   ------  ------------------  --------  ----------------  ----------  ----------------  -------------------
   Orta                  0,86      0,01                84        10,8              16,6                  2,9
   Maç başına: kale savaşı 2,33 · yol savaşı 0,98

4. Orman
────────
   Zorluk  Kazanılan altın  Harcanan altın  Paralı asker  Köy yağması  Kamp saldırısı  Büyük kamp  Gözcü sandığı  Casusluk
   ------  ---------------  --------------  ------------  -----------  --------------  ----------  -------------  --------
   Orta                179             168           6,5          1,5             1,7        0,03            3,1      22,5
   Maç sonunda kullanılmış yerler: sandık %100,0 · köy %100,0 · küçük kamp %100,0 · büyük kamp %9,0
   Kamp savaşlarının kazanılma oranı: %99,8 (410 savaş)

5. Kazananın stratejisi
───────────────────────
   Strateji                             Koltuk  Kazanan  Kazanma oranı  Kazananlar içinde pay
   -----------------------------------  ------  -------  -------------  ---------------------
   ormancı (köy+kamp ≥ 4, altın ≥ 150)     113       38          %33,6                  %27,9
   paralı (≥ 6 kiralık)                    283      113          %39,9                  %83,1
   saldırgan (≥ 1 kale saldırısı)          178       47          %26,4                  %34,6
   savunmacı (hiç saldırmadı)              222       89          %40,1                  %65,4
   pusucu (≥ 1 pusu)                         4        0           %0,0                   %0,0
   büyük ordu (savaşa ≥ 15 asker)          399      136          %34,1                 %100,0
   Berabere biten maçta (süre sonunda en çok nüfus aynıysa) birden çok kazanan sayılır.

Özet
────
  ! Maçların %52'inde hiç kale saldırısı olmadı (botlar birbirine saldırmıyor).

Süre: 28,5 sn
```

## 2 oyuncu, Orta vs Orta, 30 dk

```
Bot maçları: 80 maç · 2 oyuncu · 30 dk (20+10) · zorluk: orta · tohum: 1

1. Sonuçlar
───────────
   Elemeyle biten: 21/80 (%26,3) · süre sonunda biten: 59
   Ortalama maç süresi: 28,2 dk (oyun saati)
   Hiç kale saldırısı olmayan maç: 47/80 (%58,8)

   Zorluk  Koltuk  Kazanma payı  Elenme  Ort. son nüfus
   ------  ------  ------------  ------  --------------
   Orta       160         %50,0   %13,1            40,3

2. Ekonomi ve ordu
──────────────────
   Zorluk  Nüfus savaş başı  Asker savaş başı  Zirve nüfus  Son nüfus  Son asker  En büyük saldırı ordusu  Ort. saldırı ordusu
   ------  ----------------  ----------------  -----------  ---------  ---------  -----------------------  -------------------
   Orta                48,0              36,3         48,8       40,3       28,6                       36                 23,6
   Nüfus/asker savaş başlarken (hazırlığın sonu), zirve ve maç sonu; askerler yoldakiler dahil.

3. Savaş
────────
   Zorluk  Kale saldırısı/maç  Pusu/maç  Ort. kale hasarı  Ölen asker  Öldürülen düşman  Savunma tepkisi/maç
   ------  ------------------  --------  ----------------  ----------  ----------------  -------------------
   Orta                  0,34      0,00                80        14,8              31,5                  1,2
   Maç başına: kale savaşı 0,65 · yol savaşı 0,00

4. Orman
────────
   Zorluk  Kazanılan altın  Harcanan altın  Paralı asker  Köy yağması  Kamp saldırısı  Büyük kamp  Gözcü sandığı  Casusluk
   ------  ---------------  --------------  ------------  -----------  --------------  ----------  -------------  --------
   Orta                479             468          18,1          2,6             3,1        0,68            6,2      10,0
   Maç sonunda kullanılmış yerler: sandık %100,0 · köy %100,0 · küçük kamp %100,0 · büyük kamp %100,0
   Kamp savaşlarının kazanılma oranı: %100,0 (400 savaş)

5. Kazananın stratejisi
───────────────────────
   Strateji                             Koltuk  Kazanan  Kazanma oranı  Kazananlar içinde pay
   -----------------------------------  ------  -------  -------------  ---------------------
   ormancı (köy+kamp ≥ 4, altın ≥ 150)     158       81          %51,3                 %100,0
   paralı (≥ 6 kiralık)                    159       81          %50,9                 %100,0
   saldırgan (≥ 1 kale saldırısı)           38       28          %73,7                  %34,6
   savunmacı (hiç saldırmadı)              122       53          %43,4                  %65,4
   pusucu (≥ 1 pusu)                         0        0              —                   %0,0
   büyük ordu (savaşa ≥ 15 asker)          160       81          %50,6                 %100,0
   Berabere biten maçta (süre sonunda en çok nüfus aynıysa) birden çok kazanan sayılır.

Özet
────
  ! Maçların %59'inde hiç kale saldırısı olmadı (botlar birbirine saldırmıyor).

Süre: 15,9 sn
```
