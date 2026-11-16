# Keepfall: tasarım incelemesi ve öneriler (2026-11-16)

**Bakış açısı:** Steam'de satılacak, 2–4 kişilik bir arkadaş/parti oyunu; ana kanca gizli krallıklar ve blöf.
**Kaynaklar:** kod (istemci `client/src/ui`, `scene`; sunucu kuralları `Keepfall.Core`), son ekran turu `art/shots/tam-tur/2026-11-13` (82 ekran, TR+EN), tanıtım çekimindeki 9 bot maçı (`art/promo/director/2026-11-13*`, Standart ve Uzun, 4 oyuncu), BattleSim ölçüm notları (`CLAUDE.md`).
**Bu belge yalnız rapor:** kod değişmedi. Denge sayısı önerilmedi. Bir oyun kuralını değiştiren öneriler **[kural]**, gizli bilgi kuralına dokunanlar **[gizlilik]**, para gerektirenler (yeni varlık satın alma) **[maliyet]** ile işaretli; bunlar kullanıcı onayı ister.

İş büyüklüğü: **küçük** (yarım gün), **orta** (1–3 gün), **büyük** (bir hafta ve üstü).

---

## 1. İlk 10 dakika: yeni oyuncu neyi anlamıyor, nerede sıkılıyor?

**1.1 Kanca ilk maçlarda kapalı.**
- **Sorun:** Başlangıç modu (Hızlı oyna'nın ilk 3 maçı) krallıksız, klasik deste ve kilitli sıralarla oynanıyor. Steam sayfası ise "gizli krallıklar, sahte ordular" diye satıyor. Tek başına deneyen oyuncu ilk 30–45 dakikada oyunun asıl tadını görmüyor. Arkadaşlarla açılan odada ise tam kurallar ilk maçtan geliyor; bu da tam tersine fazla yük.
- **Öneri:** Başlangıç modunu kaldırmadan, 2. maçtan itibaren krallığı açmak. Tek krallık (ör. Gölge) ve tek yetenekle, "ilk hileni dene" görevi. Arkadaş odasında maç başı fermanına bir cümlelik "bu maçta deneyebileceğin bir hile" kartı.
- **Beklenen etki:** Kanca ilk oturumda görülür; Steam'deki "2 saat içinde iade" penceresinde oyunun vaadi kanıtlanır.
- **Büyüklük:** orta.
- **Risk:** Yeni oyuncu yine boğulabilir. Tek yetenekle sınırlamak bunu yumuşatır. Başlangıç modu kuralı **[kural]**.

**1.2 Hazırlığın ilk 1–2 dakikası boş geçiyor.**
- **Sorun:** Sis yüzünden rakiplerden hiçbir şey görünmüyor. Oyuncu yalnız kendi kalesinde sayı çeviriyor. Bot maçlarında da ilk görünür temas genelde savaş başında oluyor.
- **Öneri (gizliliği bozmadan):**
  - Ormandaki yerlerin "ilk gelen alır" doğasını vurgulamak: bir yer yağmalanınca haritada herkesin gördüğü bir bulut/ses ("ormanda bir sandık açıldı"); kimin açtığı söylenmez.
  - Görev takibine hazırlıkta erken bitecek iki küçük hedef ("ilk gözcünü gönder", "ilk ulağı yolla").
- **Beklenen etki:** İlk dakikada "dünyada başkaları da var" hissi; erken sosyal temas.
- **Büyüklük:** küçük–orta.
- **Risk:** Ormanda bir yerin boşaldığını herkese duyurmak yeni bir bilgi demektir **[gizlilik]**. Yalnız yerin adı/konumu duyurulmalı, kim olduğu asla.

**1.3 Ekonomi dili ağır.**
- **Sorun:** "Kuşanmak", "sıra", "deste", "hız ×2.00 · çarpan ×1" gibi kavramlar tek ekranda geliyor. Kale penceresi (30-kale-asker) "Hangi meslekten / Boşta (6)" seçiciyle başlıyor; yeni oyuncu neyi seçtiğini anlamıyor.
- **Öneri:**
  - Kale penceresinde varsayılan "Boştakilerden" yazısı, seçici gelişmiş ayar gibi küçültülsün.
  - Silah olmayan birimde +1 düğmesi gri durmak yerine "Demirhanede silah üret" kısa yoluna dönüşsün.
- **Beklenen etki:** Rehberin 3. ve 4. adımlarındaki takılma azalır.
- **Büyüklük:** küçük.
- **Risk:** düşük.

**1.4 Aynı uyarı iki yerde.**
- **Sorun:** "13 boşta!" hem üst şeritte hem avludaki çitin tabelasında (28-hazirlik-genel); kırmızı vurgu ikisinde de. Göz nereye bakacağını şaşırıyor.
- **Öneri:** Üst şeritteki uyarı kalsın; avludaki tabela yalnız sayıyı göstersin, kırmızı vurgu olmasın.
- **Büyüklük:** küçük.
- **Risk:** yok.

**1.5 Saldırı paneli bir form gibi.**
- **Sorun:** Rakip penceresindeki saldırı bölümü (52-rakip-saldiri) beş birim × (− sayı + ve sıra seçici) + emir + gönder. İlk savaşta oyuncunun istediği tek şey "hepsiyle saldır".
- **Öneri:** Üstte büyük tek düğme "Tüm orduyla saldır" (sıra ve emir varsayılan), ayrıntı "Ordu ayarla" altında katlansın.
- **Beklenen etki:** İlk saldırıya kadar geçen süre kısalır; parti ortamında "hadi saldır" anı hızlanır.
- **Büyüklük:** küçük–orta.
- **Risk:** Deneyimli oyuncu için bir tık fazla; katlanan bölüm açık kalırsa hatırlansın.

---

## 2. Arayüz ve okunurluk

**2.1 Ana düğmelerin yazısı çok küçük.**
- **Sorun:** Maç sonu "Aynı oyuncularla yeni maç / Lobiye dön" (73) ve lobideki "Ana menüye dön / Maçı başlat" (11) düğmeleri büyük ama yazıları ~12 px. Ekranın en önemli düğmeleri en zor okunanlar.
- **Öneri:** Birincil düğmelerde yazı tabanı (menü düğmeleri gibi) en az 18–20 px; "Maçı başlat" lobide yeşil ve sağ altta.
- **Büyüklük:** küçük.
- **Risk:** Uzun dillerde (de, ru) taşma; lang-audit ile denetlenir.

**2.2 "Kim kimi kandırdı" kaydırmanın altında kalıyor.**
- **Sorun:** Oyunun en sosyal anı maç sonu ekranında sıralamanın altında, küçük bir kaydırma kutusunda (75). Oyuncular çoğu zaman görmeden lobiye dönüyor.
- **Öneri:** Bkz. 3.1: ayrı bir "açılış" ekranı.
- **Büyüklük:** orta.

**2.3 Gözcü raporu yoğun.**
- **Sorun:** Gözcü raporu (53) "±%20", "yaklaşık", "≈1", "0" satırlarını bir arada veriyor. "Deste: … Süvari 0" iki satıra bölünüyor; "işçi, kaynak ve silah deposu görünmez" uyarısı her raporda tekrar ediliyor.
- **Öneri:**
  - Raporun başına tek cümlelik bir hüküm: "Bot Kırmızı zayıf görünüyor (≈2 asker)".
  - Sayılar simgelerle; açıklama yalnız ilk raporda ya da "?" içinde.
- **Büyüklük:** küçük.
- **Risk:** Hüküm cümlesi sahte rapora da uyar (Gölge); bu iyi bir şey: blöf daha çok işe yarar.

**2.4 Görev takibi ve bazı HUD yazıları küçük.**
- **Sorun:** Görev kutusu (sol üst) 12 px tabanında, gri; okunmuyor.
- **Öneri:** Görevler 14 px, tamamlanınca yeşil tik + küçük ses.
- **Büyüklük:** küçük.

**2.5 Geliştirme düğmeleri.**
- **Sorun:** ×1 / ×5 / ×20 düğmeleri ekran turunda görünüyor (dev yapısı).
- **Öneri:** Steam paketinde görünmediğini `steam-check`e bir madde olarak ekle (şu an yalnız tanı kutusu denetleniyor).
- **Büyüklük:** küçük.

**2.6 Vuruş parlaması beyaz kare gibi.**
- **Sorun:** Kapı savaşı görüntüsünde (66) askerlerin üstünde beyaz kareler var. Başsız Chrome'un yazılım GL'inde `flash()` (ADD karışımı) kare çiziliyor olabilir.
- **Öneri:** Gerçek GPU'lu pencerede ve düşük grafik ayarında kontrol et. Kare görünüyorsa dokunun kenarı yumuşatılsın ya da yazılım GL'de efekt kapansın.
- **Büyüklük:** küçük.
- **Risk:** yok.

**2.7 Ekranda gereksiz kalabalık.**
- **Sorun:** Hazırlıkta sağda 5 büyük düğme (Kaleme dön + 3 rakip + Orman), üstte 4 rakip simgesi, sağ altta mini harita: rakip listesi iki kez var.
- **Öneri:** Sağdaki rakip düğmeleri üst şeritteki simgelerle birleşsin (tıklayınca aynı pencere). Sağda yalnız "Kaleme dön" ve "Orman" kalsın.
- **Büyüklük:** orta.
- **Risk:** Alışmış oyuncu yer değiştirmeyi sevmez; ilk sürüm öncesi yapılmalı.

**2.8 Eksik olan: ordu yolda iken ne kadar kaldı?**
- **Sorun:** Kendi ordumun hedefe varmasına kaç saniye kaldığı ve gelen düşman ordusunun kapıya varış süresi yalnız pencere açınca görülüyor.
- **Öneri:** Haritada yürüyen ordunun üstünde küçük bir süre etiketi (kendi orduların için; düşman için yalnız görüş alanındaysa).
- **Büyüklük:** küçük.
- **Risk:** Düşman ordusu için **[gizlilik]**: yalnız istemcinin zaten gördüğü konum ve hızdan hesaplanmalı, sunucudan yeni bilgi gitmemeli.

---

## 3. Oynanış: blöf ve sosyal anları artıracak fikirler, ölü anlar

**3.1 Maç sonu "açılış" sinematiği (en önemli öneri).**
- **Sorun:** Gizli krallıklar maç sonunda tek listede, sırasız açılıyor; "aha!" anı yok.
- **Öneri:** Maç biter bitmez herkesin ekranında sırayla oyuncu kartları açılır:
  1. Krallık amblemi döner.
  2. "Aslan: Gölge Krallığı".
  3. Altında o oyuncunun en iyi iki hilesi ("Bora'ya 12 kişilik hayalet ordu yolladı; Bora 2 dakika savundu").
  4. En sonda "En büyük yalancı", "En çok kandırılan" ve "Hiç kanmayan" ödülleri.

  Her kart 3–4 sn, atlanabilir. Veri hazır: `ResultView.Deceptions`.
- **Beklenen etki:** Parti oyununun klip anı. Yayıncılar ve arkadaş grupları için paylaşılabilir ekran.
- **Büyüklük:** orta.
- **Risk:** "Kandırma" iddiaları nedensellik içermesin (sunucu bilerek yazmıyor). Ödüller yalnız sayılarla (kaç hile, kaç okunan sahte rapor) verilsin.

**3.2 Krallık tahmini.**
- **Sorun:** Oyuncu rakibin krallığını tahmin ediyor ama bunu hiçbir yere yazmıyor; maç sonunda "biliyordum!" anı ölçülemiyor.
- **Öneri:** Rakip penceresine dört amblemli bir "tahminim" işaretçisi (yalnız kendi ekranında). Maç sonunda doğru tahminler açılış ekranında gösterilsin ("Cem 3 krallığın 3'ünü bildi").
- **Beklenen etki:** Sosyal çıkarım oyunlaştırılır; sessiz oyuncu bile blöfe katılır.
- **Büyüklük:** orta.
- **Risk:** Tahmin istemcide kalır, sunucuya yalnız maç sonunda gider (ya da hiç gitmez, yalnız yerel gösterim) **[gizlilik]**. Ödül XP'si eklenecekse sayısı kullanıcıya sorulmalı.

**3.3 Ulak için hızlı mesajlar.**
- **Sorun:** Ulak mesajı serbest metin (140 karakter). Parti ortamında yazmak yavaş; çoğu oyuncu ulağı hiç kullanmıyor (botlar da kullanmıyor).
- **Öneri:** Hazır 8–10 mesaj ("Barış?", "Ortak düşman: Kırmızı", "Sana saldırmayacağım", "Ordum yolda…") + serbest metin. Hazır mesajlar 15 dilde, alıcının dilinde görünür.
- **Beklenen etki:** Daha çok ulak, daha çok yalan. Dil bilmeyen yabancı arkadaşlar da konuşur.
- **Büyüklük:** küçük–orta.
- **Risk:** Küfür filtresi hazır mesajlarda gereksiz; serbest metin olduğu gibi kalır.

**3.4 Elenen oyuncu için "hayalet fısıltı".**
- **Sorun:** Erken elenen oyuncu 10 dakikaya kadar yalnız izliyor; parti ortamında en sıkılan kişi o.
- **Öneri:** Elenen oyuncu maçta bir kez, adı gizli tek bir ulak mesajı gönderebilsin (yük yok). Ya da izleyicilerin "kim kazanır" tahmini maç sonunda gösterilsin.
- **Beklenen etki:** Elenen oyuncu oyunda kalır, intikam ve kaos anı doğar.
- **Büyüklük:** orta.
- **Risk:** Fısıltı, izleyicinin gördüğü tüm haritayı canlı oyunculara sızdırabilir **[kural] [gizlilik]**. Bu yüzden yalnız sabit hazır mesajlarla sınırlanabilir; tahmin seçeneği risksiz.

**3.5 Savaşta yürüyüşün ölü anları.**
- **Sorun:** Bot maçlarında ordular kapıya 30–60 sn yürüyor; bu sırada savunan çoğu zaman yalnız bekliyor.
- **Öneri:**
  - Görülen düşman ordusu için "kapıya varış" geri sayımı ve sesli uyarı (2.8 ile birlikte).
  - Savunanın son saniyelerde yapabileceği "acil kuşan" önerisi (hint).
- **Beklenen etki:** Gerilim; "yetişecek mi?" anı.
- **Büyüklük:** küçük.
- **Risk:** düşük.

**3.6 Gölge'nin hayalet ordusu az kullanılıyor.**
- **Sorun:** Ölçümde maç başına 0,16 kullanım; Gölge %39,8 ile en zayıf krallık. Oyunun en "blöf" yeteneği en az görülen yetenek.
- **Öneri:**
  - Ferman ve krallık panelinde "ilk hayaletini yolla" görevi.
  - Hayaletin rakip ekranında nasıl göründüğünü gösteren küçük önizleme ("Rakip bunu görecek").
  - Sayılara dokunmadan önce kullanım oranını ölç.
- **Beklenen etki:** Hile sayısı artar; açılış ekranında anlatacak hikâye çoğalır.
- **Büyüklük:** küçük.
- **Risk:** Yok (sayı değişmiyor).

**3.7 Süre dolunca kazanma kuralı görünmüyor.**
- **Sorun:** Maçların bir kısmı süre dolunca nüfusla bitiyor; oyuncu son dakikalarda kimin önde olduğunu bilmiyor.
- **Öneri:** Son 2 dakikada üst şeritte kendi sıranı göster ("Nüfusta 2. sıradasın"). Yalnız sıra; rakibin sayısı değil.
- **Büyüklük:** küçük.
- **Risk:** Sıra da bir bilgidir **[gizlilik]**. Onay gerekir; alternatif olarak yalnız "önde / geride" göstergesi.

---

## 4. Görsel his ve "juice"

**4.1 Kale düşüşü yeterince büyük değil.**
- **Sorun:** Kale düşüşü kendi ekranında sarsıntı ve kırmızı vurgu, komşuda küçük sarsıntı. Parti oyununda bir oyuncunun elendiği an herkesin anı olmalı.
- **Öneri:** Herkesin ekranında 1–1,5 sn'lik ağır çekim + ekranın ortasında "KIRMIZI'NIN KALESİ DÜŞTÜ" şeridi + derin bir gong/çöküş sesi. Düşen oyuncunun ekranında yıkıntıya yavaş zum.
- **Büyüklük:** küçük–orta.
- **Risk:** Kalenin düştüğünü herkese duyurmak **[gizlilik]**. Şu an uzaktaki düşüş görülmüyorsa yalnız "bir kale düştü" denebilir, kimin olduğu canlı görüşe bağlı kalır.

**4.2 Ses katmanı ince.**
- **Sorun:** Kaynak artışı, sıra ilerleyişi, silah bitişi, gözcünün dönüşü, ulağın gelişi gibi olaylarda ses ya yok ya tek bir arayüz tıkı.
- **Öneri:** Her olay için ayırt edilebilir kısa sesler: silah bitti (örs), asker kuşandı (zırh şıkırtısı), gözcü döndü (kuş), ulak geldi (zil, var), hayalet dağıldı (fısıltı).
- **Büyüklük:** küçük (Kenney/CC0 paketlerinden).
- **Risk:** yok. Yeni ücretli ses paketi gerekirse **[maliyet]**.

**4.3 Düğme ve sayı geri bildirimi.**
- **Sorun:** "+1" basınca yalnız sayı değişiyor.
- **Öneri:** Kuyruğa eklenen silah için küçük bir "uçan simge" (düğmeden satıra); kaynak harcanınca üst şeritte kısa kırmızı "−N".
- **Büyüklük:** küçük.
- **Risk:** "Efektleri azalt" ile kapanmalı.

**4.4 Krallıkların sesi ve rengi yok.**
- **Sorun:** Krallıklar yalnız kale ve bina görselinden ayırt ediliyor (kullanıcı kararı: aksesuar yok).
- **Öneri (karara uyarak):** Ferman açılırken her krallığa 2 sn'lik kendi müzik motifi; krallık panelinin çerçeve rengi.
- **Büyüklük:** küçük (kod).
- **Risk:** Motif bulmak **[maliyet]** olabilir (lisanslı kısa ses).

**4.5 Yükleme ve geçişler.**
- **Durum:** Bu turda yükleme ekranı eklendi (logo, çayır, gerçek ilerleme, ipuçları).
- **Öneri:** Lobiden maça bulut perdesi var; menü ↔ lobi ↔ meydan okuma geçişleri de aynı yumuşaklıkta mı, kontrol edilsin ve gerekirse aynı perde (ya da kısa solma) kullanılsın.
- **Büyüklük:** küçük.

---

## 5. Tekrar oynanabilirlik

**5.1 Tek harita.**
- **Sorun:** Her maç aynı dört köşe + orta orman düzeni; süsler tohumla değişiyor ama yollar ve yerler aynı.
- **Öneri:** 2–3 harita düzeni (ör. nehirli, iki köprülü; uzun koridorlu 2 kişilik).
- **Beklenen etki:** "Bu haritada ne yapılır" keşfi geri gelir.
- **Büyüklük:** büyük.
- **Risk:** Denge yeniden ölçülmeli **[kural]**.

**5.2 Parti kural kartları.**
- **Sorun:** Arkadaş grubu 3–4 maçtan sonra aynı stratejiye oturuyor.
- **Öneri:** Lobide isteğe bağlı tek "maç kartı": "Sisli gece" (görüş yarı), "Altın yağmuru" (ormanda iki kat sandık), "Herkes Gölge", "Sessiz ulaklar" (yalnız hazır mesaj). Varsayılan kapalı; sayılar kullanıcıya sorulur.
- **Beklenen etki:** Arkadaş gecelerinde çeşitlilik; Steam incelemelerinde "her maç farklı".
- **Büyüklük:** orta–büyük.
- **Risk:** Her kart denge riski **[kural]**; ölçmeden açılmamalı.

**5.3 Krallık ustalığı.**
- **Sorun:** Krallık başına oynanan/kazanılan sayılıyor ama hedef yok.
- **Öneri:** Her krallık için 3–5 adımlı ustalık yolu (ör. Gölge: "Bir hayaletle iki rakibi oyala"), sonunda unvan ya da desen.
- **Büyüklük:** orta.
- **Risk:** Hedefler sunucu günlüğünden ölçülebilir olmalı (`DeceptionLog` hazır).

**5.4 Haftalık meydan okuma.**
- **Durum:** Günlük meydan okuma var.
- **Öneri:** Haftalık "arkadaşlarınla" görevi (ör. "4 kişilik odada 3 hile yap").
- **Büyüklük:** küçük–orta.
- **Risk:** Steam başarımı olacaksa Steamworks ayarı gerekir.

**5.5 Görsel çeşitlilik.**
- **Öneri:** Mevsim/zaman temalı harita boyamaları (kış, sonbahar) ve oyuncu bayrak desenleri zaten var; kale süsü yerine bayrak/sancak kişiselleştirmesi genişletilsin.
- **Büyüklük:** orta.
- **Risk:** Free Pack yetmezse ek varlık **[maliyet]** (Tiny Swords tam sürümü ya da benzer paket).

---

## 6. Maliyet gerektiren öneriler (ayrı liste)

| Öneri | Ne satın alınır | Not |
|---|---|---|
| 5.5 mevsim haritaları, yeni binalar | Tiny Swords tam paket ya da uyumlu piksel paket | Lisans: Free Pack türevleri repoya girmiyor; ücretli paket de aynı kurala tabi olur |
| 4.2 / 4.4 ses ve krallık motifleri | Lisanslı SFX/müzik parçaları | CC0 Kenney ile çoğu karşılanabilir; motif için kısa ücretli parça gerekebilir |
| 3.1 açılış ekranı için seslendirme ("Gölge!") | Ses sanatçısı ya da lisanslı ses | İsteğe bağlı; metin ve müzikle de çalışır |

---

## 7. İlk yapılması gereken 5 şey

1. **Maç sonu açılış sinematiği (3.1).** Parti oyununun klip anı. Veri hazır, risk düşük, orta iş.
2. **Ana düğmelerin okunurluğu + kalabalığı azaltma (2.1, 1.4, 2.4).** Küçük işler; Steam sayfası görüntüleri ve ilk izlenim için hemen fark edilir.
3. **Ulak için hızlı mesajlar (3.3).** Blöfü yazmak zorunda kalmadan başlatır; 15 dilde arkadaş gruplarını konuşturur.
4. **Krallığı daha erken göstermek (1.1) + Gölge için "ilk hayaletini yolla" (3.6).** Satılan kanca ilk oturumda görülür. Başlangıç modu kuralı değişeceği için onay gerekir.
5. **Kale düşüşü ve yürüyüş gerilimi (4.1, 3.5, 2.8).** Oyunun en büyük iki anına ses + görsel ağırlık; gizlilik sınırına uyarak.

Sonra: krallık tahmini (3.2), sesler (4.2), saldırı panelinin sadeleşmesi (1.5).
