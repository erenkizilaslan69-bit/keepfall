using Keepfall.Core.Units;

namespace Keepfall.Core.Combat;

/// <summary>
/// How an army's ranged units choose targets. Melee units always hit the frontmost enemies,
/// whatever this says.
/// </summary>
public sealed record TargetPriority(UnitType? PreferredType = null)
{
    /// <summary>Shoot the enemy front row (the back row once the front is gone).</summary>
    public static readonly TargetPriority Front = new();

    /// <summary>Shoot this unit type wherever it stands, back row included; the front row once none is left.</summary>
    public static TargetPriority Prefer(UnitType type) => new(type);
}

/// <summary>
/// What a player chooses before a battle: composition (how many of each type),
/// formation (which row each type stands in) and target priority.
/// </summary>
public sealed class ArmySetup
{
    private readonly Dictionary<UnitType, int> _counts = [];
    private readonly Dictionary<UnitType, Row> _rowOverrides = [];

    public ArmySetup(string name = "Ordu") => Name = name;

    public string Name { get; set; }
    public TargetPriority Targeting { get; set; } = TargetPriority.Front;

    public IReadOnlyDictionary<UnitType, int> Counts => _counts;
    public int TotalCount => _counts.Values.Sum();

    public ArmySetup Add(UnitType type, int count)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(count);
        if (count == 0) return this;
        _counts[type] = _counts.GetValueOrDefault(type) + count;
        return this;
    }

    public int CountOf(UnitType type) => _counts.GetValueOrDefault(type);

    /// <summary>Formation: place every unit of this type in the given row instead of its default.</summary>
    public ArmySetup PlaceIn(UnitType type, Row row)
    {
        _rowOverrides[type] = row;
        return this;
    }

    public Row RowOf(UnitType type) => _rowOverrides.TryGetValue(type, out var r) ? r : type.DefaultRow;

    /// <summary>Same composition and formation, with a new name and target priority.</summary>
    public ArmySetup Clone(string name, TargetPriority targeting)
    {
        var copy = new ArmySetup(name) { Targeting = targeting };
        foreach (var (type, count) in _counts) copy._counts[type] = count;
        foreach (var (type, row) in _rowOverrides) copy._rowOverrides[type] = row;
        return copy;
    }

    public override string ToString() =>
        string.Join(", ", _counts.Where(kv => kv.Value > 0).OrderBy(kv => kv.Key.Index).Select(kv => $"{kv.Value} {kv.Key.Name}"));
}
