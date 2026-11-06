# Görsel geçiş ince ayar turu (2026-11-06, dev)

Görüntüler `art/shots/incayar/` (repoya girmez): temas sayfası `temas-once-sonra.png`, devriye `lord-patrol.png`, sütun `sonra-sutun-march.png`, rehberli maç `rehber/`.

## Önce: hazırlıkta çıkanlar savaşa hızlı taşmasın
Savaş başlarken yoldaki her gözcü/ulak/ordu normal hıza döner, ETA yeniden hesaplanır (`GameState.SlowToWarPace`); test `Whoever_is_on_the_road_when_the_war_begins…` (`8768393`). Ayrıntı: `docs/hazirlik-sikistirma.md`.

## Maddeler
1. **Kamp ateşi:** ateş kampın ortasında, haydutlar çevresinde halka (küçük kamp 4, büyük kamp 10 kişiye kadar). `Sites.ts`.
2. **Sandık:** düz kutu kalktı; Free Pack'in altın taşları (`stone1..5`, `gold-pile`) yığın olur, yavaş nefes alan parıltı + ara sıra pırıltı (efektleri azalt kapatır). Boşalınca ezilmiş zemin + soluk taş.
3. **Büyük kamp:** kale görseli kalktı: iki siyah kule (arka köşeler), üç ev, arkada ve yanlarda kodla çizilmiş çit (`ForestSprites.makeFenceTexture`), ortada büyük ateş, çevresinde haydutlar. Küçük kamp aynı aileden: kule + kulübe + kısa çit + ateş.
4. **Kale içi zemin:** kahverengi kalktı; çimen görünür, kapı önünden dört binaya toprak yollar + binaların önünde küçük aşınmış alanlar (kenarları pürüzlü, koyu bir kenar çizgisi). Sur içi taş şerit ve kapı önü taş meydan kaldı (`CourtyardFloor.ts`: `TRACKS`, `PATCHES`).
5. **Küçük süsler:** fıçı, sandık, çit, kütük, odun yığını kaldırıldı.
6. **Yerleşim:** tüm binalar surdan ≥1 karo (64 px) içeride (her iki kapı yönünde de), üst üste binmeden; çiftlik ve oduncu kalenin iki yanında birer sütun (evler 0,8 boy), mine ve demirhane alt şeritte, kamp ateşi ve boşta işçi alanı serbest. Etiketler binanın önüne (altına) oturur, seviye yükselince kayar (`layout.ts: signSpot`). Seviye 4'te ek yapılar sıkışık (küçültülmüş kule/ahır): kalenin içi dar, bu yüzden en çok orada bakılmalı.
7. **Yol takibi tüm hareket edenlere:** kendi ordu/gözcü/ulak zaten mesafeyle ilerliyordu; rakip ordu/gözcü/ulak/hayalet/haydut artık yolu halka açık yollardan çıkarılıp aynı yöntemle (mesafe + yumuşak köşe, sıralar bükülür, yolun başından geriye uzanma) çizilir (`Movers.followRoadOf`, `roadAhead`). `corner-check` artık 11 durumu denetler (kendi/rakip ordu, gözcü, ulak, mancınık+süvari sütunu) ve sıra aralığını ölçer.
8. **Sütun düzeni:** birim türüne göre yer (`FOOT`: mancınık 84×92 px, süvari 54×66, piyade ~42): mancınık tek başına sıra olur, kimse üst üste binmez (düz yolda en yakın iki asker ≥33 px; keskin köşede sütun bir an sıkışır, ölçülmüyor). Sütun yolun başından önce geriye doğru düz uzanır (kale kapısında yığılmaz). Kule/kale derinliği: derinlik sırası ayak konumuna (y) göre, değişmedi; kapıdaki kuleler ve yolun üstündeki ordu aynı sıralamayı izler.
9. **King:** sakin zamanda kale içinde devriye gezer: çiftlik, mine, demirhane, oduncu (yavaş yürüyüş, her durakta 3–5 sn bekler), sonra kapıya döner. Kuşatmada kapıya koşar ve vurur; kale düşünce olduğu yerde devrilir (`Lord.ts`; Warfare `King_Run`). "Efektleri azalt" açıkken kapıda durur.
10. **Ses:** çınlayan sesler tok vuruşa çevrildi (`docs/ses-lisanslari.md` son bölüm). Dinleyemediğim için çınlama ölçüldü: en çok duyulan kılıç vuruşu (3–4 kHz metal "ting"), ulak/uyarı çanı (300 Hz), komut onayı "ding", örs çınlaması, kapı çanı. Hangisi seni rahatsız ettiyse söyle, eskisi git geçmişinde.

## Sınama (hepsi son kodla)
`tsc` temiz · `dotnet test` 283/283 · `run-smoke` tüm denetimler geçti · `corner-check` 11/11 · `movers-stall-check` geçti · `audio-check` geçti · rehberli maç x1 gerçek hız (5 dk hazırlık + savaş): 34 adım, sayfa hatası yok · `ui-audit` masaüstü (`docs/ui-audit-incayar.md`): kritik 4 (önce 6), hepsi bilinen: ölü düğme +1, savaş raporu etiketi 1–2 px taşması; yeni kategori yok · 5090 yeni build'le yeniden başlatıldı.

## Yapılmayan / dikkat
- Her madde ayrı commit istenmişti; 1–3 (orman), 4–6+9 (kale içi + King) ve 7–8 (hareket) aynı dosyalara dokunduğu için üç grup halinde commit'lendi.
- Madde 8'de "kule içinden geçiyor" için ayrı derinlik hilesi eklemedim (sıralama zaten y'ye göre); asıl neden mancınığın geniş çizimi ve üst üste sütundu, ikisi de düzeldi. Yine de kapı kulelerinin yanından geçen bir ordu gerçek oyunda gözle bakılmalı.
- Seviye 4 kale içi düzeni (özellikle mine ve demirhane) sıkışık; seviye 1–3 rahat.
- Önce/sonra mp4 yalnız King devriyesi ve sütun için resim olarak var (başsız Chrome ~3 kare/sn), mp4 alınmadı.
