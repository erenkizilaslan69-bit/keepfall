using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>The deck: 4 of the 7 units picked before the match; only those can be made, and only a scout report shows a rival's.</summary>
public class DeckTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static readonly DateTime T0 = new(2026, 10, 28, 12, 0, 0, DateTimeKind.Utc);
    private static readonly string[] Deck = ["okcu", "kesis", "mancinik", "suvari"];

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    [Fact]
    public void A_deck_has_exactly_the_configured_number_of_different_known_units()
    {
        Assert.True(Rules.Deck.Enabled);
        Assert.Equal(4, Rules.Deck.Size);
        Assert.True(Rules.IsValidDeck(Deck));
        Assert.False(Rules.IsValidDeck(["okcu", "kesis", "mancinik"]));
        Assert.False(Rules.IsValidDeck(["okcu", "okcu", "kesis", "mancinik"]));
        Assert.False(Rules.IsValidDeck(["okcu", "kesis", "mancinik", "ejderha"]));
        Assert.False(Rules.IsValidDeck(null));
        Assert.Equal(4, Rules.RandomDeck(new Random(1)).Distinct().Count());
    }

    [Fact]
    public void A_castle_with_a_deck_makes_arms_and_hires_only_its_units()
    {
        var game = new GameState(Rules, ["a", "b"], decks: new Dictionary<string, IReadOnlyList<string>> { ["a"] = Deck });
        var castle = game.CastleOf("a")!;
        Assert.Equal(Deck.OrderBy(i => Rules.FindUnit(i)!.Index), castle.UnitTypes.Select(u => u.Id));
        castle.AddGold(500);
        Assert.False(game.Execute("a", new QueueWeapon("kilicli", 1)).Ok);
        Assert.False(game.Execute("a", new HireMercenary("kalkanli", 1)).Ok);
        Assert.True(game.Execute("a", new HireMercenary("suvari", 1)).Ok);
        Assert.Contains("destende yok", game.Execute("a", new ArmWorkers("mizrakci", 1)).Error);
        // A castle without a deck still makes everything.
        Assert.Equal(7, game.CastleOf("b")!.UnitTypes.Count);
        Assert.True(game.Execute("b", new QueueWeapon("kilicli", 1)).Ok);
    }

    [Fact]
    public void An_invalid_deck_cannot_start_a_match()
    {
        Assert.Throws<ArgumentException>(() => new GameState(Rules, ["a", "b"], decks: new Dictionary<string, IReadOnlyList<string>> { ["a"] = ["okcu"] }));
    }

    [Fact]
    public void A_player_picks_a_deck_in_the_lobby_and_the_rest_get_one_at_the_start()
    {
        var room = new Room("DECK", Rules);
        var a = room.Join("Ali", null, false, T0).Player!;
        var b = room.Join("Bora", null, false, T0).Player!;
        Assert.False(room.SetDeck(a.Token, ["okcu"]).Ok);
        Ok(room.SetDeck(a.Token, Deck));
        Ok(room.SetReady(a.Token, true)); Ok(room.SetReady(b.Token, true));
        Ok(room.Start(a.Token));
        Assert.Equal(Deck, room.CastleOf(a)!.UnitTypes.Select(u => u.Id).OrderBy(i => Array.IndexOf(Deck, i)));
        Assert.Equal(4, room.CastleOf(b)!.UnitTypes.Count); // a random one
        Assert.False(room.SetDeck(a.Token, Deck).Ok); // the match has started
    }

    [Fact]
    public void Bots_get_a_deck_too()
    {
        var room = Room.StartBotMatch("SIM", Rules, new RoomOptions { MinPlayers = 1, Seed = 3 }, [BotDifficulty.Easy, BotDifficulty.Medium]);
        Assert.All(room.Players, p => Assert.Equal(4, room.CastleOf(p)!.UnitTypes.Count));
    }

    [Fact]
    public void A_scout_report_carries_the_rivals_deck_and_nothing_else_does()
    {
        var game = new GameState(Rules, ["a", "b"], prepSeconds: 600, decks: new Dictionary<string, IReadOnlyList<string>> { ["a"] = ["okcu", "kilicli", "mizrakci", "kalkanli"], ["b"] = Deck });
        game.Execute("a", new SendScout("b"));
        for (int t = 0; t < 400 && game.ReportsOf("a").Count == 0; t++) game.Tick(1);
        var report = Assert.Single(game.ReportsOf("a"));
        Assert.Equal(Deck.OrderBy(i => Rules.FindUnit(i)!.Index), report.Deck!);
        Assert.Empty(game.ReportsOf("b"));
    }
}
