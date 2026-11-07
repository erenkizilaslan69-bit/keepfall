using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>
/// A command over the wire can carry any number for an enum and any size of table. These must be refused cleanly,
/// and (regression) a defence row of 99 must never reach the battle simulation.
/// </summary>
public class CommandGuardTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static (Room Room, RoomPlayer Me, RoomPlayer Other) Match()
    {
        var room = new Room("GUARD1", Rules, new RoomOptions { Seed = 11, Kingdoms = false, BotDeck = RoomOptions.ClassicDeck });
        var me = room.Join("Ada", null, false, DateTime.UtcNow).Player!;
        var other = room.Join("Bob", null, false, DateTime.UtcNow).Player!;
        room.SetDeck(me.Token, RoomOptions.ClassicDeck);
        room.SetDeck(other.Token, RoomOptions.ClassicDeck);
        room.SetReady(me.Token, true);
        room.SetReady(other.Token, true);
        Assert.True(room.Start(me.Token).Ok);
        return (room, me, other);
    }

    [Fact]
    public void Out_of_range_enum_numbers_are_refused_not_thrown()
    {
        var (room, me, other) = Match();
        var target = Room.CastleKeyOf(other.Seat);
        var bad = new GameCommand[]
        {
            new MoveWorkers((Job)99, Job.Farmer, 1),
            new MoveWorkers(Job.Idle, (Job)(-1), 1),
            new ArmWorkers("okcu", 1, (Job)42),
            new UpgradeBuilding((BuildingType)77),
            new SendScout(target, (Job)9),
            new SendExplore((Corner)12, Job.Idle),
            new SendArmy(target, new Dictionary<string, int> { ["okcu"] = 1 }, null, null, (ArmyMode)5),
            new SendArmy(target, new Dictionary<string, int> { ["okcu"] = 1 }, new Dictionary<string, Row> { ["okcu"] = (Row)99 }),
            new SendArmyToSite("x", new Dictionary<string, int>(), new Dictionary<string, Row> { ["okcu"] = (Row)(-3) }),
            new SetDefense(new Dictionary<string, Row> { ["okcu"] = (Row)99 }, null),
        };
        foreach (var command in bad)
        {
            var result = room.Execute(me.Token, command);
            Assert.False(result.Ok, command.ToString());
        }
    }

    [Fact]
    public void A_huge_or_long_table_is_refused()
    {
        var (room, me, other) = Match();
        var target = Room.CastleKeyOf(other.Seat);
        var many = Enumerable.Range(0, 5000).ToDictionary(i => $"u{i}", _ => 1);
        Assert.False(room.Execute(me.Token, new SendArmy(target, many, null, null)).Ok);
        Assert.False(room.Execute(me.Token, new SetFakeReport(many)).Ok);
        Assert.False(room.Execute(me.Token, new BribeArmy(new string('a', 100_000), 1)).Ok);
        Assert.False(room.Execute(me.Token, new RedirectArmy(1, new string('b', 5000), null)).Ok);
    }

    [Fact]
    public void A_bad_defence_row_cannot_break_a_later_battle()
    {
        var (room, me, other) = Match();
        Assert.False(room.Execute(other.Token, new SetDefense(new Dictionary<string, Row> { ["okcu"] = (Row)99 }, null)).Ok);
        // The defence is still the normal one, so the rest of the match runs without throwing.
        var ex = Record.Exception(() => { for (int i = 0; i < 30; i++) room.Tick(1); });
        Assert.Null(ex);
    }

    [Fact]
    public void A_bot_cannot_be_added_with_a_made_up_difficulty()
    {
        var room = new Room("GUARD2", Rules, new RoomOptions { MinPlayers = 1 });
        var me = room.Join("Ada", null, false, DateTime.UtcNow).Player!;
        Assert.False(room.AddBot(me.Token, (BotDifficulty)99).Ok);
        Assert.Single(room.Players);
        Assert.True(room.AddBot(me.Token, BotDifficulty.Hard).Ok);
    }

    [Fact]
    public void Normal_commands_still_pass_the_guard()
    {
        Assert.Null(CommandGuard.Check(new MoveWorkers(Job.Idle, Job.Farmer, 1)));
        Assert.Null(CommandGuard.Check(new SetDefense(new Dictionary<string, Row> { ["okcu"] = Row.Second }, "okcu")));
        Assert.Null(CommandGuard.Check(new SendArmy("o2", new Dictionary<string, int> { ["okcu"] = 3 }, null, null)));
        Assert.NotNull(CommandGuard.Check(null));
    }
}
