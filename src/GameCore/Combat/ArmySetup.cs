using Keepfall.GameCore.Units;

namespace Keepfall.GameCore.Combat;

public enum TargetPriorityKind
{
    /// <summary>Any eligible enemy, chosen at random.</summary>
    Random,
    /// <summary>The eligible enemy with the lowest current HP (focus fire).</summary>
    Weakest,
    /// <summary>The eligible enemy this unit deals the highest counter multiplier against.</summary>
    Counter,
    /// <summary>A specific unit type if one is eligible; otherwise random.</summary>
    PreferType,
}

public sealed record TargetPriority(TargetPriorityKind Kind, UnitType? PreferredType = null)
{
    public static readonly TargetPriority Random = new(TargetPriorityKind.Random);
    public static readonly TargetPriority Weakest = new(TargetPriorityKind.Weakest);
    public static readonly TargetPriority Counter = new(TargetPriorityKind.Counter);

    public static TargetPriority Prefer(UnitType type) => new(TargetPriorityKind.PreferType, type);
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
    public TargetPriority Targeting { get; set; } = TargetPriority.Random;

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
