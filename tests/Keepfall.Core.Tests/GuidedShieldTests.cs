using Keepfall.Core;
using Keepfall.Core.Config;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>The guided first match: for the first minutes of the war nobody may send an army, a phantom or a hired camp at the human's castle.</summary>
public class GuidedShieldTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string Human = "o1", Bot = "o2";

    private static GameState WarMatch()
    {
        var keys = new List<string> { Human, Bot };
        var game = new GameState(Rules, keys, 10, 900, new Random(1), new Dictionary<string, Corner> { [Human] = Corner.NorthWest, [Bot] = Corner.SouthEast });
        game.ShieldedKeys.Add(Human);
        for (int i = 0; i < 10; i++) game.Tick(1);
        Assert.Equal(MatchPhase.War, game.Phase);
        return game;
    }

    [Fact]
    public void The_shield_is_the_configured_length_and_shows_in_the_room_view_only_while_it_holds()
    {
        Assert.Equal(240, Rules.Match.GuidedShieldSeconds);
        var game = WarMatch();
        Assert.True(game.IsShielded(Human));
        Assert.False(game.IsShielded(Bot));
        for (int i = 0; i < 239; i++) game.Tick(1);
        Assert.True(game.IsShielded(Human));
        for (int i = 0; i < 3; i++) game.Tick(1);
        Assert.False(game.IsShielded(Human));
    }

    [Fact]
    public void Nobody_can_send_an_army_at_a_shielded_castle_until_the_shield_ends()
    {
        var game = WarMatch();
        game.CastleOf(Bot)!.AddSoldiers(Rules.FindUnit("kilicli")!, 3);
        var army = new SendArmy(Human, new Dictionary<string, int> { ["kilicli"] = 3 });
        var refused = game.Execute(Bot, army);
        Assert.False(refused.Ok);
        Assert.Contains("rehberli", refused.Error);
        Assert.Empty(game.ArmiesOf(Bot));
        for (int i = 0; i < 241; i++) game.Tick(1);
        Assert.True(game.Execute(Bot, army).Ok);
    }

    [Fact]
    public void The_human_may_attack_the_bot_during_the_shield()
    {
        var game = WarMatch();
        game.CastleOf(Human)!.AddSoldiers(Rules.FindUnit("kilicli")!, 3);
        Assert.True(game.Execute(Human, new SendArmy(Bot, new Dictionary<string, int> { ["kilicli"] = 3 })).Ok);
    }

    [Fact]
    public void A_room_honours_the_guided_flag_only_for_a_single_human()
    {
        var one = new Room("ABCD", Rules);
        var host = one.Join("Aylin", null, false, DateTime.UtcNow).Player!;
        Assert.True(one.SetGuided(host.Token, true).Ok);
        one.AddBot(host.Token, BotDifficulty.Easy);
        one.SetReady(host.Token, true);
        Assert.True(one.Start(host.Token).Ok);
        Assert.Contains(host.CastleKey, one.Game!.ShieldedKeys);
        Assert.Equal(Rules.Match.GuidedPrepSeconds, one.Game!.PrepSeconds); // the tutorial's preparation is the long one (8 minutes, plain speed)
        Assert.Equal(480, one.Game!.PrepSeconds);

        var two = new Room("WXYZ", Rules, new RoomOptions { MinPlayers = 2 });
        var a = two.Join("A", null, false, DateTime.UtcNow).Player!;
        var b = two.Join("B", null, false, DateTime.UtcNow).Player!;
        two.SetGuided(a.Token, true);
        two.SetReady(a.Token, true);
        two.SetReady(b.Token, true);
        Assert.True(two.Start(a.Token).Ok);
        Assert.Empty(two.Game!.ShieldedKeys);
        Assert.Equal(Rules.Match.ShortModePrepSeconds, two.Game!.PrepSeconds); // a normal match keeps the five minutes
    }
}
