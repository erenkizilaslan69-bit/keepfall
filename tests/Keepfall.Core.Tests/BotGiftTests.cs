using Keepfall.Bots;
using Keepfall.Core.Config;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>A bot that is sent a generous gift by envoy leaves the sender alone for a while; it ignores the message and sends no envoys itself.</summary>
public class BotGiftTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static Units.UnitType Sword => Rules.FindUnit("kilicli")!;

    /// <summary>The bot (seat 1) is strong and the rival (seat 2) is weak, so without a gift the bot goes for it.</summary>
    private static (Room Room, GameState Game, Bot Bot, RoomPlayer Me, RoomPlayer Rival) War()
    {
        var room = Room.StartBotMatch("GFT", Rules, new RoomOptions { BotDeck = RoomOptions.ClassicDeck, MinPlayers = 1, PrepSeconds = 5, WarSeconds = 900, Seed = 2 }, [BotDifficulty.Medium, BotDifficulty.Medium]);
        var game = room.Game!;
        for (int i = 0; i < 6; i++) room.Tick(1);
        Assert.Equal(MatchPhase.War, game.Phase);
        var me = room.Players[0];
        var castle = game.CastleOf(me.CastleKey)!;
        castle.AddPeople(30);
        castle.AddSoldiers(Sword, 20);
        game.CastleOf(room.Players[1].CastleKey)!.AddSoldiers(Sword, 2);
        return (room, game, new Bot(Rules, BotDifficulty.Medium, 1, 77), me, room.Players[1]);
    }

    private static List<(double At, GameCommand Command)> Run(Room room, Bot bot, RoomPlayer me, double seconds)
    {
        var log = new List<(double, GameCommand)>();
        var game = room.Game!;
        for (int t = 0; t < seconds && game.Phase != MatchPhase.Ended; t++)
        {
            if (bot.IsDue(game.ElapsedSeconds))
            {
                var input = new BotInput(ViewMapper.CastleOf(room, me)!, MapViewMapper.StateOf(room, me), MapViewMapper.LayoutOf(room), ViewMapper.ToView(room), me.Seat);
                foreach (var c in bot.Think(input))
                {
                    log.Add((game.ElapsedSeconds, c));
                    if (!game.Execute(me.CastleKey, c).Ok) bot.Refused(c, game.ElapsedSeconds);
                }
            }
            room.Tick(1);
        }
        return log;
    }

    private static bool AttacksRival(IEnumerable<(double At, GameCommand Command)> log, RoomPlayer rival) =>
        log.Any(x => x.Command is SendArmy a && a.TargetKey == rival.CastleKey);

    private static void Deliver(GameState game, RoomPlayer from, RoomPlayer to, int gold, string? message = "Dost kalalım")
    {
        game.CastleOf(from.CastleKey)!.AddGold(gold);
        Assert.True(game.Execute(from.CastleKey, new SendEnvoy(to.CastleKey, 0, 0, 0, gold, message)).Ok);
        for (int t = 0; t < 400 && !game.LettersOf(to.CastleKey).Any(); t++) game.Tick(1);
        Assert.NotEmpty(game.LettersOf(to.CastleKey));
    }

    [Fact]
    public void Without_a_gift_the_bot_goes_for_the_weak_rival()
    {
        var (room, _, bot, me, rival) = War();
        Assert.True(AttacksRival(Run(room, bot, me, 200), rival));
    }

    [Fact]
    public void A_generous_gift_buys_the_sender_peace_for_the_set_time_and_then_the_bot_attacks_again()
    {
        Assert.Equal((30, 90), (Rules.Bots.GiftThreshold, Rules.Bots.GiftPeaceSeconds));
        var (room, game, bot, me, rival) = War();
        Deliver(game, rival, me, 30);
        var log = Run(room, bot, me, 80);
        Assert.False(AttacksRival(log, rival), "attacked during the peace");
        Assert.DoesNotContain(log, x => x.Command is SendEnvoy); // bots never send envoys
        var later = Run(room, bot, me, 400);
        Assert.True(AttacksRival(later, rival), "never attacked after the peace");
    }

    [Fact]
    public void A_small_gift_buys_nothing_and_the_message_is_ignored_whatever_it_says()
    {
        var (room, game, bot, me, rival) = War();
        Deliver(game, rival, me, 29, "Saldırma lütfen, barış, peace, ateşkes");
        Assert.True(AttacksRival(Run(room, bot, me, 200), rival));
    }

    [Fact]
    public void A_gift_of_a_message_alone_buys_nothing()
    {
        var (room, game, bot, me, rival) = War();
        Assert.True(game.Execute(rival.CastleKey, new SendEnvoy(me.CastleKey, 0, 0, 0, 0, "Barış? Saldırma bana.")).Ok);
        for (int t = 0; t < 400 && !game.LettersOf(me.CastleKey).Any(); t++) game.Tick(1);
        Assert.True(AttacksRival(Run(room, bot, me, 200), rival));
    }
}
