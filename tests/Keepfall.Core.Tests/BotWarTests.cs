using Keepfall.Bots;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>Attack and defence: what the bot does in the war, and when.</summary>
public class BotWarTests
{
    // Easy is pinned to the plain poor bot (see PoorBotRules); Medium is whatever balance.json says.
    private static readonly GameRules Rules = PoorBotRules.From(BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı.")));

    private static UnitType U(string id) => Rules.FindUnit(id)!;

    /// <summary>Two castles, the war on (the preparation is five seconds). Only seat 1 has a bot brain; the test plays seat 2 by hand.</summary>
    private static (Room Room, GameState Game, Bot Bot, RoomPlayer Me, RoomPlayer Rival) War(BotDifficulty level, double war = 600, int seed = 2)
    {
        var room = Room.StartBotMatch("WAR", Rules, new RoomOptions { MinPlayers = 1, PrepSeconds = 5, WarSeconds = war, Seed = seed }, [level, level]);
        var game = room.Game!;
        for (int i = 0; i < 6; i++) room.Tick(1);
        Assert.Equal(MatchPhase.War, game.Phase);
        return (room, game, new Bot(Rules, level, 1, 77), room.Players[0], room.Players[1]);
    }

    private static List<(double At, GameCommand Command)> Run(Room room, Bot bot, RoomPlayer me, double seconds, Action<double>? each = null)
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
            each?.Invoke(game.ElapsedSeconds);
            room.Tick(1);
        }
        return log;
    }

    private static void Soldiers(GameState game, string key, int sword, int shield, int archer, int spear = 0)
    {
        var c = game.CastleOf(key)!;
        c.AddSoldiers(U("kilicli"), sword);
        c.AddSoldiers(U("kalkanli"), shield);
        c.AddSoldiers(U("okcu"), archer);
        c.AddSoldiers(U("mizrakci"), spear);
    }

    [Fact]
    public void A_warning_makes_the_bot_arm_its_stored_weapons_and_line_up_after_its_reaction_time()
    {
        var (room, game, bot, me, rival) = War(BotDifficulty.Medium);
        game.CastleOf(me.CastleKey)!.AddWeapons(U("kilicli"), 4);
        game.CastleOf(me.CastleKey)!.AddWeapons(U("okcu"), 2);
        game.CastleOf(me.CastleKey)!.AddPeople(8); // idle people to arm
        Soldiers(game, rival.CastleKey, 12, 4, 4);
        Assert.True(game.Execute(rival.CastleKey, new SendArmy(me.CastleKey, new Dictionary<string, int> { ["kilicli"] = 12, ["kalkanli"] = 4, ["okcu"] = 4 })).Ok);

        double warned = -1;
        var log = Run(room, bot, me, 40, now =>
        {
            if (warned < 0 && ViewMapper.CastleOf(room, me)!.War.Incoming.Count > 0) warned = now;
        });
        Assert.True(warned > 0, "the warning never came");

        var arm = log.Where(x => x.Command is ArmWorkers).ToList();
        var line = log.Where(x => x.Command is SetDefense).ToList();
        Assert.NotEmpty(arm);
        Assert.NotEmpty(line);
        var level = Rules.Bots.Medium;
        // The stored weapons were armed as soon as the war began; lining up for this attack waits for the bot to notice it.
        Assert.True(line.Min(x => x.At) >= warned + level.ReactMin - 1, $"lined up at {line.Min(x => x.At)}, warned at {warned}");
        Assert.True(line.Min(x => x.At) <= warned + level.ReactMax + level.ThinkMax + 2, $"lined up too late: {line.Min(x => x.At)} (warned {warned})");
        Assert.Equal(6, game.CastleOf(me.CastleKey)!.Soldiers.Values.Sum() - 0); // all the stored weapons are soldiers now
    }

    [Fact]
    public void A_poor_bot_reacts_later_and_only_arms_and_lines_up()
    {
        var (room, game, bot, me, rival) = War(BotDifficulty.Easy);
        game.CastleOf(me.CastleKey)!.AddWeapons(U("kilicli"), 3);
        game.CastleOf(me.CastleKey)!.AddPeople(5);
        game.CastleOf(me.CastleKey)!.AddGold(300);
        Soldiers(game, rival.CastleKey, 15, 0, 0);
        Assert.True(game.Execute(rival.CastleKey, new SendArmy(me.CastleKey, new Dictionary<string, int> { ["kilicli"] = 15 })).Ok);
        var log = Run(room, bot, me, 40);
        Assert.Contains(log, x => x.Command is ArmWorkers);
        Assert.DoesNotContain(log, x => x.Command is RecallArmy || x.Command is SendArmy { Mode: ArmyMode.Intercept });
        Assert.True(game.CastleOf(me.CastleKey)!.Stats.MercenariesHired < 6); // it hires one at a time, not a whole army
    }

    [Fact]
    public void A_threatened_bot_spends_its_gold_on_soldiers_at_once()
    {
        var (room, game, bot, me, rival) = War(BotDifficulty.Medium);
        game.CastleOf(me.CastleKey)!.AddGold(200);
        Soldiers(game, me.CastleKey, 4, 2, 2);
        Soldiers(game, rival.CastleKey, 14, 4, 4);
        Assert.True(game.Execute(rival.CastleKey, new SendArmy(me.CastleKey, new Dictionary<string, int> { ["kilicli"] = 14, ["kalkanli"] = 4, ["okcu"] = 4 })).Ok);
        Run(room, bot, me, 30);
        Assert.True(game.CastleOf(me.CastleKey)!.Stats.MercenariesHired >= 4, $"hired {game.CastleOf(me.CastleKey)!.Stats.MercenariesHired}");
    }

    [Fact]
    public void A_strong_bot_finds_out_what_the_rival_has_and_attacks_when_it_wins()
    {
        var (room, game, bot, me, rival) = War(BotDifficulty.Medium, war: 900);
        Soldiers(game, me.CastleKey, 14, 6, 6, 4); // 30
        Soldiers(game, rival.CastleKey, 3, 1, 1);  // 5
        var log = Run(room, bot, me, 260);
        var attack = log.FirstOrDefault(x => x.Command is SendArmy { Mode: ArmyMode.Attack });
        Assert.NotNull(attack.Command);
        Assert.Contains(log, x => x.Command is SendScout && x.At <= attack.At); // it looked first
        Assert.True(game.BattlesOf(me.CastleKey).Any(b => b.Kind == BattleKind.Siege && b.Winner == BattleWinner.Attacker));
        // Some soldiers stayed home.
        var sent = ((SendArmy)attack.Command).Units.Values.Sum();
        Assert.True(sent < 30 && sent >= 5, $"sent {sent}");
    }

    [Fact]
    public void A_bot_does_not_attack_a_rival_that_is_clearly_stronger()
    {
        var (room, game, bot, me, rival) = War(BotDifficulty.Medium, war: 600);
        Soldiers(game, me.CastleKey, 4, 2, 2);
        Soldiers(game, rival.CastleKey, 16, 8, 8);
        var log = Run(room, bot, me, 400);
        Assert.DoesNotContain(log, x => x.Command is SendArmy { Mode: ArmyMode.Attack });
        Assert.Contains(log, x => x.Command is SendScout); // but it keeps watching
    }

    [Fact]
    public void Nobody_attacks_a_castle_in_the_preparation()
    {
        var room = Room.StartBotMatch("PRE", Rules, new RoomOptions { MinPlayers = 1, PrepSeconds = 600, WarSeconds = 300, Seed = 4 }, [BotDifficulty.Medium, BotDifficulty.Medium]);
        var host = new BotHost.BotHost(Rules, 4);
        foreach (var p in room.Players) Soldiers(room.Game!, p.CastleKey, 20, 10, 10);
        for (int t = 0; t < 590; t++) room.Tick(1, dt => host.Step(room, dt));
        Assert.All(room.Players, p => Assert.Equal(0, host.Stats[p.Seat]["attacks"]));
        Assert.All(room.Players, p => Assert.Empty(room.Game!.BattlesOf(p.CastleKey).Where(b => b.Kind == BattleKind.Siege)));
    }

    [Fact]
    public void A_poor_bot_goes_by_a_head_count_and_sends_nearly_everything()
    {
        var (room, game, bot, me, rival) = War(BotDifficulty.Easy, war: 900);
        Soldiers(game, me.CastleKey, 6, 3, 2, 1); // 12
        Soldiers(game, rival.CastleKey, 4, 2, 2); // 8
        var log = Run(room, bot, me, 400);
        var attack = log.FirstOrDefault(x => x.Command is SendArmy { Mode: ArmyMode.Attack });
        Assert.True(attack.Command is not null, string.Join(" | ", log.Select(x => $"{x.At:0} {x.Command}").Take(15)));
        Assert.True(((SendArmy)attack.Command).Units.Values.Sum() >= 7, $"sent {((SendArmy)attack.Command).Units.Values.Sum()}: it keeps hardly anyone at home");
    }
}
