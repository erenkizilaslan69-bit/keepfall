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
    private sealed record Sample(double Soldiers, double Weapons, double BuildingLevels, double Food, double Wood, double Iron, double Pop, double Idle, double IdleSeconds);

    public void Run()
    {
        double prep = rules.Match.ShortModePrepSeconds;
        Console.WriteLine($"Hazırlık ölçümü: hazırlık {prep / 60:0.#} dk, hazırlık hızı ×{rules.Match.PrepSpeed:0.##}, her zorlukta {matches} maç (2 bot), tohum {seed}");
        var t = new Table("Zorluk", "Asker", "Silah (depoda)", "Bina düzeyi (4 bina toplam)", "Yemek", "Odun", "Demir", "Nüfus", "Boşta işçi", "Boşta geçen (işçi·dk)");
        foreach (var level in new[] { BotDifficulty.Easy, BotDifficulty.Medium, BotDifficulty.Hard })
        {
            var all = new List<Sample>[matches];
            Parallel.For(0, matches, i => all[i] = Play(level, prep, seed + i));
            var s = all.SelectMany(x => x).ToList();
            double Avg(Func<Sample, double> f) => s.Average(f);
            t.Add(level.ToString(), $"{Avg(x => x.Soldiers):0.0}", $"{Avg(x => x.Weapons):0.0}", $"{Avg(x => x.BuildingLevels):0.0}", $"{Avg(x => x.Food):0}", $"{Avg(x => x.Wood):0}", $"{Avg(x => x.Iron):0}",
                $"{Avg(x => x.Pop):0.0}", $"{Avg(x => x.Idle):0.0}", $"{Avg(x => x.IdleSeconds) / 60:0.0}");
        }
        t.Print();
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
                c.Jobs.FirstOrDefault(j => j.Job == Keepfall.Core.Economy.Job.Idle)?.Count ?? 0, idleSeconds.GetValueOrDefault(p.Seat)));
        }
        return list;
    }
}
