# Gece raporu (2026-11-05 → 06)

Hepsi `dev` dalında, her parça ayrı commit + push. main, Render ve Production (5080) dokunulmadı (5080 sabah baktığımda ÇALIŞMIYORDU; ben açmadım/kapatmadım).
Balance değişikliği yalnız Aşama 5'in izin verdiği çarpan (+ hazırlık süreleri).

## Aşama 1 — Görsel geçiş (tamam)
Adım 0–7 bitti: envanter, birlikler (Warfare + Free Pack), King kapıda, kale içi zemin, orman yerleri, arayüz + logo A, AI görsellerin silinmesi, test. Commit'ler: `cfb5caf`, `ff236da`, `348bfca`, `da925e2`, `867b16c`, `d9d27de`, `2aeacc3`, `b01c9e3`. Ayrıntı: `docs/gorsel-envanter.md`, temas sayfası `art/shots/gece/temas-gorsel-gecis-1.png`, `-2.png`.
- Test turunda bulunan gerileme: yeni üst şerit çerçevesi 16 px taştığı için mobil rehber (852x393) orman çerçevesini bulamıyordu → şerit çerçevesi inceltildi (`b01c9e3`). Rehber x20 masaüstü + mobil, rehber gerçek hız (x1) geçti.
- `4ea2ee2`: elenme sonrası rehber çerçevesinin `scene.cameras` hatası (anchorOf null döner).
- King'in kapıdaki son hali yeniden çekildi: `art/shots/gece/king-gate.png`, `king-fallen.png`.

## Aşama 2 — Ordu köşeleri (`e75e1d6`)
- Kendi ordu artık yol boyunca MESAFE olarak ilerler (`shownDist`), yer yoldan okunur (köşeler 0,3 karo yarıçapla yumuşar, yolun içinde); satırlar yolu izler; yeni emir/geri çağırmada mesafe yeni yolda yeniden bulunur. Başkasının ordusu (rota bilinmez) yetişirken düz çizgi yerine yol boyunca (`followRoads`) yürür.
- `tools/corner-check.mjs` (köşeli rotada ve 4 sn haber kesintisinde sapma < 0,3 karo): geçti (en çok 0,07 karo; eski kod da 0,12 ile geçiyordu: laboratuvarda eski hatayı çoğaltamadım, düzeltme gerçek sunucu verisiyle ancak sen oynayınca doğrulanır). `movers-stall-check` geçti.
- Önce/sonra mp4: `art/shots/gece/korner-before.mp4`, `korner-after.mp4`.

## Aşama 3 — Efektler (`26fac38`)
Yeni (hepsi `Efektleri azalt`/düşük grafik/sistem hareket tercihiyle kapanır, `html.kf-calm`): vuruşta kısa duraklama (45–70 ms, en çok 0,7 sn'de bir); mancınık taşı gölgesiyle süzülür, düşünce toz + küçük patlama + hafif sarsıntı; kale düşünce duraklama + yavaşlatma (%35, 1,3 sn) + King devrilir + sancak iner; bina yükseltilince ve işçi askere dönünce altın parıltı; saldıran ordu varken kale kapısından kırmızı nabız halkası; ordu/gözcü çıkışında toz; pencereler ölçek+solma ile açılıp kapanır; kaynak gelince `+N` yükselir; maç sonunda konfeti (zafer) / kül (yenilgi). Zaten vardı: vuruş parlaması, ölme düşmesi, ok yayı, ayak/at tozu, keşiş yeşili, kale duman/ateş.
- Yapılmadı: ulak varınca kâğıt açılma, gözcü/ulak çıkışında özel animasyon (yalnız toz), süvari savaş toz izi, düğme basma efekti (zaten vardı: aşağı basılma), önemli bildirim vurgusu (zaten vardı: `note.strong`).
- mp4: `art/shots/gece/savas-before.mp4` / `savas-after.mp4` (başsız Chrome ~3 kare/sn, akıcılık değil içerik için), `kale-dusus-after.mp4` (önceki halin kaydı yok). Kale düşüşü zaman ölçeği 0,35 → 1 döndüğü ve istisna olmadığı elle sınandı.

## Aşama 4 — Ses (`7fcaa2a`)
OpenGameArt CC0 kayıtları eklendi: kılıç çarpışması ×4, ok ×3, mancınık atışı, taş düşüşü ×3, kapı ×3, kale yıkılışı +2 katman, bina yükseltme ×2, ordu yürüyüşü ×3, at dörtnala, zafer ×2, **kamp ateşi döngüsü** (kameranın kampa yakınlığıyla yükselir/alçalır). Kaynak/lisans/link: `docs/ses-lisanslari.md`. Ses konuma göre (`scene/hearing.ts`: görüşün ortası tam, kenar kısık, uzak sessiz), perde ve ses seviyesi rastgele, aynı anda 10 ses sınırı, kale düşerken/maç bitince müzik kısılır; müzik hazırlık↔savaş geçişi zaten yumuşaktı. `tools/audio-check.mjs` geçti (47 kayıt, MP3 yedekleri dahil).
- Bulunamayan/yapılamayan: Kenney ve Pixabay otomatik indirmeye 403 verdi (yeni Kenney dosyası yok); CC0 yay/ok kaydı yok (CC-BY olan atlandı; ok için hışırtı kullanıldı); yenilgi vurgusu koddan üretilen ses olarak kaldı. Sesleri ben DİNLEYEMEDİM: yalnız yüklenip çözüldükleri sınandı.
- `tools/*.mjs` içindeki 10 araçta kırık tırnak (rehber atlama ayarı) onarıldı.

## Aşama 5 — Hazırlık sıkıştırma (`e3e1ca2`)
`match.prepSpeed` 1,6; hazırlık 5 dk (`shortModeMinutes 15`, `shortModePrepMinutes 5`), uzun mod 12,5 dk; `noScoutLastPrepSeconds 37.5`; botlar hazırlıkta çarpan kadar sık düşünür. Ayrıntı, ölçüm tabloları ve geri dönüş satırları: `docs/hazirlik-sikistirma.md`. 4 dk: bir satır (belgede). Sonuç: bina/stok/nüfus ±%10; asker Orta −%18, Zor −%19; Orta vs Kolay aynı; **Zor vs Orta %59 → %49**.

## Aşama 6 — Kapanış testleri (hepsi son kodla)
- `tsc`: temiz. `dotnet test -c Release`: **282/282** (4 test beklentisi yeni hazırlık süresine göre güncellendi, 1 test eklendi).
- `node tools/run-smoke.mjs`: **221 denetim, hepsi geçti** (gizli bilgi dahil). Araç eski hazırlık ayarını geçici config'te geri kurar.
- `corner-check`, `movers-stall-check`, `audio-check`: geçti.
- Rehberli maç x1 gerçek hız (5 dk hazırlık): 32 adım, rehber bitti, sayfa hatası yok, oyuncu savaşın 270. sn'sinde hayatta (`art/shots/gece/rehber-real-*.png`).
- `ui-audit` masaüstü (`docs/ui-audit-gece.md`): yeni kategori yok; kritik 6 (önceki tur 4): "savaş raporu etiketi 2–3 px taşıyor" (eski bilinen, çerçeve yüzünden biraz arttı) ve 1 ölü düğme (bilinen +1 sınırı).
- 5090 dev LAN sunucusu son build ve son ayarla yeniden başlatıldı: `http://192.168.1.3:5090/?debug=1` (dev'den ayrı publish: `keepfall-dev-lan\server`, istemci `keepfall-dev-lan\client\dist`). Test süreçleri (5081, Vite, 5175) kapalı.

## Gece kararları (sabah değiştirebilirsin)
1. Hazırlık 5 dk / ×1,6 (öneri); 4 dk için bir satır.
2. Uzun modu da aynı oranla küçülttüm (20 → 12,5 dk hazırlık).
3. Zor bot hazırlıkta daha zayıf (silahı depoda tutuyor); dokunmadım.
4. Efektler orta şiddette; vuruş duraklaması `Effects.hitStop` içinde (45 ms, olasılık 0,3, 0,7 sn aralık); yavaşlatma %35 / 1,3 sn.
5. Çerçeve: kâğıt 30 px, kart 14 px, üst şerit 5/14/12 px; çayır süsleri seyrek.
6. Ses: OGA CC0 dışında hiçbir kaynak kullanılmadı; kamp ateşi yalnız kameranın kampa yakınlığında duyulur.
7. Krallık görseli: kale/binalar oyuncu rengi; krallık yalnız kendi kapının yanındaki sancakta.

## Bozulan / takılan
- Test bozulması yok (düzeltilenler yukarıda). İlk rehber x1 koşusunda "elendi + `zoom` hatası": hata `4ea2ee2` ile giderildi; elenme, betiğin zayıf oyunundan.
- Playwright'ın npm paketi geçici klasöre kuruldu (`ui-audit` için, repo dışı).

## En iyi önce/sonra (art/shots/gece/)
1. `temas-gorsel-gecis-1.png`, `temas-gorsel-gecis-2.png`
2. `savas-before.mp4` → `savas-after.mp4`
3. `korner-before.mp4` → `korner-after.mp4`
4. `kale-dusus-after.mp4`
5. `king-gate.png`, `king-fallen.png`
6. `rehber-real-final.png` (+ `rehber-real-01..32.png`)
7. Önceki adımların kolajları: `art/shots/gorsel-gecis/adim3/karsilastirma.png`, `adim4/karsilastirma-dolu.png`, `adim5/karsilastirma-menu.png`, `adim6/karsilastirma.png`
8. `art/shots/gorsel-gecis/adim2/w-1-camp.png` (7 birim yan yana)
9. `art/shots/gorsel-gecis/adim5/after-home-logo-b.png` (logo B)
10. `art/shots/gorsel-gecis/adim5/karsilastirma-bitis.png`

## Sabah bakman gereken 5 şey
1. **5 dk hazırlığı 5090'da oyna** (`http://192.168.1.3:5090/?debug=1`), mümkünse hiç oynamamış biriyle; karar: 5 mi 4 mü, Zor bot düzeltilsin mi.
2. **Sesleri dinle** (kamp ateşi, mancınık, kale yıkılışı, kılıç çarpışması); ses dengesi ve ateşin hangi yakınlıkta duyulduğu.
3. **Efekt hissi**: vuruş duraklaması, kale düşüşünde yavaşlatma, kırmızı yaklaşma halkası; "Efektleri azalt" hepsini kapatıyor mu.
4. **Görünüm ince ayarı**: çerçeve kalınlığı/rengi, çayır seyrekliği, logo A mı B mi (A seçilmişti).
5. **Production 5080 kapalı**; yeni sürümü yayınlamak istersen CLAUDE.md #5 adımları (istemci build, publish, 5080'den başlatma); main'e merge ve Render deploy senin kararın.
