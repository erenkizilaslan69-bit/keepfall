# Keepfall — Hazır prompt'lar (2026-11-05)

Devir notunda (docs/devir-notu.md) özetlenen iki işin Claude Code'a gönderilecek tam metinleri.
İkisi de henüz GÖNDERİLMEDİ. Önce Warfare'ı `client/public/assets/tiny-swords-warfare/`, varsa Tiny Swords yeni sürümünü `client/public/assets/tiny-swords-new/` altına koy ve yolları prompt'a yaz.

---

## 1. Görsel geçiş (öncelik 1)

```
Büyük görsel geçiş: tüm yapay zekâ görsellerini çıkarıp yalnız Pixel Frog
Tiny Swords varlıklarına geçiyoruz. dev dalında, main/Render'a dokunma.
Denge sayılarına dokunma. Her adım ayrı commit, önce/sonra ekran
görüntüsü (Tiny Swords içerenler repoya girmez).

Kaynaklar: client/public/assets/tiny-swords (Free Pack),
client/public/assets/tiny-swords-warfare (Warfare, renk varyantlı),
varsa client/public/assets/tiny-swords-new (güncel sürüm).
Lisans: ayrı dağıtım yok, yapay zekâ eğitiminde/araçlarında kullanma.

0) Envanter: oyundaki her görseli (kaynak, kullanım yeri) listele;
   docs/gorsel-envanter.md. Warfare ve yeni sürümün içeriğini çıkar.

1) Renk = oyuncu: kale, bina, birlik, bayrak renkleri oyuncu rengine göre
   (mavi/kırmızı/sarı/mor), siyah = haydut/tarafsız. Krallık kimliği
   rakiplere GÖSTERİLMESİN (gizli krallık kuralı); kendi kalende krallığa
   özel sancak/amblem (Tiny Swords kurdele/sancak parçalarıyla), arayüzde
   krallık kartı. Rakip krallığı yalnız mevcut kurallarla (gözcü,
   Kâhin) görünür olsun. Sunucuya ve gizli bilgi kurallarına dokunma.

2) Birlikler: 7 birliği eşle. Öneri: Okçu=Archer, Kılıçlı=Warrior (ya da
   Warfare ağır kılıçlı), Mızrakçı=Lancer, Keşiş=Monk (Free Pack);
   Kalkanlı=Warfare taç/kalkanlı birlik, Süvari=Warfare atlı mızraklı,
   Mancınık=Warfare kuşatma makinesi. Uymayanı listele, bana sor.

3) Kale içi zemin: surların içini Tiny Swords kum/toprak/taş zemini ile
   döşe, süs (kaya, fıçı, sandık, çit) ekle; dışarıdaki çimenden net
   ayrılsın. Dört kalede de aynı mantık.

4) Orman yerleri (köy, kamp, büyük kamp, sandık): Tiny Swords binaları
   ve siyah haydutlarla.

5) Arayüz: pencere/kart çerçeveleri, krallık amblemleri, düğmeler →
   Tiny Swords UI Elements (kâğıt, ahşap, kurdele, ikon). Lobi arka
   planını oyunun kendi sahnesiyle (canlı harita) kur. Logo: Pixelify yazı +
   Tiny Swords kurdele/kale parçalarıyla yeni logo taslağı (2 seçenek).

6) AI görsellerini önce bayrakla kapat, her şey yerine oturunca
   art/kingdoms, art/forest, art/ui, art/props, art/horse, mancinik vb.
   AI klasörlerini kaldır.

7) Test: ui-audit masaüstü, smoke (gizli bilgi), rehberli maç x1, mobil
   emülasyonda rehber; harita, kale içi, savaş, lobi, orman yerleri ve
   arayüzün önce/sonra temas sayfası. Devir notunu güncelle.
```

---

## 2. Hazırlık sıkıştırma (öncelik 2; görsel geçişle paralel olabilir)

```
Hazırlık aşamasını sıkıştırıyoruz: aynı kararlar, daha kısa süre. dev
dalında; main/Render'a dokunma. Bu bir DENGE değişikliği: hiçbir şeyi
main'e alma, sayıları ben onaylayacağım.

Amaç: hazırlık 8 dk yerine 4 veya 5 dk; hazırlık sonunda oyuncunun
ekonomisi ve ordusu bugünkü 8 dk sonundakiyle aynı seviyede (±%10).

1) Tek ayar: balance.json'a match.prepSeconds ve match.prepSpeed
   (çarpan; ör. 8/5 = 1.6) ekle. Hazırlık sırasında zamanla ilgili her
   şey bu çarpanla hızlansın: kaynak üretimi, nüfus artışı, bina
   yükseltme süreleri, silah üretimi, kuşanma süresi (armSeconds),
   paralı asker vb. Mevcut değerleri elle değiştirme; çarpanla uygula
   ki geri dönmek tek satır olsun.
   DOKUNMA: harita/ordu yürüme hızları, savaş aşaması ve süresi, kıtlık,
   savaş simülasyonu, gizli bilgi kuralları.
2) Hazırlığa bağlı süreleri oranla ölçekle: "son 60 sn gözcü yok" kuralı,
   rehberli maçın adım ipuçları ve zamanlamaları, botların hazırlık
   zamanlamaları (hangi dakikada ne yaptıkları), ipucu/uyarı zamanları.
   Bunları listele, neyi nasıl ölçeklediğini yaz.
3) Ölçüm (her biri için tablo, docs/hazirlik-sikistirma.md):
   - Mevcut (8 dk, çarpan 1) / 5 dk (1.6) / 4 dk (2.0).
   - Hazırlık sonunda ortalama: asker sayısı, silah, bina seviyeleri,
     kaynak stokları, nüfus (bot vs bot, her zorlukta en az 50 maç).
   - Bot kazanma oranları (Orta vs Kolay, Zor vs Orta) ve maç süreleri.
   - Yeni oyuncu için: rehberli maç x1 her iki ayarda baştan sona; oyuncu
     ilk savaşta elenmesin, rehber adımları yetişebilsin.
4) Oyuncu açısından: hazırlıkta "yapacak bir şey yok" anlarını ölç
   (insan oyuncu simülasyonunda boşta işçi süresi, bekleyen kuyruk yokken
   geçen süre); 8/5/4 dk için karşılaştır.
5) Varsayılanı 5 dk yap (dev dalında), 4 dk'yı ayarla denenebilir bırak.
   Kısa rapor + öneri: hangisi daha iyi, neyi ayarlamak gerekti.
```
