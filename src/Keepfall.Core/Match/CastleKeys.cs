namespace Keepfall.Core.Match;

/// <summary>A castle's key in the match by the seat of the player who owns it (the same key commands name their target by).</summary>
public static class CastleKeys
{
    public static string Of(int seat) => $"o{seat}";
}
