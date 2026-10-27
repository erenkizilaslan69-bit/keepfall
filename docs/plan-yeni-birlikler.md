# Plan: Keşiş, Mancınık, Süvari ve deste (kod yazılmadı, onay bekliyor)

## 1. Birim sayıları (ilk öneri; hepsi BattleSim ile kalibre edilecek)

Mevcut dört birim aynı kalır. Odun karşılığı: demir ≈ 1,25 odun.

| Birim | Can | Hasar / aralık | Sıra | Maliyet (demir/odun) | Yapım | Kişi | Paralı (altın) |
|---|---|---|---|---|---|---|---|
| Okçu | 70 | 11 / 1,2 sn | arka | 1 / 4 | 25 sn | 1 | 26 |
| Kılıçlı | 100 | 8,5 / 1,0 | ön | 3 / 2 | 30 | 1 | 29 |
| Mızrakçı | 90 | 11 / 1,2 | ön | 1 / 3 | 20 | 1 | 24 |
| Kalkanlı | 150 | 7 / 1,3 | ön | 2 / 3 | 35 | 1 | 33 |
| **Keşiş** | 60 | saldırmaz; her 1,5 sn'de en yaralı dostuna 7 can | arka | 1 / 4 | 30 | 1 | 28 |
| **Mancınık** | 50 | 16 / 3,0 sn, alan: asıl hedef tam, aynı sıradan 2 kişiye %50 | arka | 3 / 9 | 60 | **2** | 55 |
| **Süvari** | 110 | 10 / 1,0 | ön (bkz. §2) | 4 / 5 | 45 | 1 | 40 |

Mancınık "2 işçi kullanır" = nüfustan 2 kişi harcar (askere iki işçi çevrilir), demirhanede yapılır. Süvari harita hızı 3,0 karo/sn (ordu 1,5).

## 2. Savaş kuralları (simülatörde yeni olanlar)

- **Keşiş:** iyileştirme hedefi, "yakın" kavramı simülasyonda konum olmadığı için: kendi ordusunda canı oranca en düşük müttefik (kendisi hariç; ön sıra eşitlikte öncelikli). Okçuların öncelikli hedefi listesine keşiş ve mancınık da girer (mevcut `TargetPriority` mekanizması, yeni kod gerekmez).
- **Mancınık:** menzilli, savaşın ilk saniyesinden vurur (yaklaşma gecikmesi yok). Hedefi **her zaman düşmanın arka sırası** (varsa); arka sıra boşsa ön sıra. Alan hasarı yukarıdaki gibi. Çok zayıf yakın dövüş: ön sıra çökünce düşmanın yakın dövüşçüleri arka sıraya vurur; mancınığın cana 50 ve karşılık yeteneği yok.
- **Süvari:** önerim `flank` özelliği: arka sırada yaşayan okçu/mancınık/keşiş varken önce onlara vurur (ön sıranın üstünden), yoksa ön sıraya. Böylece "okçu ve mancınığı ezer" simülasyonda gerçekten oluyor (şu an yakın dövüş yalnız ön sıraya vurabiliyor).
- **Süvari baskını (harita):** ordu yalnız süvarilerden oluşuyorsa "baskın" olur. Kapıda savunan varsa normal savaş; süvari kazanırsa rakibin tarlaları yanar (yemek üretimi 60 sn ×0,5, yenisi süreyi tazeler, üst üste binmez), kale **düşmez**, ordu eve döner. Karışık ordudaki süvari normal asker (kale düşürmeye katkısı yok: kale yalnız hayatta kalan en az bir süvari-dışı asker varsa düşer). Karışık ordunun hızı en yavaş birimin hızıdır.

## 3. Karşılık matrisi (satır saldıran, sütun savunan; "=" 1,0, "+" 1,5, "−" 0,75)

| ↓ vurur / → yer | Okçu | Kılıçlı | Mızrakçı | Kalkanlı | Keşiş | Mancınık | Süvari |
|---|---|---|---|---|---|---|---|
| Okçu | = | + | = | 0,6 | + | = | 0,75 |
| Kılıçlı | − | = | + | = | + | + | = |
| Mızrakçı | = | − | = | + | = | = | **2,0** |
| Kalkanlı | = | = | − | = | = | = | = |
| Keşiş | – | – | – | – | – | – | – |
| Mancınık | 1,25 | = | = | = | 1,25 | = | 0,5 |
| Süvari | **2,0** | = | **0,5** | 0,75 | 1,5 | **2,0** | = |

Koyu = yeni temel kurallar (ezer / korkar). Mevcut 4x4 bölüm değişmedi. Eşitlik hedefi: hiçbir birim herkese karşı üstün olmasın.

## 4. Deste kuralları

- Her oyuncu maç başında 7 birimden **4** seçer: lobide hazır olmadan önce (zorunlu, süre sınırı yok; seçmeyen için rastgele deste atanır). Hazırlık başladıktan sonra değişmez.
- Seçilmeyen birim: demirhane kuyruğunda yok, kuşanılamaz, paralı asker olarak da kiralanamaz, saldırı/savunma pencerelerinde görünmez. Kaleye hiç birim "bedava" gelmez (ganimetteki silahlar, kamptan gelen silahlar yalnız desteye ait türlerdeyse depoya girer; değilse altına çevrilir: öneri, belirsiz nokta 4).
- **Gizlilik:** rakibin destesi yalnız gözcü raporunda görünür (rapora "Deste" satırı eklenir; duman testi diğer yolları denetler). Sunucuda tutulur, başkalarına gitmez; izleyici (elenen) tüm destelleri görür.
- **Botlar:** Kolay rastgele 4; Orta ve Zor, ölçümden çıkan "dengeli" desteler listesinden seçer (Zor rakibin destesini raporda görünce karşı birimlerin payını artırır).

## 5. Görsel denemeler (üstteki resim)

- **Keşiş:** paketin Monk'u (Idle, Run, Heal + yeşil Heal_Effect). Yeni çizim yok; heal karesi iyileştirme anında oynar.
- **Mancınık:** tamamen benim çizimim, Tiny Swords tarzı (1 px koyu lacivert dış çizgi, alt-sağda gölge, üst-solda ışık; takım rengi bez ve tekerlek göbeği). Yüklü ve atılmış iki kare var; atış animasyonu için ara kare eklenecek.
- **Süvari:** at benim çizimim, binici paketin Lancer'ı (Right_Attack karesi). Oyun ölçeğinde (1x) Warrior'ın yanında tutarlı duruyor; yakından bakınca at biraz düz (bacak ve boyun ayrıntısı az), binici at yanında büyük (paket zaten iri kafalı). **Karar senin:** kabul, ya da at için bir tur daha cila.
- **Lisans notu (CLAUDE.md kural 7):** Lancer pikselleri Free Pack'ten, yani süvari birleşik görüntüsü repoya giremez. Çözüm: at ve mancınık koddan çizilir (repoya girer), süvari istemcide yükleme sırasında at ile Lancer sayfalarından birleştirilir (hiçbir dosya yazılmaz). Takım rengi hepsinde parametre.

## 6. Ölçüm planı (BattleSim, kod yazıldıktan sonra)

1. **Birim eşit kişi:** 7 birimin her biri 10v10 ve 20v20, tüm çiftler (7x7 galibiyet matrisi) + her birimin ortalamasına karşı kazanma; hedef: hiçbir birim >%65 ya da <%35 ortalama kazanma değil, her birimin en az bir "zayıf olduğu" ve bir "güçlü olduğu" rakibi var (taş-kağıt-makas bozulmasın).
2. **Maliyet eşit orduları:** eşit odun karşılığı bütçeyle her birim çifti.
3. **Deste (35 kombinasyon):** hızlı süzgeç: her deste için bütçeyle en iyi karma ordu otomatik kurulur, 35x35 turnuva. Sonra elenenlerden geçenler için gerçek bot maçı (BotReport'a `--deste` eklenir), çift başına ≥40 maç. Hedef: hiçbir deste ortalama %58'in üstünde değil; en iyi 5 desteden hiçbir birim hepsinde ortak değil; her birim en az bir güçlü destede.
4. Sonuç tabloları `docs/yeni-birlikler-tablo.md`.

## 7. Uygulama sırası (her biri ayrı commit + push)

1. Çekirdek: 3 birim, matris, flank/mancınık/keşiş kuralları, config alanları, testler.
2. BattleSim 7x7 ölçüm; sayıları kalibre et (onayını isteyeceğim).
3. Deste: lobi/oda durumu, kuyruk ve kuşanma/paralı kısıtı, gözcü raporu, gizlilik testi.
4. Harita: süvari hızı, baskın, tarla yangını, kale düşürme kuralı, ordu hızı.
5. İstemci: lobi deste seçimi, kale/ordu pencereleri, savaş oynatması (heal efekti, mancınık atışı), süvari görseli, rehber.
6. Botlar: deste seçimi, keşiş/mancınık/süvari kullanımı, baskın.
7. Duman testi, bot ölçümü, Production.

## 8. Belirsiz noktalar (kararına bırakıyorum)

1. **Süvari ön sıradan arkaya vurur mu (flank)?** Önerim evet; hayırsa süvarinin "okçuyu ezmesi" sadece matristeki çarpanla kalır ve çoğu zaman ön sıraya vurur.
2. **Baskın tanımı:** yalnız süvariden oluşan ordu mu, yoksa karışık orduda "baskın" düğmesi mi? Önerim: yalnız süvari.
3. **Baskında savunan varsa** kapıda savaşır (süvari kaybedebilir). Alternatif: tarlalar savunmasız, savaşmadan yakar (çok güçlü).
4. **Desteye ait olmayan ganimet silahı** (kamp, köy): altına mı çevrilsin yoksa hiç gelmesin mi?
5. **Mancınık "2 işçi":** nüfustan 2 kişi harcar mı (önerim), yoksa silah üretiminde 2 demirci/işçi mi bağlar?
6. **Deste seçimi:** lobide mi (önerim) yoksa hazırlığın ilk 30 saniyesinde mi; seçmeyene rastgele mi atanır?
7. **Keşiş hedefi:** "en yaralı" otomatik (önerim). Seçilebilir olsun istersen UI maliyeti artar.
8. **Paralı asker** altın fiyatları yukarıdaki tahmin; mancınığı paralı kiralanabilir yapmak (2 kişi) garip olabilir.
9. **Eski 4 birimli maçlar:** varsayılan deste (Okçu, Kılıçlı, Mızrakçı, Kalkanlı) ile eski davranış korunur; `deck.enabled` kapalıysa herkes 7'sini üretir (testler ve geri dönüş için).
