using System.Diagnostics;
using Keepfall.Core;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.BattleSim;

/// <summary>
/// Kingdom balance: bot matches (every bot Medium, so only the kingdom differs) with random different kingdoms, and how each kingdom does:
/// win share overall, against each other kingdom, and how often its abilities were used. The aim: no kingdom above 55% on average, no army jumps.
/// </summary>
public sealed class KingdomReport(GameRules rules, int matches, int players, int minutes, int seed)
{
    private sealed record Seat(string Faction, bool Won, bool Eliminated, int Decoys, int Bribes, int Camps);
    private sealed record Match(IReadOnlyList<Seat> Seats, int Jumps, bool ByElimination);

    public void Run()
    {
        var clock = Stopwatch.StartNew();
        double prep = minutes == 30 ? rules.Match.LongModePrepSeconds : rules.Match.ShortModePrepSeconds;
        double war = minutes == 30 ? rules.Match.LongModeWarSeconds : rules.Match.ShortModeWarSeconds;
        Console.WriteLine($"Krallık maçları: {matches} maç · {players} oyuncu · {minutes} dk · hepsi Orta bot · tohum: {seed}");
        var all = new Match[matches];
        Parallel.For(0, matches, i => all[i] = Play(i, prep, war));

        Console.WriteLine();
        var t = new Table("Krallık", "Maç", "Kazanma payı", "Elenme", "Sahte ordu/maç", "Rüşvet/maç", "Kiralanan kamp/maç");
        foreach (var f in Factions.All)
        {
            var s = all.SelectMany(m => m.Seats).Where(x => x.Faction == f.Id).ToList();
            if (s.Count == 0) continue;
            t.Add(f.Name, s.Count.ToString(), $"%{100.0 * s.Count(x => x.Won) / s.Count:0.0}", $"%{100.0 * s.Count(x => x.Eliminated) / s.Count:0}",
                $"{s.Average(x => x.Decoys):0.00}", $"{s.Average(x => x.Bribes):0.00}", $"{s.Average(x => x.Camps):0.00}");
        }
        t.Print();

        if (players == 2)
        {
            Console.WriteLine();
            Console.WriteLine("Eşleşme (satırın sütuna karşı kazanma payı):");
            var ids = Factions.All.Select(f => f.Id).ToList();
            var mt = new Table(new[] { "" }.Concat(Factions.All.Select(f => f.Name)).ToArray());
            foreach (var a in ids)
            {
                var row = new List<string> { Factions.Find(a)!.Name };
                foreach (var b in ids)
                {
                    var games = all.Where(m => m.Seats[0].Faction == a && m.Seats[1].Faction == b || m.Seats[0].Faction == b && m.Seats[1].Faction == a).ToList();
                    if (a == b || games.Count == 0) { row.Add("-"); continue; }
                    int wins = games.Count(m => m.Seats.First(s => s.Faction == a).Won);
                    row.Add($"%{100.0 * wins / games.Count:0} ({games.Count})");
                }
                mt.Add(row.ToArray());
            }
            mt.Print();
        }
        Console.WriteLine();
        Console.WriteLine($"Işınlanma/sıçrama ihlali (tüm maçlarda): {all.Sum(m => m.Jumps)} · elemeyle biten maç: %{100.0 * all.Count(m => m.ByElimination) / all.Length:0}");
        Console.WriteLine($"Süre: {clock.Elapsed.TotalSeconds:0.0} sn");
    }

    private Match Play(int index, double prep, double war)
    {
        int s = seed * 100_003 + index;
        var levels = Enumerable.Repeat(BotDifficulty.Medium, players).ToList();
        var room = Room.StartBotMatch("SIM", rules, new RoomOptions { MinPlayers = 1, PrepSeconds = prep, WarSeconds = war, Seed = s }, levels);
        var host = new BotHost.BotHost(rules, s);
        BotMatch.Play(rules, room, s, null, host);
        var game = room.Game!;
        var winners = game.Result!.Winners.Select(w => room.PlayerOfCastle(w)!.Seat).ToHashSet();
        var seats = room.Players.Select(p =>
        {
            host.Stats.TryGetValue(p.Seat, out var st);
            return new Seat(game.FactionOf(p.CastleKey) ?? "?", winners.Contains(p.Seat) && winners.Count == 1, game.IsEliminated(p.CastleKey),
                st?["decoys"] ?? 0, st?["bribes"] ?? 0, st?["campsHired"] ?? 0);
        }).ToList();
        return new Match(seats, game.ContinuityViolations, game.Result!.ByElimination);
    }
}
