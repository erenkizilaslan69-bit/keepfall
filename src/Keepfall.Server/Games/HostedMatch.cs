using Keepfall.Core.Lobby;
using Microsoft.AspNetCore.SignalR;

namespace Keepfall.Server.Games;

/// <summary>
/// The friend-hosted game (Steam / LAN: the match runs on the computer of the player who made the room). When that player quits, the match cannot go on:
/// it is ended where it stands, and everybody who is still connected gets the usual end of a match (final castle, result, summary with the "who fooled
/// whom" timeline, progress) plus one line that says why.
/// </summary>
public static class HostedMatch
{
    /// <summary>The text the page shows (and translates) when the host has gone.</summary>
    public const string HostLeftNote = "Ev sahibi oyundan ayrıldı: maç burada bitti.";

    /// <summary>A match is running and somebody other than <paramref name="hostSeat"/> is a connected human.</summary>
    public static bool HasGuests(Room room, int hostSeat) =>
        room.Phase is RoomPhase.Preparation or RoomPhase.War && room.Players.Any(p => !p.IsBot && p.Connected && p.Seat != hostSeat);

    /// <summary>Ends the room's running match and tells everybody; false if there was none.</summary>
    public static async Task<bool> End(IHubClients<IClientProxy> clients, RoomSession session)
    {
        bool ended;
        lock (session.Lock) ended = session.Room.Abort();
        if (!ended) return false;
        await clients.Group(Hubs.GameHub.RoomGroup(session.Room.Code)).SendAsync("HostLeft", HostLeftNote);
        await MatchPush.End(clients, session);
        return true;
    }
}
