using System.Text;
using Keepfall.Core;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.BattleSim;

/// <summary>
/// Every deck against every other deck, played out by bots (Medium on both sides, seats swapped from match to match):
/// how often each deck wins on average. The aim: no deck wins much more than half of its matches.
/// </summary>
public sealed class DeckReport(GameRules rules, int perPair, int seed, string? outFile, string level = "orta", int perDeck = 0)
{
    private static IEnumerable<string[]> Combinations(IReadOnlyList<string> ids, int size, int start = 0)
    {
        if (size == 0) { yield return []; yield break; }
        for (int i = start; i <= ids.Count - size; i++)
            foreach (var rest in Combinations(ids, size - 1, i + 1))
                yield return [ids[i], .. rest];
    }

    public void Run()
    {
        var ids = rules.Units.Select(u => u.Id).ToList();
        var decks = Combinations(ids, rules.Deck.Size).ToList();
        // Diagnostics: KF_DECKS="a,b,c,d;e,f,g,h" plays only these decks, KF_SERIAL=1 one match at a time (to time them).
        if (Environment.GetEnvironmentVariable("KF_DECKS") is { Length: > 0 } only)
            decks = only.Split(';').Select(d => d.Split(',')).ToList();
        var pairs = new List<(int A, int B)>();
        if (perDeck > 0)
        {
            // Sample: every deck plays perDeck matches against random other decks (instead of every pair many times).
            var pick = new Random(seed);
            for (int i = 0; i < decks.Count; i++)
                for (int k = 0; k < perDeck; k++) { int j; do j = pick.Next(decks.Count); while (j == i); pairs.Add((i, j)); }
            perPair = 1;
        }
        else
            for (int i = 0; i < decks.Count; i++) for (int j = i + 1; j < decks.Count; j++) pairs.Add((i, j));
        Console.WriteLine($"Deste turnuvası: {decks.Count} deste, {pairs.Count} çift × {perPair} maç = {pairs.Count * perPair} maç · bot: {level} · tohum {seed}");

        var wins = new double[decks.Count];
        var games = new int[decks.Count];
        var matrix = new double[decks.Count, decks.Count]; // share the row deck took from the column deck
        var lockObj = new object();
        var slow = new List<(double Seconds, string Pair, int Seed, double Duration, int TimedOut)>();
        double warPrep = rules.Match.ShortModePrepSeconds, war = rules.Match.ShortModeWarSeconds;
        var difficulty = level == "zor" ? BotDifficulty.Hard : BotDifficulty.Medium;
        int done = 0, counter = 0;
        var parallel = new ParallelOptions { MaxDegreeOfParallelism = Environment.GetEnvironmentVariable("KF_SERIAL") == "1" ? 1 : -1 };
        Parallel.ForEach(pairs, parallel, pair =>
        {
            double a = 0, b = 0;
            for (int k = 0; k < perPair; k++)
            {
                bool swap = k % 2 == 1; // who sits where
                var first = swap ? decks[pair.B] : decks[pair.A];
                var second = swap ? decks[pair.A] : decks[pair.B];
                int s = seed * 100_003 + (pair.A * 7919 + pair.B) * 31 + k + System.Threading.Interlocked.Increment(ref counter) * 7;
                var room = Room.StartBotMatch("SIM", rules, new RoomOptions { MinPlayers = 1, PrepSeconds = warPrep, WarSeconds = war, Seed = s },
                    [difficulty, difficulty], [first, second]);
                var clock = System.Diagnostics.Stopwatch.StartNew();
                BotMatch.Play(rules, room, s);
                clock.Stop();
                if (Environment.GetEnvironmentVariable("KF_SERIAL") == "1") Console.WriteLine($"    {clock.Elapsed.TotalSeconds,5:0.00} sn  {string.Join("+", first)} vs {string.Join("+", second)}");
                if (clock.Elapsed.TotalSeconds > 2)
                    lock (lockObj) slow.Add((clock.Elapsed.TotalSeconds, $"{string.Join("+", first)} vs {string.Join("+", second)}", s, room.Game!.ElapsedSeconds, room.Players.SelectMany(p => room.Game.BattlesOf(p.CastleKey)).Distinct().Count(b => b.Winner == BattleWinner.Draw)));
                var winners = room.Game!.Result!.Winners.Select(w => room.PlayerOfCastle(w)!.Seat).ToList();
                double credit = winners.Count == 0 ? 0 : 1.0 / winners.Count;
                bool firstWon = winners.Contains(1), secondWon = winners.Contains(2);
                double aGot = (swap ? secondWon : firstWon) ? credit : 0, bGot = (swap ? firstWon : secondWon) ? credit : 0;
                if (winners.Count == 0) { aGot = bGot = 0.5; }
                a += aGot; b += bGot;
            }
            lock (lockObj)
            {
                wins[pair.A] += a; wins[pair.B] += b; games[pair.A] += perPair; games[pair.B] += perPair;
                matrix[pair.A, pair.B] = a / perPair; matrix[pair.B, pair.A] = b / perPair;
                if (++done % 50 == 0) Console.Write($"\r  {done}/{pairs.Count} çift");
            }
        });
        Console.WriteLine();

        Console.WriteLine($"  2 sn'den uzun süren maç: {slow.Count} (toplam {pairs.Count * perPair})");
        foreach (var x in slow.OrderByDescending(x => x.Seconds).Take(12))
            Console.WriteLine($"    {x.Seconds,6:0.0} sn · oyun {x.Duration / 60:0.0} dk · berabere savaş {x.TimedOut} · {x.Pair}");
        var rows = Enumerable.Range(0, decks.Count).Select(i => (Index: i, Share: wins[i] / games[i])).OrderByDescending(r => r.Share).ToList();
        string Name(int i) => string.Join(" + ", decks[i].Select(id => rules.FindUnit(id)!.Name));
        Console.WriteLine();
        Console.WriteLine("Desteler (ortalama kazanma payı, tüm diğer destelere karşı):");
        foreach (var (rank, r) in rows.Select((r, n) => (n + 1, r)))
            Console.WriteLine($"  {rank,2}. %{r.Share * 100,5:0.0}  {Name(r.Index)}");
        Console.WriteLine();
        Console.WriteLine($"  En iyi: %{rows[0].Share * 100:0.0} · en kötü: %{rows[^1].Share * 100:0.0} · ortalama %{rows.Average(r => r.Share) * 100:0.0}");
        Console.WriteLine($"  %58'in üstünde: {rows.Count(r => r.Share > 0.58)} deste · %42'nin altında: {rows.Count(r => r.Share < 0.42)} deste");
        Console.WriteLine("  Birim başına: her birimi içeren desteler ortalaması");
        foreach (var id in ids)
        {
            var with = rows.Where(r => decks[r.Index].Contains(id)).ToList();
            var top = rows.Take(5).Count(r => decks[r.Index].Contains(id));
            Console.WriteLine($"    {rules.FindUnit(id)!.Name,-9} %{with.Average(r => r.Share) * 100:0.0} (en iyi 5 deste içinde {top}, içeren {with.Count} deste, en iyisi %{with.Max(r => r.Share) * 100:0.0}, en kötüsü %{with.Min(r => r.Share) * 100:0.0})");
        }

        if (outFile is not null)
        {
            var sb = new StringBuilder();
            sb.AppendLine($"# Deste turnuvası ({decks.Count} deste, çift başı {perPair} maç, bot {level}, tohum {seed})\n");
            sb.AppendLine("| Sıra | Kazanma | Deste |\n|---:|---:|---|");
            foreach (var (rank, r) in rows.Select((r, n) => (n + 1, r))) sb.AppendLine($"| {rank} | %{r.Share * 100:0.0} | {Name(r.Index)} |");
            sb.AppendLine($"\nEn iyi %{rows[0].Share * 100:0.0}, en kötü %{rows[^1].Share * 100:0.0}; %58 üstü: {rows.Count(r => r.Share > 0.58)} deste.");
            File.WriteAllText(outFile, sb.ToString());
            Console.WriteLine($"  Tablo: {outFile}");
        }
    }
}
