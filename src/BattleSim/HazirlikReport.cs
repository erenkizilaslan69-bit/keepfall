using Keepfall.Core;
using Keepfall.Core.Lobby;
using Keepfall.Views;

namespace Keepfall.BattleSim;

/// <summary>
/// What a castle looks like at the end of the preparation, by bot difficulty: soldiers (and soldiers' weapons in stock), building levels, stocks, population,
/// idle workers, and how long the idle workers stood idle. Used to compare a shorter preparation (match.prepSpeed) with the long one: the same numbers
/// (within about 10%) mean the shorter preparation is the same decisions in less time.
/// </summary>
public sealed class HazirlikReport(GameRules rules, int matches, int seed)
{
    private sealed record Sample(double Soldiers, double Weapons, double BuildingLevels, double Food, double Wood, double Iron, double Pop, double Idle, double IdleSeconds, double Gold, double Hired, double Arming);

    public void Run()
    {
        double prep = rules.Match.ShortModePrepSeconds;
        Console.WriteLine($"Hazırlık ölçümü: hazırlık {prep / 60:0.#} dk, hazırlık hızı ×{rules.Match.PrepSpeed:0.##}, her zorlukta {matches} maç (2 bot), tohum {seed}");
        var t = new Table("Zorluk", "Asker", "Silah (depoda)", "Bina düzeyi (4 bina toplam)", "Yemek", "Odun", "Demir", "Nüfus", "Boşta işçi", "Boşta geçen (işçi·dk)", "Altın", "Paralı", "Kuşanan");
        foreach (var level in new[] { BotDifficulty.Easy, BotDifficulty.Medium, BotDifficulty.Hard })
        {
            var all = new List<Sample>[matches];
            Parallel.For(0, matches, i => all[i] = Play(level, prep, seed + i));
            var s = all.SelectMany(x => x).ToList();
            double Avg(Func<Sample, double> f) => s.Average(f);
            t.Add(level.ToString(), $"{Avg(x => x.Soldiers):0.0}", $"{Avg(x => x.Weapons):0.0}", $"{Avg(x => x.BuildingLevels):0.0}", $"{Avg(x => x.Food):0}", $"{Avg(x => x.Wood):0}", $"{Avg(x => x.Iron):0}",
                $"{Avg(x => x.Pop):0.0}", $"{Avg(x => x.Idle):0.0}", $"{Avg(x => x.IdleSeconds) / 60:0.0}", $"{Avg(x => x.Gold):0}", $"{Avg(x => x.Hired):0.0}", $"{Avg(x => x.Arming):0.0}");
        }
        t.Print();
        Timeline(prep);
    }

    /// <summary>How the Medium bot's castle grows through the preparation (average of the matches at 20/40/60/80/95% of it): where a faster clock falls behind shows here.</summary>
    private void Timeline(double prep)
    {
        double[] marks = [0.2, 0.4, 0.6, 0.8, 0.95];
        var rows = new List<double[]>[matches];
        Parallel.For(0, matches, i =>
        {
            var room = BotMatch.Create(rules, [BotDifficulty.Medium, BotDifficulty.Medium], prep, rules.Match.ShortModeWarSeconds, seed + i);
            var host = new BotHost.BotHost(rules, seed + i);
            var list = new List<double[]>();
            int next = 0;
            while (room.Phase == RoomPhase.Preparation && next < marks.Length)
            {
                room.Tick(rules.Match.ServerTickSeconds, dt => host.Step(room, dt));
                var first = room.Players.Select(p => ViewMapper.CastleOf(room, p)).FirstOrDefault(c => c is not null);
                if (first is null || first.ElapsedSeconds < marks[next] * prep) continue;
                foreach (var p in room.Players)
                {
                    var c = ViewMapper.CastleOf(room, p)!;
                    int Job(Keepfall.Core.Economy.Job j) => c.Jobs.FirstOrDefault(x => x.Job == j)?.Count ?? 0;
                    list.Add([next, c.Units.Sum(u => u.Soldiers + u.Weapons + u.Arming), c.Units.Sum(u => u.Hired), c.Resources.Wood, c.Resources.Iron, c.Resources.Gold,
                        Job(Keepfall.Core.Economy.Job.Farmer), Job(Keepfall.Core.Economy.Job.Lumberjack), Job(Keepfall.Core.Economy.Job.Miner), Job(Keepfall.Core.Economy.Job.Blacksmith), c.Population]);
                }
                next++;
            }
            rows[i] = list;
        });
        var tt = new Table("Hazırlığın %", "Asker+silah+kuşanan", "Paralı", "Odun", "Demir", "Altın", "Çiftçi", "Oduncu", "Madenci", "Demirci", "Nüfus");
        var all = rows.SelectMany(x => x).ToList();
        for (int k = 0; k < marks.Length; k++)
        {
            var g = all.Where(r => (int)r[0] == k).ToList();
            if (g.Count == 0) continue;
            tt.Add($"{marks[k] * 100:0}", $"{g.Average(r => r[1]):0.0}", $"{g.Average(r => r[2]):0.0}", $"{g.Average(r => r[3]):0}", $"{g.Average(r => r[4]):0}", $"{g.Average(r => r[5]):0}",
                $"{g.Average(r => r[6]):0.0}", $"{g.Average(r => r[7]):0.0}", $"{g.Average(r => r[8]):0.0}", $"{g.Average(r => r[9]):0.0}", $"{g.Average(r => r[10]):0.0}");
        }
        Console.WriteLine("Orta botun hazırlık seyri:");
        tt.Print();
    }

    private List<Sample> Play(BotDifficulty level, double prep, int seed)
    {
        var room = BotMatch.Create(rules, [level, level], prep, rules.Match.ShortModeWarSeconds, seed);
        var host = new BotHost.BotHost(rules, seed);
        var idleSeconds = new Dictionary<int, double>();
        while (room.Phase == RoomPhase.Preparation)
        {
            room.Tick(rules.Match.ServerTickSeconds, dt => host.Step(room, dt));
            foreach (var p in room.Players)
                if (ViewMapper.CastleOf(room, p) is { } c) idleSeconds[p.Seat] = idleSeconds.GetValueOrDefault(p.Seat) + (c.Jobs.FirstOrDefault(j => j.Job == Keepfall.Core.Economy.Job.Idle)?.Count ?? 0) * rules.Match.ServerTickSeconds;
        }
        var list = new List<Sample>();
        foreach (var p in room.Players)
        {
            var c = ViewMapper.CastleOf(room, p);
            if (c is null) continue;
            list.Add(new Sample(c.Units.Sum(u => u.Soldiers), c.Units.Sum(u => u.Weapons), c.Buildings.Sum(b => b.Level), c.Resources.Food, c.Resources.Wood, c.Resources.Iron, c.Population,
                c.Jobs.FirstOrDefault(j => j.Job == Keepfall.Core.Economy.Job.Idle)?.Count ?? 0, idleSeconds.GetValueOrDefault(p.Seat), c.Resources.Gold, c.Units.Sum(u => u.Hired), c.Units.Sum(u => u.Arming)));
        }
        return list;
    }
}
