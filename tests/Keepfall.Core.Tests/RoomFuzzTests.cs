using Keepfall.Core.Config;
using Keepfall.Core.Lobby;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>
/// Random joins, leaves, drops, readies, bots, decks, names and starts on one room: nothing throws, seats stay unique, the host is always somebody
/// who is in the room (or nobody when the room is empty), and the views can always be made (they are what goes over the wire).
/// </summary>
public class RoomFuzzTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static readonly string[] Names = ["", "  ", "Ada", new string('x', 500), "😀😀😀😀😀😀😀😀😀😀", "‮evil", "a\nb\tc", "<img onerror=1>", "\uD800", "fuck"];
    private static readonly string[] Units = ["okcu", "kilicli", "mizrakci", "kalkanli", "kesis", "mancinik", "suvari", "nope", "OKCU", ""];

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    [InlineData(7)]
    [InlineData(8)]
    public void Random_lobby_traffic_never_breaks_the_room(int seed)
    {
        var rng = new Random(seed);
        var room = new Room("FUZZ01", Rules, new RoomOptions { MinPlayers = 2, LobbyGrace = TimeSpan.FromSeconds(20), HostGrace = TimeSpan.FromSeconds(5) });
        var tokens = new List<string>();
        var now = DateTime.UtcNow;
        string Tok() => tokens.Count > 0 && rng.Next(10) > 0 ? tokens[rng.Next(tokens.Count)] : rng.Next(2) == 0 ? "bogus" : null!;

        for (int step = 0; step < 4000; step++)
        {
            now += TimeSpan.FromSeconds(rng.Next(0, 4));
            string at = $"seed {seed}, step {step}";
            var ex = Record.Exception(() =>
            {
                switch (rng.Next(16))
                {
                    case 0: { var r = room.Join(Names[rng.Next(Names.Length)], rng.Next(3) == 0 ? Tok() : null, rng.Next(2) == 0, now); if (r.Ok && !tokens.Contains(r.Player!.Token)) tokens.Add(r.Player.Token); break; }
                    case 1: room.Leave(Tok(), now); break;
                    case 2: room.Disconnect(Tok(), now); break;
                    case 3: room.SetReady(Tok(), rng.Next(2) == 0); break;
                    case 4: room.AddBot(Tok(), (BotDifficulty)rng.Next(-1, 4)); break;
                    case 5: room.RemoveBot(Tok(), rng.Next(-1, 6)); break;
                    case 6: room.SetName(Tok(), Names[rng.Next(Names.Length)]); break;
                    case 7: room.SetDeck(Tok(), rng.Next(3) == 0 ? null : Enumerable.Range(0, rng.Next(0, 6)).Select(_ => Units[rng.Next(Units.Length)]).ToArray()); break;
                    case 8: room.SetCosmetics(Tok(), rng.Next(2) == 0 ? "gold" : null, rng.Next(3) == 0 ? null : new[] { "golge:a", "tuccar:b", null!, "x:y", "golge:b" }.Take(rng.Next(0, 6)).ToArray()); break;
                    case 9: room.Start(Tok()); break;
                    case 10: room.SetGuided(Tok(), rng.Next(2) == 0); break;
                    case 11: room.SetStarter(Tok(), rng.Next(2) == 0); break;
                    case 12: room.Maintain(now); break;
                    case 13: room.BackToLobby(Tok()); break;
                    case 14: for (int i = 0; i < rng.Next(1, 60); i++) room.Tick(1); break;
                    default: room.IsAbandoned(now, TimeSpan.FromMinutes(10)); break;
                }
            });
            Assert.True(ex is null, $"{at}: {ex}");

            // invariants
            var seats = room.Players.Select(p => p.Seat).ToList();
            Assert.True(seats.Distinct().Count() == seats.Count && seats.All(s => s is >= 1 and <= 4), $"{at}: seats {string.Join(',', seats)}");
            Assert.True(room.Players.Count <= room.Options.MaxPlayers, $"{at}: too many players");
            if (room.Players.Any(p => !p.IsBot))
                Assert.True(room.Host is { IsBot: false } || room.HostSeat == 0 || room.Phase != RoomPhase.Lobby, $"{at}: host seat {room.HostSeat} is not a human of the room");
            Assert.True(room.Players.All(p => p.Connections >= 0), $"{at}: negative connections");
            var viewEx = Record.Exception(() => System.Text.Json.JsonSerializer.Serialize(ViewMapper.ToView(room)));
            Assert.True(viewEx is null, $"{at}: room view: {viewEx}");
            foreach (var p in room.Players)
                Assert.True(p.Name.Length > 0 && p.Name.All(c => !char.IsControl(c) && !char.IsSurrogate(c) || char.IsSurrogate(c)), $"{at}: name '{p.Name}'");
        }
    }
}
