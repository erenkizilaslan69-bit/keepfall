using Keepfall.Core;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.Bots;

/// <summary>
/// A computer player. It is handed the pictures a human in its seat would see (<see cref="BotInput"/>) and answers
/// with the commands a human could give. It thinks now and then, not every tick, and reacts to new events after a delay.
/// It keeps nothing but what it saw and what it did.
/// </summary>
public sealed class Bot
{
    private readonly GameRules _rules;
    private readonly BotLevelRules _level;
    private readonly Random _rng;
    private readonly BotMemory _memory;
    private readonly List<IBotModule> _modules;
    private double _nextThink;

    public Bot(GameRules rules, BotDifficulty difficulty, int seat, int seed)
    {
        _rules = rules;
        Difficulty = difficulty;
        Seat = seat;
        _level = rules.Bots.Of(difficulty);
        _rng = new Random(seed);
        _memory = new BotMemory(_level);
        _modules = [new EconomyModule()];
        // Bots do not all wake up on the same second.
        _nextThink = _rng.NextDouble() * _level.ThinkMax;
    }

    public BotDifficulty Difficulty { get; }
    public int Seat { get; }
    public BotStats Stats { get; } = new();
    public BotMemory Memory => _memory;

    public bool IsDue(double now) => now + 1e-9 >= _nextThink;

    /// <summary>One go at thinking: look at the pictures, wish, and give the commands that fit the budget.</summary>
    public IReadOnlyList<GameCommand> Think(BotInput input)
    {
        _memory.Observe(input, _rng);
        var ctx = new BotContext(_rules, input, _memory, Difficulty, Stats, _rng);
        foreach (var module in _modules) module.Think(ctx);
        var commands = ctx.Decide(_level.Commands);
        _nextThink = input.Now + _level.ThinkMin + _rng.NextDouble() * (_level.ThinkMax - _level.ThinkMin);
        Stats.Count("thinks");
        Stats.Count("commands", commands.Count);
        return commands;
    }

    /// <summary>The server refused a command: the bot remembers and does not try again at once.</summary>
    public void Refused(GameCommand command, double now)
    {
        Stats.Count("refused");
        _memory.Refused(command, now);
    }
}
