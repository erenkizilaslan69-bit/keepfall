namespace Keepfall.Core.Match;

/// <summary>One thing a kingdom can do that others cannot: its name and how it is used (shown on the decree the player gets at the start).</summary>
public sealed record FactionAbility(string Id, string Name, string Text);

/// <summary>
/// A kingdom: who it is and what it can do. Kingdoms are plain data (the abilities themselves are code keyed by <see cref="Id"/>), so a new
/// one (another race, the Tunnellers…) is added to <see cref="Factions.All"/> with its ornaments in the client's kingdom art and nothing else.
/// <paramref name="Look"/> names the set of ornaments the client draws on the castle and its buildings.
/// </summary>
public sealed record Faction(string Id, string Name, string Title, string Look, string Decree, IReadOnlyList<FactionAbility> Abilities);

public static class Factions
{
    public const string Shadow = "golge";
    public const string Merchant = "tuccar";
    public const string Oracle = "kahin";
    public const string Schemer = "entrikaci";

    public static IReadOnlyList<Faction> All { get; } =
    [
        new(Shadow, "Gölge Krallığı", "Sisin ardındakiler", "shadow",
            "Gölgeler yürür, ama gerçek değildir. Rakipler seni olduğundan güçlü sanır.",
            [
                new("decoy", "Sahte ordu", "Rakibe doğru gerçek gibi yürüyen hayalet bir ordu gönderirsin. Rakip onu görür ve uyarılır; savaşa girince dağılır. Altın harcar, bekleme süresi ve sınırı vardır."),
                new("fakereport", "Sahte rapor", "Rakibin gözcüsü kaleni gözetlerse, önceden yazdığın yanlış ordu tablosunu görür. Kâhinler hariç."),
            ]),
        new(Merchant, "Tüccar Cumhuriyeti", "Altının efendileri", "merchant",
            "Her şeyin bir fiyatı var: askerin sadakati de, haydutun kılıcı da.",
            [
                new("bribe", "Rüşvet", "Görüş alanındaki, sana yaklaşan düşman ordusuna altın ödeyip askerlerinin bir kısmını geri döndürürsün. Asker başına altın."),
                new("hirecamp", "Kamp kiralama", "Keşfettiğin bir haydut kampını kiralar, haydutları seçtiğin kaleye saldırtırsın. Kale düşerse ganimetin bir kısmı sana gelir. Kamp boşalır."),
            ]),
        new(Oracle, "Kâhinler", "Gelecek yazılıdır", "oracle",
            "Taşlar konuşur: herkesin krallığını ve destesini bilirsin, hileleri görürsün.",
            [
                new("know", "Her şeyi bilen", "Maç başında tüm rakiplerin krallığını ve destesini bilirsin."),
                new("odds", "Savaş tahmini", "Her rakip için, bildiklerine dayanarak (belirsizlik payıyla) saldırıda kazanma şansını görürsün."),
                new("seethrough", "Hileleri sezme", "Gölge'nin sahte ordularını ve sahte raporlarını, Entrikacı'nın kılık değiştirmesini ve sahte ulaklarını görür, işaretli olarak gösterilirler."),
            ]),
        new(Schemer, "Entrikacılar", "Maskelerin ustaları", "schemer",
            "Kim kimin adına konuşuyor? Sen bilirsin, başkası bilmez.",
            [
                new("fakeenvoy", "Sahte ulak", "Başka bir oyuncunun adıyla ve renginde ulak ya da mesaj gönderirsin; alıcı gerçek göndereni göremez (Kâhin hariç)."),
                new("disguise", "Kılık değiştirme", "Ordunu başka bir oyuncunun renginde gönderirsin: haritada, uyarıda ve savaş raporunda o oyuncu saldırıyor görünür. Gerçek kimlik savaştan bir süre sonra ya da gözcü raporuyla ortaya çıkar. Bekleme süresi vardır."),
            ]),
    ];

    public static Faction? Find(string? id) => All.FirstOrDefault(f => f.Id == id);

    /// <summary>
    /// Every player gets a different kingdom, at random. More players than kingdoms (a future change) would simply start repeating them after
    /// all have been given out once.
    /// </summary>
    public static Dictionary<string, string> Assign(IEnumerable<string> players, Random rng)
    {
        var pool = new List<string>();
        var result = new Dictionary<string, string>();
        foreach (var p in players)
        {
            if (pool.Count == 0) pool = All.Select(f => f.Id).OrderBy(_ => rng.Next()).ToList();
            result[p] = pool[0];
            pool.RemoveAt(0);
        }
        return result;
    }
}
