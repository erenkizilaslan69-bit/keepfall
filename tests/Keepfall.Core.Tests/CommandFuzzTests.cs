using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>
/// Four players fire random commands (valid, nonsense, hostile) at a whole match, every second, kingdoms on. Whatever they send, nothing may throw,
/// no army may jump (ContinuityViolations) and the match has to reach its end.
/// </summary>
public class CommandFuzzTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static readonly string[] Units = ["okcu", "kilicli", "mizrakci", "kalkanli", "kesis", "mancinik", "suvari", "OKCU", "", "nope", "x"];

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    public void Random_commands_never_break_a_match(int seed)
    {
        string[] keys = ["o1", "o2", "o3", "o4"];
        var rng = new Random(seed);
        var corners = new Dictionary<string, Corner> { ["o1"] = Corner.NorthWest, ["o2"] = Corner.NorthEast, ["o3"] = Corner.SouthWest, ["o4"] = Corner.SouthEast };
        var game = new GameState(Rules, keys, null, null, new Random(seed), corners, seed, null, Factions.Assign(keys, new Random(seed + 5)));
        foreach (var k in keys)
        {
            var castle = game.CastleOf(k)!;
            foreach (var u in Rules.Units) castle.AddSoldiers(u, 8);
            castle.AddGold(400);
            castle.AddGoods(500, 500, 500);
        }
        var sites = game.AllSites.Select(s => s.Site.Id).ToList();

        string Key() => rng.Next(12) == 0 ? new[] { "o9", "", "o-1", new string('z', 200) }[rng.Next(4)] : keys[rng.Next(4)];
        string Unit() => Units[rng.Next(Units.Length)];
        int Count() => rng.Next(10) switch { 0 => -3, 1 => 0, 2 => int.MaxValue, 3 => 1_000_000, _ => rng.Next(1, 12) };
        Job AJob() => rng.Next(14) == 0 ? (Job)rng.Next(-3, 40) : (Job)rng.Next(5);
        Row ARow() => rng.Next(14) == 0 ? (Row)rng.Next(-3, 40) : (Row)rng.Next(4);
        Dictionary<string, int> Table()
        {
            var t = new Dictionary<string, int>();
            for (int i = rng.Next(0, 5); i > 0; i--) t[Unit()] = Count();
            return t;
        }
        Dictionary<string, Row> RowTable()
        {
            var t = new Dictionary<string, Row>();
            for (int i = rng.Next(0, 5); i > 0; i--) t[Unit()] = ARow();
            return t;
        }
        string Site() => rng.Next(4) == 0 ? "nowhere" : sites[rng.Next(sites.Count)];

        GameCommand Make() => rng.Next(26) switch
        {
            0 => new MoveWorkers(AJob(), AJob(), Count()),
            1 => new QueueWeapon(Unit(), Count()),
            2 => new CancelWeapon(rng.Next(-2, 6)),
            3 => new ArmWorkers(Unit(), Count(), AJob()),
            4 => new DisarmSoldiers(Unit(), Count()),
            5 => new UpgradeBuilding((BuildingType)rng.Next(-1, 7)),
            6 => new SendScout(Key(), AJob()),
            7 => new SendEnvoy(Key(), Count(), Count(), 0, Count(), rng.Next(3) == 0 ? new string('é', 300) : "hi <b>", AJob(), rng.Next(3) == 0 ? Key() : null),
            8 => new SendExplore((Corner)rng.Next(-1, 6), AJob()),
            9 => new SendChestScout(Site(), AJob()),
            10 or 11 or 12 => new SendArmy(Key(), Table(), RowTable(), rng.Next(3) == 0 ? Unit() : null, (ArmyMode)rng.Next(-1, 3), rng.Next(6) == 0 ? Key() : null),
            13 => new SendArmyToSite(Site(), Table(), RowTable(), Unit()),
            14 => new RedirectArmy(rng.Next(0, 12), rng.Next(2) == 0 ? Key() : null, rng.Next(2) == 0 ? Site() : null),
            15 => new RecallArmy(rng.Next(0, 12)),
            16 => new SetDefense(RowTable(), rng.Next(3) == 0 ? Unit() : null),
            17 => new HireMercenary(Unit(), Count()),
            18 => new SendDecoy(Key(), Table()),
            19 => new SetFakeReport(Table()),
            20 => new BribeArmy(rng.Next(3) == 0 ? "" : Convert.ToHexString(BitConverter.GetBytes(rng.NextInt64())).ToLowerInvariant(), Count()),
            21 => new HireCamp(Site(), Key()),
            22 => new SetGrowth(rng.Next(2) == 0),
            _ => new SendArmy(keys[rng.Next(4)], new Dictionary<string, int> { [Units[rng.Next(7)]] = rng.Next(1, 9) }, null, null),
        };

        int guard = 0;
        while (game.Phase != MatchPhase.Ended && guard++ < 6000)
        {
            for (int i = 0; i < 5; i++)
            {
                var from = keys[rng.Next(4)];
                var ex = Record.Exception(() => game.Execute(from, Make()));
                Assert.True(ex is null, $"seed {seed}, t={game.ElapsedSeconds:0}: {ex}");
            }
            var tickEx = Record.Exception(() => game.Tick(1));
            Assert.True(tickEx is null, $"seed {seed}, t={game.ElapsedSeconds:0}: tick threw {tickEx}");
        }
        Assert.Equal(MatchPhase.Ended, game.Phase);
        Assert.Equal(0, game.ContinuityViolations);
    }
}
