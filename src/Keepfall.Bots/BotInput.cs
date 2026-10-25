using Keepfall.Views;

namespace Keepfall.Bots;

/// <summary>
/// Everything a bot ever learns: the pictures the server sends the player in its seat. The layout and the room are
/// public; the castle and the map state are that player's own (fog of war already applied).
/// </summary>
public sealed record BotInput(CastleView Castle, MapStateView? Map, MapLayoutView? Layout, RoomView Room, int Seat)
{
    /// <summary>Game seconds since the match began.</summary>
    public double Now => Castle.ElapsedSeconds;
}
