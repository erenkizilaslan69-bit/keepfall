# Başarımlar (Steam Achievements'a bağlanabilir liste)

Kimlik = Steam'deki API adı olacak (küçük harf, alt çizgi; değişmez). 22 tanesi sunucuda maç sonunda hesaplanır (`Keepfall.Core/Progress/Achievements.cs`, saf kural kodu, ağdan bağımsız), 8 tanesi geçmişe bağlı olduğu için istemcideki ilerleme mağazasında (`client/src/progress/catalog.ts`). İkisinin de metni `catalog.ts` + `i18n/en-progress.ts`'te.

## Maç başına (sunucu)
| Kimlik | TR ad | EN ad | Koşul |
|---|---|---|---|
| `first_win` | İlk Zafer | First Victory | Bir maçı kazan (beraberlik sayılmaz). |
| `challenge_win` | Meydan Okuyucu | Challenger | Bir meydan okumayı kazan. |
| `challenge_3star` | Üç Yıldız | Three Stars | Bir meydan okumayı 3 yıldızla bitir. |
| `daily_win` | Günün Şampiyonu | Champion of the Day | Günlük meydan okumayı kazan. |
| `ghost_win` | Hayalet Zafer | Ghost Victory | Hayalet ordu (en az 1) gönderip maçı kazan. |
| `village_raid` | Köy Yağması | Village Raid | Bir köyü yağmala. |
| `village_x3` | Üç Köy Yandı | Three Villages Burned | Tek maçta 3 köy yağmala. |
| `camp_clear` | Haydut Avcısı | Bandit Hunter | Bir haydut kampını temizle. |
| `early_win` | Kıtlık Gelmeden | Before the Famine | Kıtlık başlamadan kazan. |
| `castle_felled` | Kale Yıkıcı | Castle Breaker | Bir rakip kaleyi düşür. |
| `flawless` | Kansız Zafer | Bloodless Victory | 0 asker kaybıyla (≥1 savaş kazanarak) kazan. |
| `comeback` | Küllerinden | From the Ashes | 2 savaş kaybedip yine de kazan. |
| `last_standing` | Son Ayakta | Last One Standing | 3–4 kişilik maçta tüm rakipleri eleyerek kazan. |
| `full_table` | Dört Kişilik Masa | Full Table | 3 rakibe karşı kazan. |
| `hard_bot_win` | Zoru Yendin | Hard Beaten | Zor botlu maçı kazan. |
| `scout_report` | Göz Kulak | Eyes and Ears | Gözcü gönder, raporunu oku. |
| `envoy` | Ulak Postası | Courier Post | Bir ulağın ulaşsın. |
| `fake_report` | Yalancı Şahit | False Witness | Gölge: sahte ordu tablosu yaz. |
| `bribe` | Altın Dil | Silver Tongue | Tüccar: bir orduya rüşvet ver. |
| `camp_rent` | Kiralık Kılıç | Sword for Hire | Tüccar: haydut kampı kirala. |
| `disguise` | Maskeli Balo | Masquerade | Entrikacı: başkasının adıyla ordu/ulak gönder. |
| `brave_fall` | Onurlu Düşüş | Honourable Fall | Kalen düşsün ama önce ≥3 savaş kazan (yalnız normal maçta). |

Öğretici (başlangıç modu) ve meydan okuma maçları "ders" sayılır: yalnız `InLessons` işaretli olanlar orada kazanılır (`brave_fall` gibi rekor niteliğindekiler hariç).

## Geçmişe bağlı (istemci mağazası)
| Kimlik | TR ad | EN ad | Koşul |
|---|---|---|---|
| `matches_10` | Kıdemli | Veteran | 10 maç bitir. |
| `wins_10` | On Zafer | Ten Victories | 10 maç kazan. |
| `wins_25` | Fatih | Conqueror | 25 maç kazan. |
| `all_kingdoms` | Dört Krallık | Four Kingdoms | Her krallıkla ≥1 maç kazan. |
| `kingdom_master` | Krallık Ustası | Kingdom Master | Bir krallıkta ustalık 3. düzey. |
| `challenges_all` | Meydan Okumaların Sonu | End of the Challenges | Tüm sabit meydan okumaları ≥1 yıldızla geç. |
| `challenges_perfect` | Kusursuz Defter | Perfect Ledger | Hepsinde 3 yıldız. |
| `stars_12` | Yıldız Avcısı | Star Hunter | Meydan okumalarda toplam 12 yıldız. |

## Ustalık ve kozmetik (denge etkisi YOK)
- Ustalık: krallık başına galibiyet 1 / 5 / 15 → düzey 1 / 2 / 3.
- Flama tasarımı II (`b`): o krallıkla 5 galibiyet; III (`c`): 15 galibiyet. Oyuncu her krallık için seçer; yalnız kendi kalesinde asılır (rakip krallığı gizli kalsın), maç bitince sıralamada herkes görür.
- Avatar çerçevesi (lobi + maç sonu, herkese görünür): bronz 3, gümüş 10, altın 20 başarım.
