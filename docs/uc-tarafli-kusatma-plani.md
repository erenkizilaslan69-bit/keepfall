# Üç taraflı kuşatma planı (2026-11-07) — ONAY BEKLİYOR, kod yazılmadı

## 1. Sorun ve karar
Bir kalenin kapısında savaş sürerken ikinci bir saldıran gelirse bugün **bekler** (`GameState.cs` ~1010: `_active.Any(b => b.Kind == Siege && b.Defender == a.Target) → continue`); oyuncu yalnız duman ve "Savaş" etiketi görür.
**Eren'in kararı:** bekleme kalksın; kapıdaki savaş üç taraflı olsun (savunan + ilk saldıran + sonradan gelen), üçü aynı anda vuruşsun, oyuncu kime saldıracağını seçebilsin.

## 2. Bugünün yapısı (neye çarpıyoruz)
- `BattleSimulator.Simulate(a, b, rng)` **iki tarafa** yazılı (`sides[0..1]`, `1 - s` düşman, `Aim` tek düşman listesi, `BattleOutcome` SideA/SideB/Draw). `BattleRecord` askerleri A önce B sonra indeksler (`RecordedSoldier.Side` 0/1), vuruş/ölüm/ilerleme/iyileştirme tick listeleri.
- Savaş **başlarken tamamen simüle edilir** (`Fight`), kayıt istemciye bir kerede gider; `FightSeconds = süre / BattlePlayback`, `EndsAt`'te sonuçlar uygulanır (`FinishBattle`). Yani yarı yoldaki savaşın anlık durumu (can, bekleme) hiçbir yerde tutulmuyor.
- `ActiveBattle`: `Attacker`, `Opponent` (yalnız Field), `Defender` (oyuncu anahtarı); `Involves()` yalnız bu ikisi. Siege'de savunan = `sides[1]`, `Castle.CommitDefenders` savaş başında evdeki herkesi kapıya indirir.
- Kazanan kuralı: saldıran kazanırsa kale düşer (yalnız süvari kaldıysa baskın = tarla yanar), esir `TakePrisoners` (savunanın savaşa giren ordusunun %50'si) ve ganimet `PlunderFallen` saldırana.
- Gizlilik: `MapViewMapper.BattleOf` yalnız savaşan iki tarafa gider (`StartedBattlesOf/ActiveBattlesOf(CastleKey)`), saldıranın adı Entrikacı kılığına göre (`AttackerShownTo`). Dışarıdakiler yalnız `BattleMarkerView` (konum) görür.
- İstemci `BattlePlayer.ts`: `view.sides` (0 = saldıran, 1 = savunan; `sides[1].seat` kale dumanı/avlu için), kayıttan hit/death oynatır, geç gelen/yeniden bağlanan istemci için "lag" kadar ileri sarar (yani **ortadan başlayan oynatma zaten var**).

## 3. Önerilen tasarım (A): N taraflı simülatör + "tohum + olay listesi" ile yeniden hesap
Savaş artık şu üçlüyle tanımlanır: **tohum (seed)**, başlangıç tarafları, **olaylar** (tick'te katılım, tick'te hedef değişikliği). İkinci saldıran geldiğinde:
1. Katılım tick'i `t = (şimdi − StartedAt) × BattlePlayback / TickSeconds`.
2. Savaş aynı tohumla **baştan** simüle edilir; `t`'ye kadar sonuç birebir aynı (önceki kayıt öneki değişmez, istemcinin oynattığı şey bozulmaz); `t`'de üçüncü taraf `Deploy` edilir (kendi yaklaşma süresiyle), simülasyon üç tarafla devam eder. Birkaç ms'lik iş.
3. Yeni kayıt, yeni süre; `EndsAt = şimdi + kalan_sim_süresi / BattlePlayback`.
Neden bu yol: savaşı adım adım akışa çevirmek (streaming) çok daha büyük refaktör; "kayıttan can kurtarmak" ise bekleme/hedef durumunu kaybettirir ve sapar. Tohum yaklaşımı tam ve deterministik. Önkoşul: simülatör yalnız verilen `Random`'ı kullanır (şu an öyle), `GameState` savaşa kendi alt tohumunu verir (`_rng.Next()`).

### 3.1 Simülatör (`BattleSimulator.cs`, `ArmySetup.cs`, `BattleResult.cs`, `BattleRecord.cs`)
- `Simulate(IReadOnlyList<ArmySetup> sides, int seed, events, …)`; eski `Simulate(a, b, rng)` ince bir sarmalayıcı olarak KALIR (BattleSim, botlar, testler bozulmaz). **Altın test:** iki tarafta aynı tohumla kayıt eskisiyle birebir aynı (RNG tüketim sırası korunur) → önceki bot/deste ölçümleri geçerli kalır.
- Her askerin `EnemySide`'ı: hedef seçimi iki aşamalı: (1) hangi düşman taraf, (2) o tarafın içinde bugünkü kural (ön sıra / tercih edilen tür / mancınık arka sıra / süvari destek). `Aim` düşman **taraf başına** hesaplanır; `ActiveLimit`, `FrontRow`, `RearRow` zaten liste alıyor.
- Tarafın hedefi `ArmySetup.Focus` (`null` = varsayılan): odak tarafı hayattaysa ona; yoksa varsayılan.
- Bitiş: yaşayan ve zarar verebilen taraf sayısı ≤ 1 (bugünkü "yalnız iyileştirici kaldıysa yok olur" kuralı taraf başına). Sonuç: `Winner = tek ayakta kalan taraf` ya da `Draw` (süre dolarsa / herkes öldüyse).
- `BattleRecord`: `Side` 0..N−1; **savunan = 1 kalır, ekstra saldıranlar 2, 3…** (mevcut indeksler ve istemcinin `sides[1]=savunan` varsayımı bozulmaz; yeni askerler indeks sonuna eklenir).
- Kill sayımı için vuruşu bitiren tarafı izlemek (`EnemiesKilled`); küçük ekleme.

### 3.2 Oyun (`GameState.cs`, `Battles.cs`, `Castle.cs`, `War.cs`)
- `ActiveBattle`: `Attackers` listesi (`Attacker` = ilki, uyumluluk için kalır), taraf başına birim/hayatta kalan sözlükleri (`Sides[]`), `Seed`, `Events`, `Involves()` tüm saldıranlar + savunan.
- Varış döngüsü (1003-1012): kapıda aynı hedef için **o tick'te varanlar tek savaşta toplanır** (aynı anda varırlarsa 3 taraf t=0'dan); zaten siege varsa `JoinSiege(battle, army)` (yeniden simülasyon, 3.0 adımı); yoksa `StartSiege`. `Begin` yeni katılımcıyı ekler. En çok saldıran sayısı `war.siegeMaxAttackers` (yeni anahtar, 3 = herkes).
- Savunanlar: savaş başında bugünkü gibi `CommitDefenders`. **Sonradan eve dönen/kuşanılan askerler savaşa katılmaz** (varsayılan; basit ve bugünkü kuralla aynı).
- Hedef komutu: yeni `SetSiegeFocus(armyId, hedef)` (saldıran ordu için "savunan"/"diğer saldıran"; savunan için `SetDefenseFocus`) → olay listesine `t`'de eklenir, yeniden simülasyon. Hub'a **ayrı metot** (isteğe bağlı parametre yok).
- `FinishBattle` (siege dalı): kazanan taraf ayakta kalan tek taraf. Saldıran kazandıysa kale düşer (süvari-yalnız kuralı kazanan için), `TakePrisoners` + `PlunderFallen` **kazanana**; kazanamayan saldıranın hayatta kalanları eve döner (`SendHome`), savunan kazanırsa `DefendersBack`. Her saldıran kendi kayıplarını `ArmyLost` ile yer; savunan tüm saldıranlara karşı toplam kaybı.
- Rapor: her saldıran için bir `BattleReport` (kendi satırları vs savunan) + yeni alan `OtherAttacker` (öbür saldıranın koltuğu, null = yok). Savunan her saldıran için ayrı rapor alır (kendi satırları o savaşın toplamı). Bu, `BotContext` (`OpponentSeat` ile saldırı raporu bulur) ve `BotMemory`'yi bozmaz.
- `Fight()`/`StartFieldBattle`/`StartCampBattle` iki taraflı kalır (yeni imzayla, davranış aynı).

### 3.3 Kim kime vurur? (öneri; ONAY GEREKİR)
| Taraf | Varsayılan hedef | Seçilebilir |
|---|---|---|
| Saldıran (her biri) | **Savunan**; savunan ölürse öbür saldıran | "Savunan" / "Diğer saldıran" |
| Savunan | Her asker rastgele canlı bir saldıran seçer (eşit olasılık) | "Şu saldıran" |
Böylece oyuncu hiçbir şey seçmezse üçüncü taraf "akbaba" gibi birinin açığını kullanır ama bu bir **tercih**; saldıranlar birbirine yalnız isteyerek (ya da savunan ölünce) vurur.

### 3.4 Kazanan, esir, ganimet
- Kale **yalnız kapıda ayakta kalan son saldıran** varsa düşer (savunan ölü ve öbür saldıran da ölü/yenik). İki saldıran savunan ölünce de aralarında vuruşmaya devam eder: son kalan alır.
- Süre dolarsa (`combat.maxBattleSeconds`): savunan hayatta ise kale tutar; savunan ölü ama iki saldıran ayakta ise kimse alamaz, kale tutar (savunmasız kalır, bir sonraki saldırıyı bekler).
- Esir (%50 savunanın savaşa girenleri), ganimet (depo yarısı + işçi üçte biri) **yalnız kazanana**; kaybeden saldıranın hayatta kalanı eve boş döner.
- Elenme/`Eliminate`, nüfus kuralı değişmez.

## 4. İstemci (`BattlePlayer.ts`, `reports.ts`, `i18n/en*.ts`)
- Yeni hub→istemci mesajı **`BattleUpdated`** (yeni olay; eskisi bozulmaz): `{ id, fromTick, yeniAskerler (yan 2+), startedAt/fightSeconds/winner, fromTick sonrası hits/deaths/advances/heals }`. Mevcut oynatma `fromTick` sonrası planlanmış olayları atar, yeni olanları koyar, `fighters` dizisine ekstra tarafın askerlerini ekler (indeks sonuna eklendiği için eski indeksler bozulmaz).
- Yeni katılan oyuncuya tam `BattleStartedView` (yeniden bağlanma yolu: ileri sarma zaten var; yalnız `fromTick` öncesi ölenleri/vuruşları çıkarıp kırpılmış gönderilir).
- Yerleşim: savunan önde (sides[1], bugünkü gibi), iki saldıran kapının önünde **yan yana** (üçüncü taraf yanal kaydırılır). Bugün yürüyen sütun savaş tarafından devralınıyor (`claimColumn`); gelen ordu sütunu da kendiliğinden savaşçılara dönüşür. Saldıranlar arası vuruşta yakın dövüşçüler yana adım atar (ilk sürümde: hedefe doğru atılma + efekt hedefte; kusursuz yön değil).
- Odak seçici: savaştaki ordu penceresinde ("Kime saldır: Kale / Rakip ordu" iki düğme); savunan için kale penceresinde. Savaş raporunda "Diğer saldıran" satırı. `MAX_DRAWN` 40 taraf başına kalır (3 tarafta ~120 sprite; `Effects` sınırları geçerli, düşük grafikte kısıt).
- Kale hasarı oynatması `onSiege(sides[1].seat, …, winner==attacker)`: kazanan = herhangi bir saldıran taraf.

## 5. Gizli bilgi (DEĞİŞMEZ KURAL 1)
- Savaş kaydı yalnız savaşa **şu an katılan** taraflara gider; katılımla yeni gelen, öbür saldıranı o andan itibaren görür (savaşa girmek bunu zaten gösterir). Üçüncü taraf dışarıdan hâlâ yalnız konum işareti görür; "kuşatma var" bilgisi `BattlesSeenBy` ile aynı.
- Saldıran adı/rengi her izleyiciye **kendi kılığına göre** (`ShownOwner`) verilir (Entrikacı); Kâhin bilgisi ayrı.
- Önceden sızıntı: yeni katılana yalnız `fromTick` anındaki hayatta olanlar gider (ölmüşlerin kaydı gitmez).
- Duman testi (`tools/smoke-test.mjs`, 3 oyunculu bölüm): (a) üçüncü oyuncunun ordusu kuşatmaya varınca bekleme yerine `BattleUpdated`/yeni savaş alır; (b) dışarıdaki dördüncü oyuncu bu kaydı almaz; (c) önceki iki katılımcının oynatması kopmaz; (d) üç raporun gizliliği; (e) kazanan tek tarafa esir/ganimet.

## 6. Botlar (`Keepfall.Bots`)
- **Yeni kural gerekmiyor:** `BotIsolationTests` korunur, botlar yalnız Views görür. `AttackModule` "bir seferde tek saldırı" ve fırsatçı ("başkasının kuşattığı rakibe git") mantığı zaten var; artık o rakibe vardıklarında beklemek yerine katılacaklar. Varsayılan hedef = savunan; bot odak seçmez (ilk sürüm).
- Bilinen zayıflık: botun savaş hesabı (`Tactics`, iki taraflı `BattleSimulator`) savunan + öbür saldıranı bilmez; fırsatçı bot için hesap "evdeki + zaten vuruşan" yaklaşık kalır. İleride kolay iyileştirme: `Tactics` N taraflı çağrıya geçer.
- Ölçüm: `BattleSim bot --mac 400 --zorluk karisik|orta|zor-orta` önce/sonra karşılaştırılır (Orta vs Kolay %71–75, Zor vs Orta ~%59/%70 referansları `CLAUDE.md`'de). Sonuç tablosu `docs/`'a; denge sayıları değiştirilmez, yalnız raporlanır.

## 7. Testler
- Yeni `SiegeJoinTests.cs`: (1) eski iki taraflı kayıt altın test (aynı tohum → aynı kayıt); (2) katılım öncesi kayıt öneki değişmez; (3) üç taraflı kazanan/esir/ganimet kazanana; (4) savunan ölünce iki saldıran vuruşur; (5) odak değişimi; (6) üç saldıran; (7) aynı tick'te varış; (8) süre dolumu/berabere; (9) süvari-yalnız kazanan baskın yapar; (10) katılımcı olmayan kaydı almaz (`Views`); (11) Entrikacı kılığı iki izleyicide.
- Mevcut `WarTests.cs:374` ("ikinci ordu kapıda bekler") yeni kurala göre **yeniden yazılır** (artık bekleme yok). Yol üzerindeki bekleme (`:479`, saha savaşı) **değişmez** (karar kapı savaşıyla ilgili).
- `ContinuityTests` (×1/×5/×20): katılan ordu ışınlanmaz, savaş sonrası eve dönüş rotası bozulmaz; `ContinuityViolations` 0.
- `BattleRecordTests`, `RoomFuzzTests`/`CommandFuzzTests` yeni komutla genişler. Rutin: `dotnet test -c Release` → `node tools/run-smoke.mjs` → `npm --prefix client run build`.

## 8. Alternatifle karşılaştırma
| Yol | Ne | Artı | Eksi |
|---|---|---|---|
| **A (öneri)** | N taraflı simülatör + tohum/olay yeniden hesabı | Eren'in istediği tam davranış; deterministik; önceki oynatma bozulmaz; saldıranlar birbirine vurabilir, odak seçilir; 4 oyunculuda 3 saldıran da çalışır | Simülatör ve oyun mantığı değişir (en büyük iş) |
| B (koalisyon) | İki saldıran tek "A tarafı" olur, savaş 2 taraflı kalır; kayıtta renkler asker başına | Simülatör/istemci neredeyse aynı, hızlı | Saldıranlar birbirine vurmaz, odak yok; "kim alır kaleyi?" adaletsiz (hayatta kalan sayısı mı, ilk gelen mi?); Eren'in istediği değil |
| C (aşamalı bekleme) | İlk savaş biter bitmez ikinci başlar, ilk savaşın hayatta kalanıyla | En ucuz | Tam olarak bugünkü beklemenin süsü; reddedildi |
**Öneri: A**, ama **üç commit'e bölerek**: (1) simülatör N taraf + altın test + birim testleri (oyuna dokunmaz); (2) oyun entegrasyonu: katılım, kazanan/esir/ganimet, rapor, `Views`, `BattleUpdated`, botlar varsayılanla, sunucu/duman testi; (3) istemci oynatma + odak seçici + metinler (+ görüntü: 1280x720 ve 1920x1080, önce/sonra) .

## 9. Eren'e sorular (varsayılan = bu plan)
1. Saldıranlar birbirine **varsayılan olarak vurmasın** (yalnız seçerse / savunan ölünce vursun)? *(öneri: evet)*
2. Savunan askerler hedefi **rastgele bölsün**, ya da yalnız "kendine en yakın/ilk gelen"e mi vursun? *(öneri: rastgele eşit)*
3. Kale yalnız **son ayakta kalan saldırana** düşsün; esir/ganimet o saldırana? *(öneri: evet)*
4. Sonradan eve dönen/kuşanılan askerler savunmaya **katılmasın**? *(öneri: katılmasın)*
5. `balance.json`'a yeni (sayı olmayan) anahtarlar: `war.joinSiege` (true) ve `war.siegeMaxAttackers` (3) eklensin mi? *(sayı değiştirmez; kapatılırsa eski bekleme)*
6. Maç dengesi etkilenir (ikinci saldıran birincinin açtığı açıktan yararlanır). Ölçüp raporlayayım, ayar önermeyeyim mi? *(öneri: evet)*

## 10. Dosyalar (özet)
`Core/Combat/{BattleSimulator,ArmySetup,BattleResult,BattleRecord}.cs`, `Core/Match/{GameState,Battles,War}.cs` (+ `GameState.Kingdoms.cs` Entrikacı), `Core/Economy/Castle.cs` (küçük), `Core/Config` + `config/balance.json` (yeni anahtarlar), `Views/MapViews.cs` + `Server/Hubs/GameHub.cs` (`BattleUpdated`, `SetSiegeFocus`, `SetDefenseFocus`), `client/src/scene/BattlePlayer.ts`, `client/src/ui/{reports,castle-window,mover-windows}.ts`, `i18n/en*.ts`, `tests/…/SiegeJoinTests.cs`, `WarTests.cs`, `tools/smoke-test.mjs`, `docs/` ölçüm notu, `README.md`/rehber "Savaş" bölümü.
