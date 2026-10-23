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
/// A match: the clock, the phase and the castles (one for now). <see cref="Tick"/> is a plain function
/// of elapsed time, so tests can drive it directly; the server just calls it once per tick.
/// </summary>
public sealed class GameState
{
    public const double SampleIntervalSeconds = 30;

    private readonly List<EconomySample> _samples = [];
    private readonly int _startPopulation;
    private double _nextSample;

    public GameState(GameRules rules, double? prepSeconds = null)
    {
        Rules = rules;
        PrepSeconds = prepSeconds ?? rules.Match.ShortModePrepSeconds;
        Castle = new Castle(rules);
        _startPopulation = Castle.Population;
        TakeSample();
    }

    public GameRules Rules { get; }
    public Castle Castle { get; }
    public MatchPhase Phase { get; private set; } = MatchPhase.Preparation;
    public double PrepSeconds { get; }
    public double ElapsedSeconds { get; private set; }
    public double RemainingSeconds => Math.Max(0, PrepSeconds - ElapsedSeconds);
    public EconomySummary? Summary { get; private set; }
    public IReadOnlyList<EconomySample> Samples => _samples;

    public void Tick(double dt)
    {
        if (Phase != MatchPhase.Preparation) return;
        dt = Math.Min(dt, RemainingSeconds);
        Castle.Tick(dt);
        ElapsedSeconds += dt;
        if (ElapsedSeconds + 1e-9 >= _nextSample) TakeSample();
        if (RemainingSeconds <= 1e-9)
        {
            Phase = MatchPhase.Ended;
            if (_samples[^1].Seconds < ElapsedSeconds - 1e-9) TakeSample();
            Summary = BuildSummary();
        }
    }

    public CommandResult Execute(GameCommand command) =>
        Phase == MatchPhase.Preparation ? Castle.Execute(command) : CommandResult.Fail("Hazırlık süresi bitti.");

    private void TakeSample()
    {
        _samples.Add(new EconomySample(ElapsedSeconds, Castle.Population, Castle.SoldierCount, Castle.Food, Castle.Wood, Castle.Iron));
        _nextSample = ElapsedSeconds + SampleIntervalSeconds;
    }

    private EconomySummary BuildSummary()
    {
        var c = Castle;
        return new EconomySummary(
            ElapsedSeconds, _startPopulation, c.Population, c.Stats.PeakPopulation, c.Stats.PeopleBorn,
            c.Workers.ToDictionary(kv => kv.Key, kv => kv.Value),
            c.Soldiers.ToDictionary(kv => kv.Key.Id, kv => kv.Value),
            c.Weapons.ToDictionary(kv => kv.Key.Id, kv => kv.Value),
            c.Stats.WeaponsMade,
            c.Stats.ProducedFood, c.Stats.ProducedWood, c.Stats.ProducedIron,
            c.Food, c.Wood, c.Iron,
            c.Stats.StarvingSeconds, c.Stats.IdleWorkerSeconds,
            Jobs.Buildings.ToDictionary(b => b, b => c.Building(b).Level),
            _samples.ToList());
    }
}
