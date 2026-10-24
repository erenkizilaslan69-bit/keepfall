using System.Security.Cryptography;
using Keepfall.Core.Economy;

namespace Keepfall.Core.Match;

public enum MatchPhase { Preparation, Ended }

public sealed record EconomySample(double Seconds, int Population, int Soldiers, double Food, double Wood, double Iron);

/// <summary>What the player sees when the preparation timer runs out.</summary>
public sealed record EconomySummary(
    double DurationSeconds,
    int StartPopulation,
    int FinalPopulation,
    int PeakPopulation,
    int PeopleBorn,
    IReadOnlyDictionary<Job, int> Workers,
    IReadOnlyDictionary<string, int> Soldiers,
    IReadOnlyDictionary<string, int> WeaponsInStock,
    int WeaponsMade,
    double ProducedFood,
    double ProducedWood,
    double ProducedIron,
    double FinalFood,
    double FinalWood,
    double FinalIron,
    double StarvingSeconds,
    double IdleWorkerSeconds,
    IReadOnlyDictionary<BuildingType, int> BuildingLevels,
    IReadOnlyList<EconomySample> Samples);

/// <summary>
/// A match: one shared preparation clock and one castle per player. <see cref="Tick"/> is a plain
/// function of elapsed time, so tests can drive it directly; the server just calls it once per tick.
/// Commands always name the player, so a command can only ever touch that player's own castle.
/// The one exception is scouting, which looks at another castle: it never changes it, and what it
/// sees goes into a <see cref="ScoutReport"/> (approximate soldiers, building levels), nothing more.
/// </summary>
public sealed class GameState
{
    public const double SampleIntervalSeconds = 30;

    private readonly Dictionary<string, PlayerEconomy> _players;
    private readonly List<ScoutMission> _missions = [];
    private readonly Dictionary<(string From, string Target), ScoutReport> _reports = [];
    private readonly Dictionary<string, List<GameNotification>> _notifications = [];
    private readonly Random _rng;
    private double _nextSample;

    /// <param name="rng">Randomness for scout report errors; tests pass a seeded one.</param>
    public GameState(GameRules rules, IEnumerable<string> playerKeys, double? prepSeconds = null, Random? rng = null)
    {
        Rules = rules;
        _rng = rng ?? new Random(RandomNumberGenerator.GetInt32(int.MaxValue));
        PrepSeconds = prepSeconds ?? rules.Match.ShortModePrepSeconds;
        _players = playerKeys.Distinct().ToDictionary(k => k, _ => new PlayerEconomy(new Castle(rules)));
        if (_players.Count == 0) throw new ArgumentException("A match needs at least one player.", nameof(playerKeys));
        TakeSamples();
    }

    public GameRules Rules { get; }
    public MatchPhase Phase { get; private set; } = MatchPhase.Preparation;
    public double PrepSeconds { get; }
    public double ElapsedSeconds { get; private set; }
    public double RemainingSeconds => Math.Max(0, PrepSeconds - ElapsedSeconds);
    public IReadOnlyCollection<string> PlayerKeys => _players.Keys;

    public Castle? CastleOf(string playerKey) => _players.GetValueOrDefault(playerKey)?.Castle;

    /// <summary>The player's own end-of-preparation summary; null until the phase has ended.</summary>
    public EconomySummary? SummaryOf(string playerKey) => _players.GetValueOrDefault(playerKey)?.Summary;

    public IReadOnlyList<EconomySample> SamplesOf(string playerKey) =>
        _players.GetValueOrDefault(playerKey)?.Samples ?? [];

    /// <summary>The player's scouts that are still out.</summary>
    public IReadOnlyList<ScoutMission> MissionsOf(string playerKey) => _missions.Where(m => m.From == playerKey).ToList();

    /// <summary>The latest delivered report per target, for this player only.</summary>
    public IReadOnlyList<ScoutReport> ReportsOf(string playerKey) =>
        _reports.Where(kv => kv.Key.From == playerKey).Select(kv => kv.Value).OrderBy(r => r.Target).ToList();

    /// <summary>Notifications for this player since the last call; each is returned once.</summary>
    public IReadOnlyList<GameNotification> TakeNotifications(string playerKey) =>
        _notifications.Remove(playerKey, out var list) ? list : [];

    public void Tick(double dt)
    {
        if (Phase != MatchPhase.Preparation) return;
        dt = Math.Min(dt, RemainingSeconds);
        foreach (var p in _players.Values) p.Castle.Tick(dt);
        ElapsedSeconds += dt;
        AdvanceScouts();
        if (ElapsedSeconds + 1e-9 >= _nextSample) TakeSamples();
        if (RemainingSeconds <= 1e-9)
        {
            Phase = MatchPhase.Ended;
            foreach (var p in _players.Values)
            {
                if (p.Samples[^1].Seconds < ElapsedSeconds - 1e-9) p.Sample(ElapsedSeconds);
                p.Summary = p.BuildSummary(ElapsedSeconds);
            }
        }
    }

    /// <summary>Applies a command to <paramref name="playerKey"/>'s castle and nobody else's.</summary>
    public CommandResult Execute(string playerKey, GameCommand command)
    {
        if (Phase != MatchPhase.Preparation) return CommandResult.Fail("Hazırlık süresi bitti.");
        if (!_players.TryGetValue(playerKey, out var player)) return CommandResult.Fail("Bu maçta böyle bir oyuncu yok.");
        if (command is SendScout scout) return LaunchScout(playerKey, player, scout);
        return player.Castle.Execute(command);
    }

    // ---- scouting ----------------------------------------------------------------------------

    private CommandResult LaunchScout(string from, PlayerEconomy player, SendScout c)
    {
        if (c.TargetKey == from) return CommandResult.Fail("Kendi kaleni gözetleyemezsin.");
        if (!_players.ContainsKey(c.TargetKey)) return CommandResult.Fail("Böyle bir rakip yok.");
        if (_missions.Any(m => m.From == from && m.Target == c.TargetKey))
            return CommandResult.Fail("Bu rakibe zaten bir gözcün gidiyor.");
        var sent = player.Castle.SendScout(c.From);
        if (!sent.Ok) return sent;
        _missions.Add(new ScoutMission(from, c.TargetKey, ElapsedSeconds, Rules.Scouting));
        return CommandResult.Success;
    }

    private void AdvanceScouts()
    {
        foreach (var m in _missions.ToList())
        {
            if (!m.Arrived && ElapsedSeconds + 1e-9 >= m.ArrivesAt)
            {
                m.Report = Observe(m.Target, ElapsedSeconds);
                Notify(m.Target, new GameNotification(NotificationKind.ScoutedBy, m.From, ElapsedSeconds));
            }
            if (ElapsedSeconds + 1e-9 >= m.ReturnsAt)
            {
                _reports[(m.From, m.Target)] = m.Report! with { DeliveredAt = ElapsedSeconds };
                _players[m.From].Castle.ReturnScout();
                _missions.Remove(m);
            }
        }
    }

    /// <summary>
    /// What a scout sees: every soldier type with its count off by up to ±max(ReportError × count, 1),
    /// rounded. The type is always right: 0 when there are none, at least 1 when there are any.
    /// Building levels are exact. Nothing else.
    /// </summary>
    private ScoutReport Observe(string target, double now)
    {
        var castle = _players[target].Castle;
        double error = Rules.Scouting.ReportError;
        var soldiers = Rules.Units.Select(u =>
        {
            int real = castle.Soldiers[u];
            double spread = Math.Max(real * error, 1);
            int seen = real == 0 ? 0
                : Math.Max(1, (int)Math.Round(real + (_rng.NextDouble() * 2 - 1) * spread, MidpointRounding.AwayFromZero));
            return new ScoutedUnit(u.Id, u.Name, seen);
        }).ToList();
        var levels = Jobs.Buildings.ToDictionary(b => b, b => castle.Building(b).Level);
        return new ScoutReport(target, now, now, soldiers, levels);
    }

    private void Notify(string player, GameNotification notification)
    {
        if (!_notifications.TryGetValue(player, out var list)) _notifications[player] = list = [];
        list.Add(notification);
    }

    private void TakeSamples()
    {
        foreach (var p in _players.Values) p.Sample(ElapsedSeconds);
        _nextSample = ElapsedSeconds + SampleIntervalSeconds;
    }

    private sealed class PlayerEconomy(Castle castle)
    {
        private readonly int _startPopulation = castle.Population;

        public Castle Castle { get; } = castle;
        public List<EconomySample> Samples { get; } = [];
        public EconomySummary? Summary { get; set; }

        public void Sample(double seconds) =>
            Samples.Add(new EconomySample(seconds, Castle.Population, Castle.SoldierCount, Castle.Food, Castle.Wood, Castle.Iron));

        public EconomySummary BuildSummary(double elapsed)
        {
            var c = Castle;
            return new EconomySummary(
                elapsed, _startPopulation, c.Population, c.Stats.PeakPopulation, c.Stats.PeopleBorn,
                c.Workers.ToDictionary(kv => kv.Key, kv => kv.Value),
                c.Soldiers.ToDictionary(kv => kv.Key.Id, kv => kv.Value),
                c.Weapons.ToDictionary(kv => kv.Key.Id, kv => kv.Value),
                c.Stats.WeaponsMade,
                c.Stats.ProducedFood, c.Stats.ProducedWood, c.Stats.ProducedIron,
                c.Food, c.Wood, c.Iron,
                c.Stats.StarvingSeconds, c.Stats.IdleWorkerSeconds,
                Jobs.Buildings.ToDictionary(b => b, b => c.Building(b).Level),
                Samples.ToList());
        }
    }
}
