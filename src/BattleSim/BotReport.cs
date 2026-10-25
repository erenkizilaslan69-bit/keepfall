using System.Diagnostics;
using Keepfall.Core;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.World;

namespace Keepfall.BattleSim;

public sealed record BotReportOptions
{
    public int Matches { get; init; } = 200;
    public int Players { get; init; } = 2;
    /// <summary>15 or 30 (the match modes).</summary>
    public int Minutes { get; init; } = 15;
    /// <summary>"orta", "kolay" or "karisik" (a mix of both, seats rotated from match to match).</summary>
    public string Difficulty { get; init; } = "karisik";
    public int Seed { get; init; } = 1;
}

/// <summary>Plays many bot matches with no screen and reports how they went: who wins and how, how big the economies and armies get, how the forest is used.</summary>
public sealed class BotReport(GameRules rules, BotReportOptions options)
{
    private sealed record SeatResult(
        int Seat, BotDifficulty Level, bool Won, bool Eliminated, double EliminatedAt, int PopWarStart, int SoldiersWarStart, int PopEnd, int PeakPop,
        int Soldiers, double GoldGained, double GoldSpent, int Mercenaries, int SoldiersLost, int EnemiesKilled, double SiegeDamage,
        IReadOnlyDictionary<string, int> Bot);

    private sealed record MatchRecord(
        bool ByElimination, double Duration, IReadOnlyList<SeatResult> Seats, int SiegeBattles, int FieldBattles, int CampBattles, int CampWins,
        int ChestsTaken, int VillagesPlundered, int CampsCleared, int BigCampsCleared, int Chests, int Villages, int Camps, int BigCamps);

    private readonly List<string> _findings = [];

    public void Run()
    {
        var clock = Stopwatch.StartNew();
        double prep = options.Minutes == 30 ? rules.Match.LongModePrepSeconds : rules.Match.ShortModePrepSeconds;
        double war = options.Minutes == 30 ? rules.Match.LongModeWarSeconds : rules.Match.ShortModeWarSeconds;
        Console.WriteLine($"Bot maçları: {options.Matches} maç · {options.Players} oyuncu · {options.Minutes} dk ({prep / 60:0}+{war / 60:0}) · zorluk: {options.Difficulty} · tohum: {options.Seed}");
        Console.WriteLine();

        var matches = new MatchRecord[options.Matches];
        Parallel.For(0, options.Matches, i => matches[i] = Play(i, prep, war));

        PrintOutcomes(matches);
        PrintEconomy(matches);
        PrintWar(matches);
        PrintForest(matches);
        PrintStrategies(matches);
        PrintSummary(matches);
        Console.WriteLine($"Süre: {clock.Elapsed.TotalSeconds:0.0} sn");
    }

    // ---- playing -----------------------------------------------------------------------------

    private IReadOnlyList<BotDifficulty> Levels(int match)
    {
        var levels = new List<BotDifficulty>();
        for (int s = 0; s < options.Players; s++)
            levels.Add(options.Difficulty switch
            {
                "kolay" => BotDifficulty.Easy,
                "orta" => BotDifficulty.Medium,
                // Mixed: about half of each, and who sits where changes from match to match.
                _ => (s + match) % 2 == 0 ? BotDifficulty.Medium : BotDifficulty.Easy,
            });
        return levels;
    }

    private MatchRecord Play(int index, double prep, double war)
    {
        int seed = options.Seed * 100_003 + index;
        var levels = Levels(index);
        var room = BotMatch.Create(rules, levels, prep, war, seed);
        var game = room.Game!;
        var host = new BotHost.BotHost(rules, seed);
        var atWarStart = new Dictionary<int, (int Pop, int Soldiers)>();
        BotMatch.Play(rules, room, seed, (r, _) =>
        {
            if (atWarStart.Count == 0 && game.Phase == MatchPhase.War)
                foreach (var p in r.Players)
                {
                    var c = game.CastleOf(p.CastleKey)!;
                    atWarStart[p.Seat] = (c.Population, c.SoldierCount + c.SoldiersAway);
                }
        }, host);

        var result = game.Result!;
        var seats = room.Players.Select(p =>
        {
            var c = game.CastleOf(p.CastleKey)!;
            var summary = game.SummaryOf(p.CastleKey)!;
            var (pop0, sol0) = atWarStart.GetValueOrDefault(p.Seat);
            return new SeatResult(p.Seat, p.Bot!.Value, result.Winners.Contains(p.CastleKey), game.IsEliminated(p.CastleKey),
                game.Eliminated.GetValueOrDefault(p.CastleKey), pop0, sol0, c.Population, c.Stats.PeakPopulation,
                c.SoldierCount + c.SoldiersAway, c.Stats.GoldGained, c.Stats.GoldSpent, c.Stats.MercenariesHired, c.Stats.SoldiersLost,
                c.Stats.EnemiesKilled, c.Stats.CastleDamageDealt, host.Stats.TryGetValue(p.Seat, out var st) ? st.Counts : new Dictionary<string, int>());
        }).ToList();

        var reports = room.Players.SelectMany(p => game.BattlesOf(p.CastleKey).Select(b => (Player: p, Report: b))).ToList();
        int siege = reports.Count(x => x.Report.Kind == BattleKind.Siege && x.Report.Attacker == x.Player.CastleKey);
        int field = reports.Count(x => x.Report.Kind == BattleKind.Field && x.Report.Attacker == x.Player.CastleKey);
        var camps = reports.Where(x => x.Report.Kind == BattleKind.Camp).ToList();
        var sites = game.AllSites;
        return new MatchRecord(result.ByElimination, game.ElapsedSeconds, seats, siege, field, camps.Count, camps.Count(x => x.Report.Winner == BattleWinner.Attacker),
            sites.Count(s => s.Site.Kind == SiteKind.Chest && s.Gone), sites.Count(s => s.Site.Kind == SiteKind.Village && s.Gone),
            sites.Count(s => s.Site.Kind == SiteKind.Camp && s.BanditCount == 0), sites.Count(s => s.Site.Kind == SiteKind.BigCamp && s.BanditCount == 0),
            sites.Count(s => s.Site.Kind == SiteKind.Chest), sites.Count(s => s.Site.Kind == SiteKind.Village),
            sites.Count(s => s.Site.Kind == SiteKind.Camp), sites.Count(s => s.Site.Kind == SiteKind.BigCamp));
    }

    // ---- sections ----------------------------------------------------------------------------

    private static string Name(BotDifficulty d) => d == BotDifficulty.Easy ? "Kolay" : "Orta";
    private static double Avg<T>(IEnumerable<T> items, Func<T, double> f) { var l = items.ToList(); return l.Count == 0 ? double.NaN : l.Average(f); }
    private static string Pct(double x) => double.IsNaN(x) ? "—" : $"%{x * 100:0.0}";
    private static string F(double x, string format = "0.0") => double.IsNaN(x) ? "—" : x.ToString(format);

    private IEnumerable<BotDifficulty> Groups(MatchRecord[] matches) => matches.SelectMany(m => m.Seats).Select(s => s.Level).Distinct().OrderBy(l => l);

    private void PrintOutcomes(MatchRecord[] matches)
    {
        Heading("1. Sonuçlar");
        int eliminated = matches.Count(m => m.ByElimination);
        Console.WriteLine($"   Elemeyle biten: {eliminated}/{matches.Length} ({Pct(eliminated / (double)matches.Length)}) · süre sonunda biten: {matches.Length - eliminated}");
        Console.WriteLine($"   Ortalama maç süresi: {F(matches.Average(m => m.Duration) / 60)} dk (oyun saati)");
        int stalled = matches.Count(m => m.SiegeBattles == 0);
        Console.WriteLine($"   Hiç kale saldırısı olmayan maç: {stalled}/{matches.Length} ({Pct(stalled / (double)matches.Length)})");
        Console.WriteLine();

        var t = new Table("Zorluk", "Koltuk", "Kazanma payı", "Elenme", "Ort. son nüfus");
        foreach (var level in Groups(matches))
        {
            var seats = matches.SelectMany(m => m.Seats.Select(s => (Match: m, Seat: s))).Where(x => x.Seat.Level == level).ToList();
            // A shared win (nobody eliminated at the end, equal population) counts as a fraction.
            double wins = matches.Sum(m => m.Seats.Where(s => s.Level == level && s.Won).Sum(s => 1.0 / m.Seats.Count(x => x.Won)));
            t.Add(Name(level), seats.Count.ToString(), Pct(wins / seats.Count), Pct(seats.Count(x => x.Seat.Eliminated) / (double)seats.Count),
                F(seats.Average(x => x.Seat.PopEnd)));
        }
        t.Print();

        if (Groups(matches).Count() == 2)
        {
            double Share(BotDifficulty l) => matches.Sum(m => m.Seats.Where(s => s.Level == l && s.Won).Sum(s => 1.0 / m.Seats.Count(x => x.Won)))
                / matches.Sum(m => m.Seats.Count(s => s.Level == l));
            double medium = Share(BotDifficulty.Medium), easy = Share(BotDifficulty.Easy);
            Console.WriteLine(easy < 1e-9 ? "   Kolay bot hiç kazanmadı." : $"   Orta bir koltuk başına kazanma oranı Kolay'ın {F(medium / easy, "0.0")} katı.");
            if (medium < 0.8 * (medium + easy)) _findings.Add($"Orta bot Kolay'ı yeterince yenmiyor (koltuk başına kazanma: Orta {Pct(medium)}, Kolay {Pct(easy)}).");
        }
        Console.WriteLine();
    }

    private void PrintEconomy(MatchRecord[] matches)
    {
        Heading("2. Ekonomi ve ordu");
        var t = new Table("Zorluk", "Nüfus savaş başı", "Asker savaş başı", "Zirve nüfus", "Son nüfus", "Son asker", "En büyük saldırı ordusu", "Ort. saldırı ordusu");
        foreach (var level in Groups(matches))
        {
            var seats = matches.SelectMany(m => m.Seats).Where(s => s.Level == level).ToList();
            var attackers = seats.Where(s => s.Bot.GetValueOrDefault("attacks") > 0).ToList();
            t.Add(Name(level), F(Avg(seats, s => s.PopWarStart)), F(Avg(seats, s => s.SoldiersWarStart)), F(Avg(seats, s => s.PeakPop)), F(Avg(seats, s => s.PopEnd)),
                F(Avg(seats, s => s.Soldiers)), F(seats.Max(s => s.Bot.GetValueOrDefault("biggestAttack")), "0"),
                F(attackers.Count == 0 ? double.NaN : attackers.Sum(s => s.Bot["attackSoldiers"]) / (double)attackers.Sum(s => s.Bot["attacks"])));
        }
        t.Print();
        Console.WriteLine("   Nüfus/asker savaş başlarken (hazırlığın sonu), zirve ve maç sonu; askerler yoldakiler dahil.");
        Console.WriteLine();
    }

    private void PrintWar(MatchRecord[] matches)
    {
        Heading("3. Savaş");
        var t = new Table("Zorluk", "Kale saldırısı/maç", "Pusu/maç", "Ort. kale hasarı", "Ölen asker", "Öldürülen düşman", "Savunma tepkisi/maç");
        foreach (var level in Groups(matches))
        {
            var seats = matches.SelectMany(m => m.Seats).Where(s => s.Level == level).ToList();
            t.Add(Name(level), F(Avg(seats, s => s.Bot.GetValueOrDefault("attacks")), "0.00"), F(Avg(seats, s => s.Bot.GetValueOrDefault("intercepts")), "0.00"),
                F(Avg(seats, s => s.SiegeDamage), "0"), F(Avg(seats, s => s.SoldiersLost)), F(Avg(seats, s => s.EnemiesKilled)),
                F(Avg(seats, s => s.Bot.GetValueOrDefault("defenceThinks")), "0.0"));
        }
        t.Print();
        Console.WriteLine($"   Maç başına: kale savaşı {F(matches.Average(m => m.SiegeBattles), "0.00")} · yol savaşı {F(matches.Average(m => m.FieldBattles), "0.00")}");
        Console.WriteLine();
    }

    private void PrintForest(MatchRecord[] matches)
    {
        Heading("4. Orman");
        var t = new Table("Zorluk", "Kazanılan altın", "Harcanan altın", "Paralı asker", "Köy yağması", "Kamp saldırısı", "Büyük kamp", "Gözcü sandığı", "Casusluk");
        foreach (var level in Groups(matches))
        {
            var seats = matches.SelectMany(m => m.Seats).Where(s => s.Level == level).ToList();
            t.Add(Name(level), F(Avg(seats, s => s.GoldGained), "0"), F(Avg(seats, s => s.GoldSpent), "0"), F(Avg(seats, s => s.Mercenaries)),
                F(Avg(seats, s => s.Bot.GetValueOrDefault("villageRaids"))), F(Avg(seats, s => s.Bot.GetValueOrDefault("campAttacks"))),
                F(Avg(seats, s => s.Bot.GetValueOrDefault("bigCampAttacks")), "0.00"), F(Avg(seats, s => s.Bot.GetValueOrDefault("chestScouts"))),
                F(Avg(seats, s => s.Bot.GetValueOrDefault("spies"))));
        }
        t.Print();
        double chests = matches.Sum(m => m.ChestsTaken) / (double)Math.Max(1, matches.Sum(m => m.Chests));
        double villages = matches.Sum(m => m.VillagesPlundered) / (double)Math.Max(1, matches.Sum(m => m.Villages));
        double camps = matches.Sum(m => m.CampsCleared) / (double)Math.Max(1, matches.Sum(m => m.Camps));
        double big = matches.Sum(m => m.BigCampsCleared) / (double)Math.Max(1, matches.Sum(m => m.BigCamps));
        Console.WriteLine($"   Maç sonunda kullanılmış yerler: sandık {Pct(chests)} · köy {Pct(villages)} · küçük kamp {Pct(camps)} · büyük kamp {Pct(big)}");
        int campFights = matches.Sum(m => m.CampBattles);
        Console.WriteLine($"   Kamp savaşlarının kazanılma oranı: {Pct(matches.Sum(m => m.CampWins) / (double)Math.Max(1, campFights))} ({campFights} savaş)");
        Console.WriteLine();

        if (campFights > 0 && matches.Sum(m => m.CampWins) / (double)campFights < 0.7) _findings.Add($"Kamp savaşlarının yalnızca {Pct(matches.Sum(m => m.CampWins) / (double)campFights)} kazanılıyor.");
        if (Avg(matches.SelectMany(m => m.Seats), s => s.GoldGained) < 60) _findings.Add("Botlar ormandan neredeyse hiç altın kazanmıyor.");
        if (big < 0.05) _findings.Add($"Büyük kamp hemen hiç temizlenmiyor ({Pct(big)}).");
    }

    private void PrintStrategies(MatchRecord[] matches)
    {
        Heading("5. Kazananın stratejisi");
        // Tags come from what a bot did; the same seat can have several.
        (string Name, Func<SeatResult, bool> Has)[] tags =
        [
            ("ormancı (köy+kamp ≥ 4, altın ≥ 150)", s => s.Bot.GetValueOrDefault("villageRaids") + s.Bot.GetValueOrDefault("campAttacks") + s.Bot.GetValueOrDefault("bigCampAttacks") >= 4 && s.GoldGained >= 150),
            ("paralı (≥ 6 kiralık)", s => s.Mercenaries >= 6),
            ("saldırgan (≥ 1 kale saldırısı)", s => s.Bot.GetValueOrDefault("attacks") >= 1),
            ("savunmacı (hiç saldırmadı)", s => s.Bot.GetValueOrDefault("attacks") == 0),
            ("pusucu (≥ 1 pusu)", s => s.Bot.GetValueOrDefault("intercepts") >= 1),
            ("büyük ordu (savaşa ≥ 15 asker)", s => s.SoldiersWarStart >= 15),
        ];
        var t = new Table("Strateji", "Koltuk", "Kazanan", "Kazanma oranı", "Kazananlar içinde pay");
        var seats = matches.SelectMany(m => m.Seats).ToList();
        int totalWinners = seats.Count(s => s.Won);
        foreach (var (name, has) in tags)
        {
            var with = seats.Where(has).ToList();
            int won = with.Count(s => s.Won);
            t.Add(name, with.Count.ToString(), won.ToString(), with.Count == 0 ? "—" : Pct(won / (double)with.Count), totalWinners == 0 ? "—" : Pct(won / (double)totalWinners));
        }
        t.Print();
        Console.WriteLine("   Berabere biten maçta (süre sonunda en çok nüfus aynıysa) birden çok kazanan sayılır.");
        Console.WriteLine();
    }

    private void PrintSummary(MatchRecord[] matches)
    {
        Heading("Özet");
        int stalled = matches.Count(m => m.SiegeBattles == 0);
        if (stalled > 0.5 * matches.Length) _findings.Add($"Maçların %{100.0 * stalled / matches.Length:0}'inde hiç kale saldırısı olmadı (botlar birbirine saldırmıyor).");
        if (matches.Average(m => m.Duration) < 0.5 * (options.Minutes * 60)) _findings.Add("Maçlar süresinin yarısından önce bitiyor.");
        if (_findings.Count == 0) Console.WriteLine("  Eşik dışında kalan bir şey yok.");
        foreach (var f in _findings) Console.WriteLine($"  ! {f}");
        Console.WriteLine();
    }

    private static void Heading(string title)
    {
        Console.WriteLine(title);
        Console.WriteLine(new string('─', Math.Min(title.Length, 100)));
    }
}
