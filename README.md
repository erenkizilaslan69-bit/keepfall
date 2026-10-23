# Keepfall

2–4 kişilik, maç tabanlı kale strateji oyunu. Şu an: arayüzsüz savaş simülatörü.

## Yapı

| Yol | Ne |
| --- | --- |
| `config/balance.json` | Tüm denge sayıları (birlikler, karşılık matrisi, savaş ayarları). Kaynak: `docs/kale_oyunu_sayilar.xlsx`. |
| `src/Keepfall.Core` | Oyun mantığı kütüphanesi. Sunucu da bunu kullanacak. |
| `src/Keepfall.Core/Config` | `balance.json` okuma ve doğrulama → `GameRules`. |
| `src/Keepfall.Core/Combat` | `ArmySetup` (kompozisyon, diziliş, hedef) ve `BattleSimulator`. |
| `src/BattleSim` | Konsol aracı: tek savaş ve denge raporu. |

## Çalıştırma

```bash
dotnet run --project src/BattleSim -c Release -- denge
```

```bash
dotnet run --project src/BattleSim -c Release -- denge --butce kaynak --mac 20000
```

```bash
dotnet run --project src/BattleSim -c Release -- savas "okcu:10,kalkanli:10" "kilicli:20" --hedef-b okcu
```

- `denge`: birlik tablosu, düellolar, rastgele turnuva, kompozisyon ligi, hedef seçiminin etkisi ve özet.
  `--butce kisi` (varsayılan) iki ordunun asker sayısını, `--butce kaynak` kaynak değerini eşitler.
- `savas`: iki ordu, savaş günlüğüyle. `--tekrar 500` ile kazanma oranı.
- `kontrol`: ayar dosyasını doğrular.

Ayar dosyası çalışma klasöründen yukarı doğru `config/balance.json` olarak aranır; `--config <yol>` ile başka bir dosya verilebilir.
Sayıları değiştirmek için derlemeye gerek yok.

## Savaş kuralları (şimdilik)

- Yakın birlikler, düşmanın ön sırası düşene kadar arka sıraya ulaşamaz. Okçular, öncelikli tür seçildiyse arka sıradaki o türü de vurabilir.
- Uzak birlikler (okçu) her sıradan vurur. Yakın birlikler sadece ön sıradan vurur; arkaya konan yakın birlik yedektir, ön sıra düşünce öne geçer.
- Savaş başında yakın dövüşçüler `approachTime` saniye (varsayılan 3) hedefe ulaşamaz; bu sürede okçular serbest atış yapar.
- Hasar = birliğin hasarı × karşılık çarpanı. Bir adımdaki tüm vuruşlar aynı anda işlenir.
- Yakın dövüşçüler her zaman en öndekine vurur. Okçular varsayılan olarak da ön sıraya vurur; ordu başına öncelikli bir birlik türü seçilebilir (`--hedef-a okcu`), okçular o türü arka sırada olsa da hedefler.
