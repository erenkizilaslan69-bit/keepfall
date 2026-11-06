namespace Keepfall.Core.Progress;

/// <summary>
/// Cosmetics change how a player looks, never how the game plays (no balance number reads them). The server only checks that a pick is
/// one of the known ids; whether the player has earned it is the client's own progress store for now (a Steam build can check
/// against the platform later). A pick that is not on the list is refused, so nothing but these ids can ever reach another player.
/// </summary>
public static class Cosmetics
{
    /// <summary>Avatar frames, shown beside a player's name in the lobby and on the end screen. Null = none.</summary>
    public static readonly IReadOnlyList<string> Frames = ["bronze", "silver", "gold"];

    /// <summary>The banner designs of a kingdom (a is the plain one everybody has).</summary>
    public static readonly IReadOnlyList<string> Designs = ["a", "b", "c"];

    public static readonly IReadOnlyList<string> Kingdoms = ["golge", "tuccar", "kahin", "entrikaci"];

    public static bool IsFrame(string? id) => id is not null && Frames.Contains(id);

    /// <summary>Picks look like "tuccar:b".</summary>
    public static bool TryParseBanner(string? pick, out string kingdom, out string design)
    {
        kingdom = design = "";
        if (pick is null) return false;
        var parts = pick.Split(':');
        if (parts.Length != 2 || !Kingdoms.Contains(parts[0]) || !Designs.Contains(parts[1])) return false;
        kingdom = parts[0]; design = parts[1];
        return true;
    }

    /// <summary>The banner design a player wants for <paramref name="kingdom"/> out of their picks ("a" when none).</summary>
    public static string DesignFor(IReadOnlyList<string>? picks, string? kingdom)
    {
        if (picks is null || kingdom is null) return "a";
        foreach (var p in picks)
            if (TryParseBanner(p, out var k, out var d) && k == kingdom) return d;
        return "a";
    }
}
