using Keepfall.Core.Combat;
using Keepfall.Core.Config;
using Keepfall.Core.Match;
using Keepfall.Core.Units;

namespace Keepfall.Core.Tests;

/// <summary>Four rows, one unit type to a row.</summary>
public class RowTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static UnitType U(string id) => Rules.FindUnit(id)!;

    private static ArmySetup Army(params (string Id, int Count)[] units)
    {
        var setup = new ArmySetup("A");
        foreach (var (id, n) in units) setup.Add(U(id), n);
        return setup;
    }

    [Fact]
    public void The_default_formation_gives_every_type_its_own_row_fighters_first()
    {
        var army = Army(("okcu", 3), ("kilicli", 3), ("kesis", 1), ("kalkanli", 2));
        var rows = new[] { "kilicli", "kalkanli", "okcu", "kesis" }.Select(id => army.RowOf(U(id))).ToList();
        Assert.Equal(new[] { Row.First, Row.Second, Row.Third, Row.Fourth }, rows);
    }

    [Fact]
    public void A_chosen_row_is_kept_and_a_taken_row_goes_to_the_next_free_one()
    {
        var army = Army(("kilicli", 3), ("kalkanli", 2), ("okcu", 3), ("kesis", 1));
        army.PlaceIn(U("okcu"), Row.First);
        Assert.Equal(Row.First, army.RowOf(U("okcu")));
        var all = new[] { "kilicli", "kalkanli", "okcu", "kesis" }.Select(id => army.RowOf(U(id))).ToList();
        Assert.Equal(4, all.Distinct().Count());
        army.PlaceIn(U("kilicli"), Row.First); // both want the first row: one of them moves back
        Assert.Equal(4, new[] { "kilicli", "kalkanli", "okcu", "kesis" }.Select(id => army.RowOf(U(id))).Distinct().Count());
    }

    [Fact]
    public void Melee_behind_a_row_waits_until_the_rows_in_front_are_gone()
    {
        var setup = Army(("kilicli", 3), ("mizrakci", 3));
        setup.PlaceIn(U("kilicli"), Row.First);
        setup.PlaceIn(U("mizrakci"), Row.Third);
        var r = new BattleSimulator(Rules).Simulate(setup, Army(("kalkanli", 6)), new Random(3), recordBattle: true).Record!;
        int firstAdvance = int.MaxValue;
        for (int i = 0; i < r.Advances.Count; i += 2)
            if (r.Soldiers[r.Advances[i + 1]].Type.Id == "mizrakci") firstAdvance = Math.Min(firstAdvance, r.Advances[i]);
        for (int i = 0; i < r.Hits.Count; i += 3)
            if (r.Soldiers[r.Hits[i + 1]] is { Side: 0 } s && s.Type.Id == "mizrakci")
                Assert.True(r.Hits[i] >= firstAdvance, $"a reserve spearman hit at tick {r.Hits[i]}, before it advanced at {firstAdvance}");
    }
}
