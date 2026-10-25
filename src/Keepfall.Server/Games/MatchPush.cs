using Keepfall.Views;
using Microsoft.AspNetCore.SignalR;

namespace Keepfall.Server.Games;

/// <summary>What goes out to the players besides the regular state: notifications and the end of a match.</summary>
public static class MatchPush
{
    /// <summary>E.g. "Kırmızı'nın gözcüsü kaleni gözetledi." — only to the player it is about. Bots have no connection.</summary>
    public static async Task Notifications(IHubClients<IClientProxy> clients, RoomSession session)
    {
        List<(int Seat, string Text)> notes;
        lock (session.Lock)
            notes = session.Room.Players
                .Where(p => !p.IsBot)
                .SelectMany(p => session.Room.TakeNotifications(p).Select(text => (p.Seat, text)))
                .ToList();
        foreach (var (seat, text) in notes)
            await clients.Group(Hubs.GameHub.PlayerGroup(session.Room.Code, seat)).SendAsync("Notification", text);
    }

    /// <summary>The match just ended: final castle states (with summaries), the room with the result, the last notifications and each player's summary.</summary>
    public static async Task End(IHubClients<IClientProxy> clients, RoomSession session)
    {
        await Hubs.GameHub.PushCastles(clients, session);
        RoomView final;
        lock (session.Lock) final = ViewMapper.ToView(session.Room);
        await clients.Group(Hubs.GameHub.RoomGroup(session.Room.Code)).SendAsync("RoomState", final);
        await Notifications(clients, session);
        await Summaries(clients, session);
    }

    /// <summary>Each player gets only their own summary.</summary>
    private static async Task Summaries(IHubClients<IClientProxy> clients, RoomSession session)
    {
        List<(int Seat, SummaryView Summary)> summaries;
        lock (session.Lock)
            summaries = session.Room.Players
                .Where(p => !p.IsBot)
                .Select(p => (p.Seat, ViewMapper.CastleOf(session.Room, p)?.Summary))
                .Where(x => x.Summary is not null)
                .Select(x => (x.Seat, x.Summary!))
                .ToList();
        foreach (var (seat, summary) in summaries)
            await clients.Group(Hubs.GameHub.PlayerGroup(session.Room.Code, seat)).SendAsync("MatchEnded", summary);
    }
}
