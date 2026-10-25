using Keepfall.Core;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Views;

namespace Keepfall.Bots;

/// <summary>What a module sees and uses while the bot is thinking once.</summary>
public sealed class BotContext(GameRules rules, BotInput input, BotMemory memory, BotDifficulty difficulty, BotLevelRules level, BotStats stats, Random rng)
{
    private readonly List<(double Priority, GameCommand Command, double Wood, double Iron, double Gold)> _wishes = [];

    public GameRules Rules { get; } = rules;
    public BotInput Input { get; } = input;
    public CastleView Castle => Input.Castle;
    public MapStateView? Map => Input.Map;
    public double Now => Input.Now;
    public BotMemory Memory { get; } = memory;
    public BotDifficulty Difficulty { get; } = difficulty;
    public BotLevelRules Level { get; } = level;
    public BotStats Stats { get; } = stats;
    public Random Rng { get; } = rng;

    /// <summary>Wood and iron a module has set aside (for an upgrade it is saving up for): weapons are not forged out of it.</summary>
    public (double Wood, double Iron) Reserved { get; private set; }

    public void Reserve(double wood, double iron) => Reserved = (Reserved.Wood + wood, Reserved.Iron + iron);

    /// <summary>True when this part of the mind slips this time (never for a good bot, now and then for a poor one).</summary>
    public bool Slip() => Rng.NextDouble() < Level.Mistake;

    public int Count(Job job) => Castle.Jobs.FirstOrDefault(j => j.Job == job)?.Count ?? 0;
    public int? Capacity(Job job) => Castle.Jobs.FirstOrDefault(j => j.Job == job)?.Capacity;
    public UnitView Unit(string id) => Castle.Units.First(u => u.Id == id);

    /// <summary>Weapons forged or still in the queue, which are waiting to be turned into soldiers.</summary>
    public int WeaponsWaiting => Castle.Units.Sum(u => u.Weapons) + Castle.Queue.Sum(o => o.Remaining);

    /// <summary>Soldiers at home and on the road.</summary>
    public int SoldiersTotal => Castle.Soldiers + Castle.War.SoldiersAway;

    /// <summary>Soldiers, weapons and queued weapons of one unit type, wherever they are.</summary>
    public int Owned(string unitId) =>
        Unit(unitId).Soldiers + Unit(unitId).Weapons + Castle.Queue.Where(o => o.UnitId == unitId).Sum(o => o.Remaining)
        + Castle.War.Armies.SelectMany(a => a.Units).Where(u => u.UnitId == unitId).Sum(u => u.Count);

    /// <summary>How many more people may become soldiers (or weapons for them) before the castle would run short of workers.</summary>
    public int ArmyRoom => Math.Max(0, (int)Math.Floor(Castle.Population * Rules.Bots.ArmyShare) - SoldiersTotal - WeaponsWaiting);

    /// <summary>How far into the preparation we are (0–1; 1 once the war has begun).</summary>
    public double PrepProgress => Castle.PrepSeconds <= 0 ? 1 : Math.Clamp(Castle.ElapsedSeconds / Castle.PrepSeconds, 0, 1);
    public bool AtWar => Castle.Phase == MatchPhase.War;
    /// <summary>Late in the preparation, and in the war: stored weapons are turned into soldiers.</summary>
    public bool ArmingTime => AtWar || PrepProgress >= Rules.Bots.ArmFrom;
    /// <summary>The army is being built: the preparation is past its first stretch.</summary>
    public bool ForgingTime => AtWar || PrepProgress >= Rules.Bots.WeaponsFrom;

    /// <summary>Ask for a command: higher <paramref name="priority"/> goes first; it only goes out if what it costs is still there.</summary>
    public void Wish(double priority, GameCommand command, double wood = 0, double iron = 0, double gold = 0)
    {
        if (Memory.IsRefused(command, Now)) return;
        _wishes.Add((priority, command, wood, iron, gold));
    }

    /// <summary>The wishes in order of priority, as many as the budget and <paramref name="most"/> allow.</summary>
    public IReadOnlyList<GameCommand> Decide(int most)
    {
        var res = Castle.Resources;
        double wood = res.Wood, iron = res.Iron, gold = res.Gold;
        var chosen = new List<GameCommand>();
        foreach (var w in _wishes.OrderByDescending(w => w.Priority))
        {
            if (chosen.Count >= most) break;
            if (w.Wood > wood + 1e-9 || w.Iron > iron + 1e-9 || w.Gold > gold + 1e-9) continue;
            wood -= w.Wood;
            iron -= w.Iron;
            gold -= w.Gold;
            chosen.Add(w.Command);
        }
        return chosen;
    }
}
