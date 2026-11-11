# Küfür filtresi (ulak mesajı + oyuncu adı)

Kod: `src/Keepfall.Core/Match/EnvoyMessage.cs` (`Mask`; oyuncu adları için `Room.cs` de aynı yolu kullanır). Ayar: `envoy.profanityFilter` (balance.json) artık sunucuda bir şeyi DEĞİŞTİRMEZ (2026-11-11: iki katman, aşağıda); sayı değil, dokunulmadı.

## Katmanlar
1. **Türkçe ve İngilizce**: `EnvoyMessage.cs` içindeki kök listeleri (eski, el yazısı).
2. **Diğer diller** (`de, es, fr, it, pt, pl, ru, uk, zh, ja, ko`): `src/Keepfall.Core/Match/Profanity/<dil>.txt`, derlemeye gömülü (`Keepfall.Core.csproj` EmbeddedResource). İngilizceye ek kelimeler `en.txt`'te.
   - `kelime` = yalnız o tam sözcük; `kök*` = o kökle başlayan her sözcük (çekimler).
   - zh / ja / ko'da sözcükler boşlukla ayrılmadığı için her giriş **alt dize** olarak aranır (en az 2 karakter).
   - Diğer yazılarda en az 3 harf.
3. Eşleşen kısım `*` ile maskelenir; uzunluk korunur. Oyuncu adında maskeli ad kabul edilmez/maskelenir.

## İki katman (2026-11-11)

| Katman | Ne | Kim maskeler | Kapatılabilir mi |
|---|---|---|---|
| **Nefret** | Bir halka, inanca, yönelime ya da engele yönelik hakaretler ve ölüm dilekleri | **Sunucu**, her ulak mesajında, herkese (ev sahibi sunucusu dahil; `EnvoyMessage.MaskHate`) | **Hayır.** Ne config (`envoy.profanityFilter`) ne oyuncu ayarı kapatır. |
| **Hafif** | Sıradan küfür / argo | **Alıcının oyunu** (`client/src/profanity.ts` `maskMild`, liste `profanity-lists.ts`) | Evet: Ayarlar → Oyun → "Hafif küfürleri filtrele" (varsayılan AÇIK). Herkes kendi ayarına göre görür. |

- Oyuncu **adları** iki katmanla birlikte sunucuda maskelenir (`EnvoyMessage.Mask`): adı herkes görür, kimse seçmedi.
- Uzunluk (140) ve hız (tek ulak hakkı) sınırları aynen.
- Listeler: `Profanity/<dil>.txt` = hafif, `Profanity/hate/<dil>.txt` = nefret; Türkçe/İngilizce çekirdek `EnvoyMessage.cs` (`HateStems`, `MildStems`, `MildWhole`). Tek kaynak `tools/make-profanity.py` (`LISTS` + `HATE`); istemcinin hafif listesi de oradan üretilir (nefret listesi istemciye GİTMEZ, gerek yok).
- **Emin olunmayan kelime nefret tarafında** (kural). Nefret katmanına ayrılanlar:
  - tr: ibne, puşt/pust · en: nigg*, faggot*, kike(s), spic(s), wetback*, beaner*, raghead*, towelhead*, tranny, retard/retards/retarded
  - de: schwuchtel*, neger*, kanake*, spast* · es: marica*, maricón*/maricon*, mariconazo* · fr: pédé*, tapette*, gouine*, nègre*/negre*
  - it: frocio*, recchione*, culattone* · pt: viado, viadinho*, paneleiro* · pl: cwel*, ciota* · ru: пидор*, пидар* · uk: підар*, підор*, підарас*
  - zh: 脑残/腦殘, 贱种/賤種 · ja: 死ね, くたばれ, ぶっ殺す (ölüm dileği) · ko: 병신, 빙신
- Sayılar (hafif / nefret): en 14/12, de 24/4, es 40/4, fr 27/5, it 22/3, pt 24/3, pl 34/2, ru 42/2, uk 38/3, zh 32/4, ja 20/3, ko 21/2.
- Zayıf yanlar: nefret listeleri kısa (LDNOOBW'ın seçilmiş alt kümesi); bilerek yazım bozma (f4ggot, boşluklu harfler) yakalanmaz; anadil gözden geçirmesi yok. Hafif katman istemcide olduğu için değiştirilmiş bir istemci kendi ekranında maskelemeyebilir (kendi seçimi; başkasını etkilemez).
- Testler: `EnvoyMessageTests` (16 dil örneği nefret her zaman maskeli, hafif mesajda kalır, adlarda ikisi de), `node tools/envoy-filter-check.mjs` (bir gönderen, biri filtre açık biri kapalı iki alıcı; telde nefret yok).

## Kaynak ve lisans
- Listeler **LDNOOBW** ("List of Dirty, Naughty, Obscene, and Otherwise Bad Words", Shutterstock) projesinden **seçilerek** alındı: **CC BY 4.0**. Atıf zorunlu: oyun içi Ayarlar → Hakkında kredisinde "Küfür sözlükleri / Profanity word lists: LDNOOBW (CC BY 4.0)"; lisans notu `client/public/licenses/LICENSE-LDNOOBW.md` ve `Match/Profanity/LICENSE-LDNOOBW.md`.
- Değişiklik: ham listeler sıradan sözcükler ve cinsel sözlük içerir; yalnız gerçek küfür ve hakaretler tutuldu, çekim kökleri eklendi.
- **Ukraynaca**: LDNOOBW'da yok; liste **el yazısı** (`uk.txt`). Native gözden geçirme önerilir.
- **zh-TW** `zh.txt`'in geleneksel yazı karşılıklarını, **es-419** `es.txt`'i (ör. chingar, pendejo, culero), **pt-BR** `pt.txt`'i kullanır. Ayrı liste yok.
- Üretici: `tools/make-profanity.py` (listeyi tek yerden yeniden yazar). Sayılar (girdi): de 28, es 44, fr 32, it 25, pt 27, pl 36, ru 44, uk 41, zh 36, ja 23, ko 23, en(ek) 26.
- Filtresiz dil yok: 15 dilin hepsi ya kendi listesiyle ya (zh-TW, es-419) akraba listeyle kapsanır.

## Bilerek dışarıda bırakılanlar (masum sözcüğü maskelemesin)
fr `bite` (gemi babası), es `pinche` (aşçı yardımcısı), pt `veado` (geyik), ko `보지` (bakmak; "보지 말고"), `puta*` (putative), `verga*` (Almanca vergangen), `retard*` (retardant), ja `クソ` tek başına (ナクソス, エクソシスト), zh `你妈` tek başına, ru `голый`, it `pesce`, `finocchio` (rezene). Kural: günlük bir sözcüğü yakalayan giriş ya tam sözcük yapılır ya silinir.

## Testler
`tests/Keepfall.Core.Tests/EnvoyTests.cs`: her yeni dilde en az 2 örnek kelime maskelenir (22 örnek), 12 temiz cümle (yukarıdaki tuzak sözcükleri içeren) olduğu gibi kalır.

## Kelime eklemek / çıkarmak
İlgili `.txt`'e satır ekle/sil (ya da `make-profanity.py`'yi düzenleyip çalıştır), `dotnet test -c Release` koş.
