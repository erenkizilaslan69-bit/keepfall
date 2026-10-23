using System.Globalization;
using Keepfall.GameCore;
using Keepfall.GameCore.Combat;
using Keepfall.GameCore.Units;

namespace Keepfall.BattleSim;

/// <summary>
/// Parses armies like "okcu:5,kilicli:8@arka" (type:count, optional @on / @arka formation override)
/// and target priorities like "rastgele", "zayif", "karsi" or a unit id.
/// </summary>
public static class ArmyParser
{
    public static ArmySetup ParseArmy(GameRules rules, string text, string name)
    {
        var army = new ArmySetup(name);
        foreach (var raw in text.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var entry = raw;
            Row? row = null;
            int at = entry.IndexOf('@');
            if (at >= 0)
            {
                row = entry[(at + 1)..].ToLowerInvariant() switch
                {
                    "on" or "ön" or "front" => Row.Front,
                    "arka" or "back" => Row.Back,
                    var other => throw new FormatException($"Geçersiz sıra \"{other}\" (on | arka)."),
                };
                entry = entry[..at];
            }

            var parts = entry.Split(':', StringSplitOptions.TrimEntries);
            if (parts.Length != 2 || !int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out int count) || count < 0)
                throw new FormatException($"Geçersiz birlik \"{raw}\". Örnek: okcu:5");
            var type = rules.FindUnit(parts[0]) ?? throw new FormatException(
                $"Bilinmeyen birlik \"{parts[0]}\". Tanımlı olanlar: {string.Join(", ", rules.Units.Select(u => u.Id))}");

            army.Add(type, count);
            if (row is not null) army.PlaceIn(type, row.Value);
        }
        if (army.TotalCount == 0) throw new FormatException($"{name} boş.");
        return army;
    }

    public static TargetPriority ParseTargeting(GameRules rules, string text) => text.ToLowerInvariant() switch
    {
        "rastgele" or "random" => TargetPriority.Random,
        "zayif" or "zayıf" or "weakest" => TargetPriority.Weakest,
        "karsi" or "karşı" or "counter" => TargetPriority.Counter,
        _ => rules.FindUnit(text) is { } type
            ? TargetPriority.Prefer(type)
            : throw new FormatException($"Geçersiz hedef \"{text}\" (rastgele | zayif | karsi | birlik id)."),
    };

    public static string Describe(TargetPriority p) => p.Kind switch
    {
        TargetPriorityKind.Random => "rastgele",
        TargetPriorityKind.Weakest => "en zayıf",
        TargetPriorityKind.Counter => "karşılık (avantajlı olduğu)",
        TargetPriorityKind.PreferType => $"önce {p.PreferredType!.Name}",
        _ => p.Kind.ToString(),
    };
}
