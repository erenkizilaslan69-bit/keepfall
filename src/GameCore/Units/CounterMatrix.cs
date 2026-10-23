namespace Keepfall.GameCore.Units;

/// <summary>Damage multiplier of an attacker type against a defender type.</summary>
public sealed class CounterMatrix
{
    private readonly double[,] _multipliers;

    public CounterMatrix(double[,] multipliers) => _multipliers = multipliers;

    public double Get(UnitType attacker, UnitType defender) => _multipliers[attacker.Index, defender.Index];
}
