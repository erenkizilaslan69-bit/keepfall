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
/// </summary>
public sealed class GameState
{
    public const double SampleIntervalSeconds = 30;

    private readonly Dictionary<string, PlayerEconomy> _players;
    private double _nextSample;

    public GameState(GameRules rules, IEnumerable<string> playerKeys, double? prepSeconds = null)
    {
        Rules = rules;
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

    public void Tick(double dt)
    {
        if (Phase != MatchPhase.Preparation) return;
        dt = Math.Min(dt, RemainingSeconds);
        foreach (var p in _players.Values) p.Castle.Tick(dt);
        ElapsedSeconds += dt;
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
        return player.Castle.Execute(command);
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
