using Keepfall.Bots;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>The economy, building and production parts of the bot's mind, on real castles.</summary>
public class BotModuleTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    /// <summary>Two bots in a started match (the first one is the one under test; nobody plays it but the test).</summary>
    private static Room Match(double prep = 600, double war = 300, int seed = 3)
    {
        var room = Room.StartBotMatch("MOD", Rules, new RoomOptions { MinPlayers = 1, PrepSeconds = prep, WarSeconds = war, Seed = seed },
            [BotDifficulty.Medium, BotDifficulty.Medium]);
        return room;
    }

    private static IReadOnlyList<GameCommand> ThinkOnce(Bot bot, Room room, RoomPlayer who)
    {
        var input = new BotInput(ViewMapper.CastleOf(room, who)!, MapViewMapper.StateOf(room, who), MapViewMapper.LayoutOf(room), ViewMapper.ToView(room), who.Seat);
        var commands = bot.Think(input);
        foreach (var c in commands) room.Game!.Execute(who.CastleKey, c);
        return commands;
    }

    private static int Jobs(Room room, string key, Job job) => room.Game!.CastleOf(key)!.Workers[job];

    [Fact]
    public void The_first_think_puts_everybody_to_work_within_each_buildings_room()
    {
        var room = Match();
        var me = room.Players[0];
        var bot = new Bot(Rules, BotDifficulty.Medium, 1, 1);
        ThinkOnce(bot, room, me);

        var castle = room.Game!.CastleOf(me.CastleKey)!;
        Assert.Equal(0, castle.Workers[Job.Idle]);
        Assert.All(new[] { Job.Farmer, Job.Lumberjack, Job.Miner }, j => Assert.InRange(castle.Workers[j], 1, castle.Capacity(Building.Of(j))));
        Assert.Equal(0, castle.Workers[Job.Blacksmith]); // nothing to forge yet
        Assert.True(castle.GrowthEnabled);
    }

    [Fact]
    public void A_bot_that_would_starve_moves_people_to_the_farm()
    {
        var room = Match();
        var me = room.Players[0];
        var game = room.Game!;
        var bot = new Bot(Rules, BotDifficulty.Medium, 1, 1);
        ThinkOnce(bot, room, me);
        // The farmers leave for the lumber camp and a lot of soldiers appear: a big appetite and nobody farming.
        Assert.True(game.Execute(me.CastleKey, new MoveWorkers(Job.Farmer, Job.Idle, game.CastleOf(me.CastleKey)!.Workers[Job.Farmer])).Ok);
        game.CastleOf(me.CastleKey)!.AddSoldiers(Rules.FindUnit("kilicli")!, 12);

        for (int t = 0; t < 30; t++) { room.Tick(1); if (bot.IsDue(game.ElapsedSeconds)) ThinkOnce(bot, room, me); }
        var castle = game.CastleOf(me.CastleKey)!;
        Assert.True(castle.Workers[Job.Farmer] >= castle.Capacity(BuildingType.Farm) - 1, $"only {castle.Workers[Job.Farmer]} farmers");
    }

    [Fact]
    public void A_full_building_with_idle_people_waiting_gets_upgraded_when_it_can_be_paid()
    {
        var room = Match();
        var me = room.Players[0];
        var game = room.Game!;
        var bot = new Bot(Rules, BotDifficulty.Medium, 1, 1);
        ThinkOnce(bot, room, me); // everybody to work: the farm is full (4 of 4)
        game.CastleOf(me.CastleKey)!.AddPeople(4); // idle people with no room to work

        var commands = new List<GameCommand>();
        for (int t = 0; t < 12 && !commands.OfType<UpgradeBuilding>().Any(); t++)
        {
            room.Tick(1);
            if (bot.IsDue(game.ElapsedSeconds)) commands.AddRange(ThinkOnce(bot, room, me));
        }
        var upgrade = Assert.Single(commands.OfType<UpgradeBuilding>());
        Assert.Contains(upgrade.Building, new[] { BuildingType.Farm, BuildingType.LumberCamp, BuildingType.Mine });
        Assert.True(game.CastleOf(me.CastleKey)!.Building(upgrade.Building).IsUpgrading);
    }

    [Fact]
    public void Weapons_wait_until_the_army_phase_and_come_in_the_mix_the_balance_file_asks_for()
    {
        var room = Match(prep: 600, war: 300);
        var host = new BotHost.BotHost(Rules, 1);
        int firstWeaponAt = -1;
        for (int t = 0; t < 560; t++)
        {
            room.Tick(1, dt => host.Step(room, dt));
            var c = ViewMapper.CastleOf(room, room.Players[0])!;
            if (firstWeaponAt < 0 && c.Units.Sum(u => u.Weapons) + c.Queue.Count > 0) firstWeaponAt = t;
        }
        Assert.True(firstWeaponAt >= 600 * Rules.Bots.WeaponsFrom - 5, $"forging began at {firstWeaponAt}");

        var castle = room.Game!.CastleOf(room.Players[0].CastleKey)!;
        int army = castle.Soldiers.Values.Sum() + castle.Weapons.Values.Sum() + castle.SoldiersAway;
        Assert.True(army >= 10, $"only {army} in the army");
        // Soldiers it forged and armed stay within its share of the people; hired ones come on top.
        int hired = castle.Mercenaries.Values.Sum();
        Assert.True(army - hired <= castle.Population * Rules.Bots.ArmyShare + 1, $"{army - hired} of {castle.Population} people");
        double share = Rules.Bots.Mix.Values.Sum();
        foreach (var (id, want) in Rules.Bots.Mix)
        {
            var type = Rules.FindUnit(id)!;
            double have = (castle.Soldiers[type] + castle.Weapons[type]) / (double)(castle.Soldiers.Values.Sum() + castle.Weapons.Values.Sum());
            Assert.InRange(have, want / share - 0.2, want / share + 0.2);
        }
    }

    [Fact]
    public void Stored_weapons_are_armed_late_in_the_preparation_except_for_what_a_raid_needs()
    {
        var room = Match(prep: 600, war: 300);
        var host = new BotHost.BotHost(Rules, 1);
        int mostBeforeArming = 0;
        for (int t = 0; t < 600 * Rules.Bots.ArmFrom - 20; t++)
        {
            room.Tick(1, dt => host.Step(room, dt));
            var castle = room.Game!.CastleOf(room.Players[0].CastleKey)!;
            mostBeforeArming = Math.Max(mostBeforeArming, castle.Soldiers.Values.Sum() + castle.SoldiersAway);
        }
        // A village needs three, a camp a handful: never the whole army before it is time.
        Assert.True(mostBeforeArming <= 10, $"{mostBeforeArming} soldiers before arming time");
    }

    [Fact]
    public void The_easy_bot_thinks_less_often_and_gives_fewer_commands_than_the_medium_one()
    {
        var room = Room.StartBotMatch("EZ", Rules, new RoomOptions { MinPlayers = 1, PrepSeconds = 600, WarSeconds = 300, Seed = 4 },
            [BotDifficulty.Easy, BotDifficulty.Medium]);
        var host = new BotHost.BotHost(Rules, 2);
        for (int t = 0; t < 240; t++) room.Tick(1, dt => host.Step(room, dt));
        Assert.True(host.Stats[1]["thinks"] < host.Stats[2]["thinks"]);
        Assert.True(host.Stats[1]["commands"] < host.Stats[2]["commands"]);
    }

    private static class Building
    {
        public static BuildingType Of(Job job) => job switch
        {
            Job.Farmer => BuildingType.Farm, Job.Lumberjack => BuildingType.LumberCamp, Job.Miner => BuildingType.Mine, _ => BuildingType.Forge,
        };
    }
}
