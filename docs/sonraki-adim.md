--- Talimat: Gözcü değişiklikleri ---

1) Gözcü izi: Gözcünün yürüdüğü yolun çevresi (görüş yarıçapı kadar) canlı
   görüşe açılsın. Bu alanda geçen ordular, gözcüler ve savaşlar görünsün.
   - İz, gözcü geçtikten sonra scoutTrailSeconds kadar açık kalsın
     (balance.json, varsayılan 120; 0 = maç sonuna kadar), sonra
     soluklaşarak kapansın ve o alan tamamen eski sise dönsün.
   - İz rakibin kale bölgesinin içini açmasın (binalar, işçiler, avlu,
     yola çıkan ordular bölge içindeyken görünmesin). Kale içi sadece
     rapor ile öğrenilir.
   - Hepsi sunucuda hesaplansın, görüş dışı hiçbir şey istemciye gitmesin.
     Sayfa yenilenince süren izler geri gelsin. Duman testine ekle.

2) Gözcü raporu fark edilmiyor:
   - Gözcü dönünce üstte belirgin ribbon: "Gözcün döndü: [Renk]'in raporu",
     tıklayınca rapor penceresi açılsın.
   - Rakip kalenin haritadaki tabelasında son rapor kalıcı dursun: asker
     türleri ikonlarla ve yaklaşık sayılarla, "N dk önce" bilgisiyle.
   - Sol alttaki rapor etiketlerine gözcü raporları da eklensin (farklı ikonla).

Her parça bitince commit'le ve push et, sonra Production sunucusunu
yeniden başlat.
