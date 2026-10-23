namespace Keepfall.BattleSim;

/// <summary>Minimal fixed-width console table.</summary>
public sealed class Table(params string[] headers)
{
    private readonly List<string[]> _rows = [];

    /// <summary>Columns from this index on are left-aligned text instead of right-aligned numbers.</summary>
    public int LeftAlignedFrom { get; init; } = int.MaxValue;

    public void Add(params string[] cells) => _rows.Add(cells);

    public void Print()
    {
        var widths = headers.Select((h, i) => Math.Max(h.Length, _rows.Count == 0 ? 0 : _rows.Max(r => i < r.Length ? r[i].Length : 0))).ToArray();
        Console.WriteLine("   " + Line(headers, widths));
        Console.WriteLine("   " + string.Join("  ", widths.Select(w => new string('-', w))));
        foreach (var row in _rows) Console.WriteLine("   " + Line(row, widths));
    }

    // First column left-aligned (labels), the rest right-aligned (numbers) unless LeftAlignedFrom says otherwise.
    private string Line(string[] cells, int[] widths) =>
        string.Join("  ", widths.Select((w, i) =>
        {
            var c = i < cells.Length ? cells[i] : "";
            return i == 0 || i >= LeftAlignedFrom ? c.PadRight(w) : c.PadLeft(w);
        })).TrimEnd();
}
