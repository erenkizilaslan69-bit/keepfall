using Keepfall.Bots;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>The hard bot: the same pictures and commands as any player, only better decisions (quicker, weapons kept in the store, counter units).</summary>
public class HardBotTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static Units.UnitType Sword => Rules.FindUnit("kilicli")!;

    private static (Room Room, GameState Game, Bot Bot, RoomPlayer Me, RoomPlayer Rival) War(BotDifficulty level)
    {
        var room = Room.StartBotMatch("HRD", Rules, new RoomOptions { BotDeck = RoomOptions.ClassicDeck, MinPlayers = 1, PrepSeconds = 5, WarSeconds = 900, Seed = 2 }, [level, BotDifficulty.Medium]);
        var game = room.Game!;
        for (int i = 0; i < 6; i++) room.Tick(1);
        Assert.Equal(MatchPhase.War, game.Phase);
        return (room, game, new Bot(Rules, level, 1, 77), room.Players[0], room.Players[1]);
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

    [Fact]
    public void The_hard_level_is_quicker_and_makes_no_mistakes_and_the_others_are_untouched()
    {
        var hard = Rules.Bots.Of(BotDifficulty.Hard);
        var medium = Rules.Bots.Of(BotDifficulty.Medium);
        Assert.True(hard.ThinkMax < medium.ThinkMax && hard.ReactMax < medium.ReactMax);
        Assert.Equal(0, hard.Mistake);
        Assert.Equal(0, hard.EcoMistake);
        Assert.Equal(0, hard.Slack);
        Assert.True(hard.HoldWeapons && hard.CounterUnits && hard.Opportunist && hard.UpgradeEarly);
        Assert.False(medium.HoldWeapons || medium.CounterUnits || medium.Opportunist || medium.UpgradeEarly);
        Assert.Equal(1.0, medium.ScoutFactor);
    }

    [Fact]
    public void The_hard_level_prepares_ahead_where_arming_takes_time_and_the_others_do_not()
    {
        Assert.True(Rules.Match.ArmSeconds > 0);
        var hard = Rules.Bots.Of(BotDifficulty.Hard);
        Assert.True(hard.Foresight && hard.GarrisonShare > 0);
        Assert.False(Rules.Bots.Of(BotDifficulty.Medium).Foresight);
        Assert.Equal(0, Rules.Bots.Of(BotDifficulty.Medium).GarrisonShare);
    }

    [Fact]
    public void A_hard_bot_keeps_a_garrison_armed_from_what_it_knows_of_the_biggest_rival_and_the_rest_stays_in_the_store()
    {
        var (room, game, bot, me, rival) = War(BotDifficulty.Hard);
        var castle = game.CastleOf(me.CastleKey)!;
        castle.AddWeapons(Sword, 30);
        castle.AddPeople(30);
        game.CastleOf(rival.CastleKey)!.AddSoldiers(Sword, 60); // too strong to attack
        Assert.True(game.Execute(me.CastleKey, new SendScout(rival.CastleKey)).Ok);
        Run(room, bot, me, 250);
        int garrison = (int)Math.Ceiling(30 * Rules.Bots.Of(BotDifficulty.Hard).GarrisonShare);
        Assert.True(castle.SoldierCount >= garrison, $"{castle.SoldierCount} soldiers at home, wanted {garrison}");
        Assert.True(castle.Weapons[Sword] > 0, "the rest of the weapons should stay in the store");
    }

    [Fact]
    public void A_hard_bot_arms_only_the_weapons_it_sends_out_where_a_medium_one_arms_them_all()
    {
        foreach (var level in new[] { BotDifficulty.Medium, BotDifficulty.Hard })
        {
            var (room, game, bot, me, _) = War(level);
            var castle = game.CastleOf(me.CastleKey)!;
            castle.AddWeapons(Sword, 6);
            castle.AddPeople(6);
            var log = Run(room, bot, me, 25 + (int)Rules.Match.ArmSeconds);
            int armed = log.Where(x => x.Command is ArmWorkers).Sum(x => ((ArmWorkers)x.Command).Count);
            int sent = log.Sum(x => x.Command switch { SendArmyToSite s => s.Units.Values.Sum(), SendArmy a => a.Units.Values.Sum(), _ => 0 });
            if (level == BotDifficulty.Medium) Assert.True(armed >= 6, $"medium armed {armed}");
            else Assert.True(armed <= sent, $"hard armed {armed} but sent only {sent}");
        }
    }

    [Fact]
    public void When_a_hard_bot_attacks_it_arms_the_weapons_it_needs_first_and_sends_them_in_the_same_go()
    {
        var (room, game, bot, me, rival) = War(BotDifficulty.Hard);
        var castle = game.CastleOf(me.CastleKey)!;
        castle.AddWeapons(Sword, 20);
        castle.AddPeople(20);
        game.CastleOf(rival.CastleKey)!.AddSoldiers(Sword, 3); // a weak rival whose size it has learnt
        Assert.True(game.Execute(me.CastleKey, new SendScout(rival.CastleKey)).Ok);
        var log = Run(room, bot, me, 200);
        var send = log.FirstOrDefault(x => x.Command is SendArmy { Mode: ArmyMode.Attack });
        Assert.True(send.Command is not null, string.Join(" | ", log.Select(x => $"{x.At:0} {x.Command.GetType().Name}").Take(12)));
        var arms = log.Where(x => x.Command is ArmWorkers && x.At <= send.At).Sum(x => ((ArmWorkers)x.Command).Count);
        Assert.True(arms >= ((SendArmy)send.Command).Units.Values.Sum(), $"armed {arms} for an army of {((SendArmy)send.Command).Units.Values.Sum()}");
    }
}
