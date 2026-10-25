using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.Bots;

public enum BotEventKind { IncomingArmy, BattleReport, ScoutReport }

/// <summary>Something the bot has noticed in its pictures. It only reaches the bot's mind at <see cref="ReactAt"/> (human reaction time).</summary>
public sealed class BotEvent(BotEventKind kind, string key, int seat, double noticedAt, double reactAt, double value)
{
    public BotEventKind Kind { get; } = kind;
    public string Key { get; } = key;
    /// <summary>The rival it is about (0: none).</summary>
    public int Seat { get; } = seat;
    public double NoticedAt { get; } = noticedAt;
    public double ReactAt { get; } = reactAt;
    /// <summary>A number that belongs to the event (when an army arrives, when a report was made…).</summary>
    public double Value { get; } = value;
    public bool Handled { get; set; }
}

/// <summary>
/// What the bot remembers, built only from its pictures: the events it noticed (each with a delay before it reacts) and
/// the commands the server refused (not tried again for a while).
/// </summary>
public sealed class BotMemory(BotLevelRules level)
{
    private readonly List<BotEvent> _events = [];
    private readonly HashSet<string> _seen = [];
    private readonly Dictionary<GameCommand, double> _refused = [];

    public IReadOnlyList<BotEvent> Events => _events;

    /// <summary>How many soldiers the bot would like to have at home soon (a raid it cannot yet launch): production arms toward it.</summary>
    public int WantSoldiers { get; set; }

    /// <summary>When it last looked at each site's raid (the work of the fight calculator is not repeated every think).</summary>
    public Dictionary<string, (double At, int Soldiers, int Needed, double Loss)> RaidPlans { get; } = [];

    /// <summary>Notice what is new in the pictures; each new thing becomes an event that is acted on after a reaction delay.</summary>
    public void Observe(BotInput input, Random rng)
    {
        double now = input.Now;
        var war = input.Castle.War;

        foreach (var i in war.Incoming)
        {
            double arrives = now + i.ArrivesInSeconds;
            // The same army is seen again every tick with a slightly different arrival: it is one event.
            bool known = _events.Any(e => e.Kind == BotEventKind.IncomingArmy && e.Seat == i.FromSeat && Math.Abs(e.Value - arrives) < 3);
            if (!known) Add(BotEventKind.IncomingArmy, $"in:{i.FromSeat}@{arrives:0}", i.FromSeat, now, arrives, rng);
        }
        foreach (var b in war.Battles)
            if (_seen.Add($"b:{b.Id}")) Add(BotEventKind.BattleReport, $"b:{b.Id}", b.OpponentSeat, now, b.At, rng);
        foreach (var r in input.Castle.Scouting.Reports)
        {
            var key = $"s:{r.TargetSeat}@{r.ObservedAt:0.0}";
            if (_seen.Add(key)) Add(BotEventKind.ScoutReport, key, r.TargetSeat, now, r.ObservedAt, rng);
        }

        _events.RemoveAll(e => e.Handled && now - e.ReactAt > 600);
    }

    private void Add(BotEventKind kind, string key, int seat, double now, double value, Random rng)
    {
        double delay = level.ReactMin + rng.NextDouble() * (level.ReactMax - level.ReactMin);
        _events.Add(new BotEvent(kind, key, seat, now, now + delay, value));
    }

    /// <summary>Events of a kind the bot has now had time to react to and has not dealt with yet.</summary>
    public IEnumerable<BotEvent> Due(BotEventKind kind, double now) =>
        _events.Where(e => e.Kind == kind && !e.Handled && e.ReactAt <= now + 1e-9);

    /// <summary>The server refused this command: do not offer it again for <paramref name="seconds"/>.</summary>
    public void Refused(GameCommand command, double now, double seconds = 20) => _refused[command] = now + seconds;

    public bool IsRefused(GameCommand command, double now) =>
        _refused.TryGetValue(command, out var until) && until > now;
}
