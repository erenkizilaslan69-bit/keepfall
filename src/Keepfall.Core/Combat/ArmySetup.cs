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
    private Dictionary<UnitType, Row>? _layout;

    public ArmySetup(string name = "Ordu") => Name = name;

    public string Name { get; set; }
    public TargetPriority Targeting { get; set; } = TargetPriority.Front;
    /// <summary>The ranged soldiers of this side hit this many times as hard (1.25: the archers behind a wall).</summary>
    public double RangedDamageFactor { get; set; } = 1;

    public IReadOnlyDictionary<UnitType, int> Counts => _counts;
    public int TotalCount => _counts.Values.Sum();

    public ArmySetup Add(UnitType type, int count)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(count);
        if (count == 0) return this;
        _counts[type] = _counts.GetValueOrDefault(type) + count;
        _layout = null;
        return this;
    }

    public int CountOf(UnitType type) => _counts.GetValueOrDefault(type);

    /// <summary>Formation: place every unit of this type in the given row (each type has a row of its own: see <see cref="RowOf"/>).</summary>
    public ArmySetup PlaceIn(UnitType type, Row row)
    {
        _rowOverrides[type] = row;
        _layout = null;
        return this;
    }

    /// <summary>
    /// The row this type stands in. Every unit type of an army has a row of its own: the chosen rows come first (a row that is taken goes to the next free
    /// one behind it), then the rest take the free rows from the front, the fighters first and the ones that stay behind after them.
    /// Only when an army has more than four types (never in a match: the deck is four) do the last ones share the fourth row.
    /// </summary>
    public Row RowOf(UnitType type)
    {
        _layout ??= BuildLayout();
        return _layout.TryGetValue(type, out var r) ? r : _rowOverrides.TryGetValue(type, out var o) ? o : type.DefaultRow;
    }

    private Dictionary<UnitType, Row> BuildLayout()
    {
        var layout = new Dictionary<UnitType, Row>();
        var taken = new bool[4];
        int Take(int from, bool forward)
        {
            if (forward) { for (int i = from; i < 4; i++) if (!taken[i]) return i; for (int i = from - 1; i >= 0; i--) if (!taken[i]) return i; }
            else { for (int i = from; i >= 0; i--) if (!taken[i]) return i; for (int i = from + 1; i < 4; i++) if (!taken[i]) return i; }
            return -1;
        }
        var present = _counts.Where(kv => kv.Value > 0).Select(kv => kv.Key).ToList();
        foreach (var t in present.Where(t => _rowOverrides.ContainsKey(t)).OrderBy(t => (int)_rowOverrides[t]).ThenBy(t => t.Index))
        {
            int i = Take((int)_rowOverrides[t], true);
            if (i < 0) { layout[t] = Row.Fourth; continue; }
            taken[i] = true; layout[t] = (Row)i;
        }
        foreach (var t in present.Where(t => !_rowOverrides.ContainsKey(t)).OrderBy(t => t.DefaultRow == Row.First ? 0 : 1).ThenBy(t => t.Index))
        {
            int i = Take(0, true);
            if (i < 0) { layout[t] = Row.Fourth; continue; }
            taken[i] = true; layout[t] = (Row)i;
        }
        return layout;
    }

    /// <summary>Same composition and formation, with a new name and target priority.</summary>
    public ArmySetup Clone(string name, TargetPriority targeting)
    {
        var copy = new ArmySetup(name) { Targeting = targeting, RangedDamageFactor = RangedDamageFactor };
        foreach (var (type, count) in _counts) copy._counts[type] = count;
        foreach (var (type, row) in _rowOverrides) copy._rowOverrides[type] = row;
        return copy;
    }

    public override string ToString() =>
        string.Join(", ", _counts.Where(kv => kv.Value > 0).OrderBy(kv => kv.Key.Index).Select(kv => $"{kv.Value} {kv.Key.Name}"));
}
