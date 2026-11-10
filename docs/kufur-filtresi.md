# Küfür filtresi (ulak mesajı + oyuncu adı)

Kod: `src/Keepfall.Core/Match/EnvoyMessage.cs` (`Mask`; oyuncu adları için `Room.cs` de aynı yolu kullanır). Ayar: `envoy.profanityFilter` (balance.json, açık).

## Katmanlar
1. **Türkçe ve İngilizce**: `EnvoyMessage.cs` içindeki kök listeleri (eski, el yazısı).
2. **Diğer diller** (`de, es, fr, it, pt, pl, ru, uk, zh, ja, ko`): `src/Keepfall.Core/Match/Profanity/<dil>.txt`, derlemeye gömülü (`Keepfall.Core.csproj` EmbeddedResource). İngilizceye ek kelimeler `en.txt`'te.
   - `kelime` = yalnız o tam sözcük; `kök*` = o kökle başlayan her sözcük (çekimler).
   - zh / ja / ko'da sözcükler boşlukla ayrılmadığı için her giriş **alt dize** olarak aranır (en az 2 karakter).
   - Diğer yazılarda en az 3 harf.
3. Eşleşen kısım `*` ile maskelenir; uzunluk korunur. Oyuncu adında maskeli ad kabul edilmez/maskelenir.

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
