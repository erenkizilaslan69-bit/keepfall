using Keepfall.Core;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Views;

namespace Keepfall.Bots;

/// <summary>What a module sees and uses while the bot is thinking once.</summary>
public sealed class BotContext(GameRules rules, BotInput input, BotMemory memory, BotDifficulty difficulty, BotStats stats, Random rng)
{
    private readonly List<(double Priority, GameCommand Command, double Wood, double Iron, double Gold)> _wishes = [];

    public GameRules Rules { get; } = rules;
    public BotInput Input { get; } = input;
    public CastleView Castle => Input.Castle;
    public MapStateView? Map => Input.Map;
    public double Now => Input.Now;
    public BotMemory Memory { get; } = memory;
    public BotDifficulty Difficulty { get; } = difficulty;
    public BotStats Stats { get; } = stats;
    public Random Rng { get; } = rng;

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
