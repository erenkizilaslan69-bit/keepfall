using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.World;

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

    /// <summary>Rival armies seen on the road (soldiers out of their castle): when, and how many.</summary>
    public Dictionary<int, (double At, int Soldiers)> ArmiesAway { get; } = [];

    /// <summary>When a battle that is not ours was last seen at a rival's gate (it is being besieged by somebody else).</summary>
    public Dictionary<int, double> GateFights { get; } = [];

    /// <summary>The unit type that does best against the rivals' soldiers as the reports show them, worked out at <see cref="CounterAt"/>.</summary>
    public string? CounterPick { get; set; }
    public double CounterAt { get; set; } = double.NegativeInfinity;

    /// <summary>Rivals who sent a generous gift by envoy: until when the bot will not send an army against them (game seconds).</summary>
    public Dictionary<int, double> Peace { get; } = [];
    private readonly HashSet<int> _lettersSeen = [];

    public bool AtPeaceWith(int seat, double now) => Peace.TryGetValue(seat, out var until) && until > now;

    /// <summary>When it last looked at each site's raid (the work of the fight calculator is not repeated every think).</summary>
    public Dictionary<string, (double At, int Soldiers, int Needed, double Loss)> RaidPlans { get; } = [];

    /// <summary>Notice what is new in the pictures; each new thing becomes an event that is acted on after a reaction delay.</summary>
    public void Observe(BotInput input, Random rng, BotRules? rules = null)
    {
        double now = input.Now;
        // What envoys left: only the goods count (the message is not read). A gift worth enough buys the sender a while of peace.
        foreach (var letter in input.Castle.Letters ?? [])
        {
            if (!_lettersSeen.Add(letter.Id) || rules is null) continue;
            if (letter.Food + letter.Wood + letter.Iron + letter.Gold >= rules.GiftThreshold && rules.GiftThreshold > 0)
                Peace[letter.FromSeat] = Math.Max(Peace.GetValueOrDefault(letter.FromSeat), now + rules.GiftPeaceSeconds);
        }
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

        ObserveRivals(input);
        _events.RemoveAll(e => e.Handled && now - e.ReactAt > 600);
    }

    /// <summary>
    /// What the map shows of the rivals: armies of theirs on the road (so those soldiers are not at home) and fights at their gates that are
    /// not ours (somebody is besieging them). Only what is in view, as for a human.
    /// </summary>
    private void ObserveRivals(BotInput input)
    {
        if (input.Map is not { } map) return;
        double now = input.Now;
        foreach (var group in map.Seen.Where(m => m.Kind == MoverKind.Army && m.OwnerSeat != input.Seat).GroupBy(m => m.OwnerSeat))
            ArmiesAway[group.Key] = (now, group.Sum(m => m.Units.Sum(u => u.Count)));
        if (input.Layout is not { } layout) return;
        foreach (var region in layout.Regions.Where(r => r.Seat is { } seat && seat != input.Seat))
            foreach (var fight in map.Battles)
            {
                if (Distance(fight.At, region.Gate) > 6) continue;
                // A fight of ours (our army is right there) says nothing about anyone else.
                if (map.Own.Any(o => o.Kind == MoverKind.Army && Distance(o.Position, fight.At) < 8)) continue;
                GateFights[region.Seat!.Value] = now;
            }
    }

    private static double Distance(Keepfall.Views.VecView a, Keepfall.Views.VecView b) => Math.Sqrt((a.X - b.X) * (a.X - b.X) + (a.Y - b.Y) * (a.Y - b.Y));

    private void Add(BotEventKind kind, string key, int seat, double now, double value, Random rng)
    {
        double delay = level.ReactMin + rng.NextDouble() * (level.ReactMax - level.ReactMin);
        _events.Add(new BotEvent(kind, key, seat, now, now + delay, value));
    }

    /// <summary>Events of a kind the bot has now had time to react to and has not dealt with yet.</summary>
    public IEnumerable<BotEvent> Due(BotEventKind kind, double now) =>
        _events.Where(e => e.Kind == kind && !e.Handled && e.ReactAt <= now + 1e-9);

    /// <summary>Armies on their way to us that the bot knows of by now and that have not yet arrived.</summary>
    public IEnumerable<BotEvent> Threats(double now) =>
        _events.Where(e => e.Kind == BotEventKind.IncomingArmy && e.ReactAt <= now + 1e-9 && e.Value > now - 3);

    /// <summary>Armies on their way to us that the bot has SEEN, whether or not its reaction time has passed (for a bot that prepares on sight).</summary>
    public bool Sighted(double now) =>
        _events.Any(e => e.Kind == BotEventKind.IncomingArmy && e.Value > now - 3);

    /// <summary>The server refused this command: do not offer it again for <paramref name="seconds"/>.</summary>
    public void Refused(GameCommand command, double now, double seconds = 20) => _refused[command] = now + seconds;

    public bool IsRefused(GameCommand command, double now) =>
        _refused.TryGetValue(command, out var until) && until > now;
}
