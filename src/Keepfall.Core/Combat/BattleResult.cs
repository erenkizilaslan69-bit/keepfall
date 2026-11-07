using Keepfall.Core.Units;

namespace Keepfall.Core.Combat;

public enum BattleOutcome { SideAWins, SideBWins, Draw }

public sealed record UnitTypeStats(UnitType Type, int Initial, int Survivors, double DamageDealt, double DamageTaken);

public sealed record SideReport(string Name, IReadOnlyList<UnitTypeStats> ByType)
{
    public int Initial => ByType.Sum(s => s.Initial);
    public int Survivors => ByType.Sum(s => s.Survivors);
}

/// <summary>Something that happens to a battle at a tick: a side joins it, or a side chooses another foe.</summary>
public abstract record SimEvent(int Tick);
public sealed record JoinEvent(int Tick, ArmySetup Setup) : SimEvent(Tick);
/// <summary><paramref name="Foe"/> null: back to the side's default.</summary>
public sealed record FocusEvent(int Tick, int Side, int? Foe) : SimEvent(Tick);

/// <summary>A battle of any number of sides: the side left standing (null: nobody, a draw), and for each side its report and its kills.</summary>
public sealed record MultiResult(
    int? WinnerSide,
    double DurationSeconds,
    bool TimedOut,
    IReadOnlyList<SideReport> Sides,
    IReadOnlyList<int> KillsBySide,
    IReadOnlyList<string> Log,
    BattleRecord? Record = null);

public sealed record BattleResult(
    BattleOutcome Outcome,
    double DurationSeconds,
    bool TimedOut,
    SideReport SideA,
    SideReport SideB,
    IReadOnlyList<string> Log,
    BattleRecord? Record = null);
