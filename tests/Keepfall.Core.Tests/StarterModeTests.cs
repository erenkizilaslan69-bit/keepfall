using Keepfall.Core;
using Keepfall.Core.Challenges;
using Keepfall.Core.Config;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>Starter mode (the first matches): no kingdoms, the classic deck, fixed battle rows, only for a single human; a multiplayer room is untouched.</summary>
public class StarterModeTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static (Room Room, RoomPlayer Human) Lobby()
    {
        var room = new Room("ABCDEF", Rules, new RoomOptions { MinPlayers = 1 });
        return (room, room.Join("Ada", null, false, DateTime.UtcNow).Player!);
    }

    [Fact]
    public void A_single_human_in_starter_mode_has_no_kingdom_the_classic_deck_and_locked_rows()
    {
        var (room, human) = Lobby();
        room.AddBot(human.Token, BotDifficulty.Easy);
        Assert.True(room.SetStarter(human.Token, true).Ok);
        room.SetReady(human.Token, true);
        Assert.True(room.Start(human.Token).Ok);

        Assert.False(room.Game!.HasKingdoms);
        Assert.Null(room.Game.FactionOf(human.CastleKey));
        Assert.Equal(RoomOptions.ClassicDeck, human.Deck);
        Assert.True(ViewMapper.ToView(room).Starter);
        Assert.True(room.Game.RowsLocked);
    }

    [Fact]
    public void A_chosen_deck_stays_and_the_default_is_off()
    {
        var (room, human) = Lobby();
        room.AddBot(human.Token, BotDifficulty.Easy);
        room.SetDeck(human.Token, ["kesis", "okcu", "kalkanli", "kilicli"]);
        room.SetReady(human.Token, true);
        Assert.True(room.Start(human.Token).Ok);
        Assert.True(room.Game!.HasKingdoms);
        Assert.False(ViewMapper.ToView(room).Starter);
        Assert.False(room.Game.RowsLocked);
        Assert.Contains("kesis", human.Deck!);
    }

    [Fact]
    public void Starter_mode_is_ignored_when_two_humans_play()
    {
        var (room, human) = Lobby();
        var bob = room.Join("Bob", null, false, DateTime.UtcNow).Player!;
        room.SetStarter(human.Token, true);
        room.SetReady(human.Token, true);
        room.SetReady(bob.Token, true);
        Assert.True(room.Start(human.Token).Ok);
        Assert.True(room.Game!.HasKingdoms);
        Assert.False(ViewMapper.ToView(room).Starter);
        Assert.False(room.Game.RowsLocked);
    }

    [Fact]
    public void The_first_two_challenge_cards_are_starter_cards_and_full_rules_turn_it_off()
    {
        var catalog = ChallengeCatalog.LoadBeside(BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)!, Rules);
        Assert.True(catalog.All[0].Starter);
        Assert.True(catalog.All[1].Starter);
        Assert.False(catalog.All[2].Starter);

        var (room, human) = Lobby();
        Assert.True(room.StartChallenge(human.Token, catalog.All[0]).Ok);
        Assert.False(room.Game!.HasKingdoms);

        var (room2, human2) = Lobby();
        Assert.True(room2.StartChallenge(human2.Token, catalog.All[0], fullRules: true).Ok);
        Assert.True(room2.Game!.HasKingdoms);
        Assert.Equal("tuccar", room2.Game.FactionOf(human2.CastleKey));
    }

    [Fact]
    public void Locked_rows_ignore_what_the_player_sends()
    {
        var (room, human) = Lobby();
        room.AddBot(human.Token, BotDifficulty.Easy);
        room.SetStarter(human.Token, true);
        room.SetReady(human.Token, true);
        room.Start(human.Token);
        // Two units in the same row would be refused in a normal match; here the rows are not even read.
        var rows = new Dictionary<string, Row> { ["okcu"] = Row.First, ["kilicli"] = Row.First };
        Assert.True(room.Game!.Execute(human.CastleKey, new SetDefense(rows, null)).Ok);
        Assert.Empty(room.Game.CastleOf(human.CastleKey)!.DefenseRows);
    }
}
