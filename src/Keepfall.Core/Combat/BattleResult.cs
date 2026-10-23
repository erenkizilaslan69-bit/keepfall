using Keepfall.Core.Units;

namespace Keepfall.Core.Combat;

public enum BattleOutcome { SideAWins, SideBWins, Draw }

public sealed record UnitTypeStats(UnitType Type, int Initial, int Survivors, double DamageDealt, double DamageTaken);

public sealed record SideReport(string Name, IReadOnlyList<UnitTypeStats> ByType)
{
    public int Initial => ByType.Sum(s => s.Initial);
    public int Survivors => ByType.Sum(s => s.Survivors);
}

public sealed record BattleResult(
    BattleOutcome Outcome,
    double DurationSeconds,
    bool TimedOut,
    SideReport SideA,
    SideReport SideB,
    IReadOnlyList<string> Log);
