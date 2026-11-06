# "Ajan" fikri — elenen oyuncunun son sözü (tasarım, KOD YOK)

Durum: yalnız tasarım (2026-11-06). Uygulama kullanıcı onayına kalır; `config/balance.json` ve kural kodu değişmedi.
Kaynak: `docs/steam-plani.md` Aşama B ("elenen kısa bir ajan görevi denenecek; ölçülüp karar verilir").

## Fikir
Kalesi düşen oyuncu izleyiciye döner ve tüm haritayı görür. Beklerken oyunda **küçük bir etkisi** olsun: kalan oyunculardan **birine** bir "ajan mesajı" gönderir. Mesaj, hedefin kendi bilgi kanalında (gözcü raporu / uyarı şeridi) görünen, kaynağı belirsiz bir ipucudur. Amaç: elenmeyi "bekleme"den "son bir oyun"a çevirmek; hile/blöf temasına (Gölge, Entrikacı) uyar.

## Kural önerisi (en sade hâli)
- Hak: elenen oyuncu başına maç boyunca **1 görev** (elenme sırası kaç olursa olsun), elendikten sonra kullanılabilir; bekleme yok.
- Hedef: hayatta kalan insan oyuncular (botlar hedef olamaz; hedef yoksa düğme kapalı). Hedef önceden seçilir, gönderen görmez ne zaman okunduğunu.
- İki tür mesaj (ikisi de **sunucuda üretilir**, gönderen metin yazmaz → küfür/spam yok):
  1. **"Haber"** (doğru): gönderenin izleyici olarak gördüğü, hedefin kalesine yürüyen bir ordunun (hedef henüz görmüyorsa) **yönü ve yaklaşık büyüklüğü** ("güneyden büyük bir ordu geliyor", ±%20 gözcü gürültüsüyle, sayı yok). Gerçek ordu yoksa gönderilemez.
  2. **"Dedikodu"** (sahte): hedefe, rastgele bir rakibin ordusunun sana doğru yola çıktığı söylenir. Sunucu gerçek bir yürüyen orduyla çelişmeyecek biçimde yalnız **savaş başlamışken** ve hedefin kalesine bir saldırı **yokken** üretir; hedefin görüş alanında yalanlanabilir (bir gözcü ya da kapı görüşü gerçeği gösterir).
- Hedefte mesaj, ayrı bir "Ajan" etiketi ile değil, **"Kaynağı bilinmeyen haber"** olarak görünür; doğru mu sahte mi olduğu işaretlenmez (Kâhin de dahil; Kâhin'in hile görüşü bu mesajı da `Fake` ile ayırabilir → ayrı karar).
- Gönderenin kimliği hedefe maç bitene kadar gösterilmez; maç sonu özetinde ("kim kimi kandırdı" zaman çizelgesi, Aşama D) açıklanır.

## Gizli bilgi etkisi (DEĞİŞMEZ KURAL 1)
- Sunucu mesajı üretir ve yalnız hedefin grubuna yollar. İçeriği, gönderenin **izleyici olarak zaten görebildiği** bilgiyle sınırlıdır (elenen herkesi görür; bu, mevcut kural, değişmiyor). Hedefe yeni gizli bilgi sızmaz, çünkü "Haber" hedefin kaçırdığı bir bilgidir ama ayrıntı vermez (yön+yaklaşık büyüklük), tam sayı/deste/krallık vermez.
- **Ters yönde risk:** elenen oyuncunun izleyici bilgisini kalan oyuncuya taşımak "hayalet koçluğu"dur. Yön+büyüklük sınırı bunu küçük tutar; ama aynı odada arkadaş oyuncular için yine de sesli sohbetle zaten aşılabilir bir şeydir (kural dışı kanal). Duman testi: hedefe giden olayda sayı, krallık, deste, gönderenin kimliği, gerçek/sahte işareti bulunmamalı; botlara ve üçüncü oyunculara hiçbir şey gitmemeli.
- Meydan Okuma ve botla oynanan hızlı maçlarda hedef insan yok → hak kullanılamaz, düğme görünmez.

## Kötüye kullanım
- **Misilleme/ihanet:** düşman olarak elenen oyuncu hâlâ nefret ettiği oyuncuya sahte alarm gönderip hazırlığını bozabilir ("savunmacı bırak" refleksi). Sınır: maçta tek hak, sahte tür yalnız hedefe saldırı yokken, yalan en çok ~30 sn sürer (hedef gözcü atınca düşer).
- **Anlaşmalı 2 elenen + 1 kalan:** iki elenen aynı hedefe iki mesaj yollayabilir (hak oyuncu başına 1). Üst sınır: hedef başına en çok 2 mesaj; ikincisi 60 sn sonra.
- **Birlikte hilecilik (kazanan arkadaş):** elenen arkadaşı kazandırmak için gerçek bilgiyi ("Haber") kullanabilir; yön+büyüklük sınırı ve gönderen metni yazamadığı için kod dışı kanal olmadan değer düşük.
- **Kendi kendine zarar:** hedef sahte haberle ordusunu geri çağırıp kendini savunmasız bırakabilir; bu, blöf oyununun parçası, ama "elendiği için eğlenmeyen" biri başkasının oyununu bozuyor hissi yaratabilir → ilk sürümde açık/kapalı bayrak (`rules.agent.enabled`), varsayılan kapalı.
- **Şikâyet/ifşa:** gönderen maç sonuna kadar gizli, ama hedef "haberi kim gönderdi?" diye şüphelenir; maç sonu zaman çizelgesi bunu çözer, tilt riskini azaltır.

## Botlara etkisi
- Botlar **ajan göndermez** (elenen bot izleyici olmaz). Botlar hedef alınabilir mi? Hayır (yalnız insan hedef); dolayısıyla bot dengesi ve BattleSim ölçümleri değişmez. Bot, hedefin sahte haber sonrası davranışını da etkilemez (haber yalnız insana gider). `BotIsolationTests` etkilenmez.
- İnsan + bot odalarında en çok bir insan kalır → hak kullanılamaz; yalnız çok insanlı odalarda anlam taşır (Steam'de arkadaş odası).

## Ölçüm planı (uygulamaya karar verilirse)
1. Bot vekili YOK (bot ajan göndermez); ölçüm insanla: 3-4 kişilik oda, iki kişi elenince "izleyici sıkıntısı" (anket: 1–5) ajanlı / ajansız.
2. Sunucu sayaçları: kullanım oranı, "Haber"/"Dedikodu" payı, mesajdan sonra hedefin ordu geri çağırma oranı, mesajı izleyen 60 sn'de hedefin kalesinin düşme oranı (etkisi aşırı mı?).
3. Denge: hedefin kazanma oranı ajan mesajı alınca ±5 puandan fazla oynuyorsa kapatılır.

## Açık sorular (kullanıcı kararı)
1. Ajan hakkı gerçekten isteniyor mu, yoksa izleyicinin tek görevi "tahmin" (kimin kazanacağına oy, maç sonu puanı) mı olsun? (Gizli bilgi taşımaz, kötüye kullanım yok; daha güvenli alternatif.)
2. "Dedikodu" (sahte) türü kalsın mı, yoksa yalnız doğru "Haber" mi? Sahte tür oyunun blöf temasına uyar ama hedefte haksızlık hissi doğurur.
3. Mesaj hedefe "gönderen elenmiş biri" diye mi gelsin (kaynak bilinir, daha az gizem, daha az kötüye kullanım) yoksa tamamen gizli mi?
4. Hak elenme sırasına bağlansın mı (ilk elenen daha az bilgi görür, son elenen daha çok)?
5. Kâhin bu mesajları ayırt etsin mi?
6. Steam demosunda çok insanlı oda zaten yok olabilir; ajan yalnız tam sürüm için mi planlansın (öneri: evet, demo kapsamı dışı)?

Öneri: bu hâliyle **şimdilik yapma**; önce Aşama B'nin "Maçı izle / Yeni maç / Odadan çık" döngüsü insanlarla denensin, izleyici sıkıntısı gerçekten sorunsa (1) numaralı güvenli alternatif (izleyici tahmini) en küçük deneme olur.
