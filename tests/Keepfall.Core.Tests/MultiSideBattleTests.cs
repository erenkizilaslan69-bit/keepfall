using Keepfall.Core.Combat;
using Keepfall.Core.Config;

namespace Keepfall.Core.Tests;

/// <summary>A battle of three sides (a castle gate with two besiegers): who hits whom, joining midway, and one side standing at the end.</summary>
public class MultiSideBattleTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static ArmySetup Army(string name, params (string Id, int Count)[] units)
    {
        var setup = new ArmySetup(name);
        foreach (var (id, n) in units) setup.Add(Rules.FindUnit(id)!, n);
        return setup;
    }

    // Side 0 attacks, side 1 defends the gate, side 2 comes later (like a second besieger).
    private static ArmySetup First() { var a = Army("Birinci", ("kilicli", 10), ("okcu", 6)); a.FoeOrder = [1]; return a; }
    private static ArmySetup Defender() { var d = Army("Savunan", ("kalkanli", 8), ("okcu", 6)); d.SpreadFire = true; return d; }
    private static ArmySetup Second() { var s = Army("İkinci", ("mizrakci", 8), ("okcu", 6)); s.FoeOrder = [1]; return s; }

    private static MultiResult Run(int seed, params SimEvent[] events) =>
        new BattleSimulator(Rules).SimulateMulti([First(), Defender()], new Random(seed), events, recordBattle: true);

    [Theory]
    [InlineData(1)]
    [InlineData(7)]
    public void A_joiner_changes_nothing_that_came_before_it(int seed)
    {
        var alone = Run(seed).Record!;
        int join = alone.Ticks / 2;
        var three = Run(seed, new JoinEvent(join, Second())).Record!;
        Assert.Equal(alone.Soldiers.Count + 14, three.Soldiers.Count);
        Assert.All(three.Soldiers.Skip(alone.Soldiers.Count), s => Assert.Equal(2, s.Side));

        static List<(int, int, int)> Before(BattleRecord r, int tick) =>
            Enumerable.Range(0, r.Hits.Count / 3).Select(i => (r.Hits[i * 3], r.Hits[i * 3 + 1], r.Hits[i * 3 + 2])).Where(h => h.Item1 < tick).ToList();
        Assert.Equal(Before(alone, join), Before(three, join));
        static List<(int, int)> DeathsBefore(BattleRecord r, int tick) =>
            Enumerable.Range(0, r.Deaths.Count / 2).Select(i => (r.Deaths[i * 2], r.Deaths[i * 2 + 1])).Where(d => d.Item1 < tick).ToList();
        Assert.Equal(DeathsBefore(alone, join), DeathsBefore(three, join));
        // Nobody of the joiner acts before it arrives.
        for (int i = 0; i < three.Hits.Count; i += 3)
            if (three.Soldiers[three.Hits[i + 1]].Side == 2) Assert.True(three.Hits[i] >= join);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    public void One_side_is_left_standing_and_the_story_adds_up(int seed)
    {
        var first = Run(seed);
        var m = Run(seed, new JoinEvent(first.Record!.Ticks / 3, Second()));
        var r = m.Record!;
        Assert.Equal(3, m.Sides.Count);
        Assert.False(m.TimedOut);
        int standing = m.Sides.Count(s => s.Survivors > 0);
        Assert.Equal(m.WinnerSide is null ? 0 : 1, standing);
        if (m.WinnerSide is { } w) Assert.True(m.Sides[w].Survivors > 0);

        // Every death is listed once, per side as many as fell.
        var dead = Enumerable.Range(0, r.Deaths.Count / 2).Select(i => r.Deaths[i * 2 + 1]).ToList();
        Assert.Equal(dead.Count, dead.Distinct().Count());
        for (int side = 0; side < 3; side++)
            Assert.Equal(m.Sides[side].Initial - m.Sides[side].Survivors, dead.Count(i => r.Soldiers[i].Side == side));
        // Each fallen soldier was killed by someone: the kills add up to the dead.
        Assert.Equal(dead.Count, m.KillsBySide.Sum());
        // Nobody ever hits their own side.
        for (int i = 0; i < r.Hits.Count; i += 3) Assert.NotEqual(r.Soldiers[r.Hits[i + 1]].Side, r.Soldiers[r.Hits[i + 2]].Side);
    }

    [Fact]
    public void Besiegers_hit_the_castle_unless_they_choose_otherwise_and_the_defenders_split_their_fire()
    {
        int toCastle = 0, toRivalEarly = 0, defendersAtFirst = 0, defendersAtSecond = 0;
        for (int seed = 1; seed <= 6; seed++)
        {
            var r = new BattleSimulator(Rules).SimulateMulti([First(), Defender(), Second()], new Random(seed), null, recordBattle: true).Record!;
            int castleDown = Enumerable.Range(0, r.Deaths.Count / 2).Where(i => r.Soldiers[r.Deaths[i * 2 + 1]].Side == 1).Select(i => r.Deaths[i * 2]).DefaultIfEmpty(0).Max();
            for (int i = 0; i < r.Hits.Count; i += 3)
            {
                int tick = r.Hits[i], from = r.Soldiers[r.Hits[i + 1]].Side, to = r.Soldiers[r.Hits[i + 2]].Side;
                if (from != 1 && to == 1) toCastle++;
                if (from != 1 && to != 1 && tick < castleDown - 40) toRivalEarly++; // (a few blows go astray when nothing at the castle is in reach)
                if (from == 1 && to == 0) defendersAtFirst++;
                if (from == 1 && to == 2) defendersAtSecond++;
            }
        }
        Assert.True(toCastle > 0);
        Assert.True(toRivalEarly * 10 < toCastle, $"besiegers keep to the castle while it stands ({toRivalEarly} vs {toCastle})");
        Assert.True(defendersAtFirst > 0 && defendersAtSecond > 0, "the defenders hit both besiegers");
    }

    [Fact]
    public void Besiegers_fight_each_other_when_the_castle_is_gone_and_a_chosen_foe_is_hit_first()
    {
        var weak = Army("Savunan", ("kilicli", 1)); weak.SpreadFire = true;
        var a = Army("Birinci", ("kilicli", 12), ("okcu", 6)); a.FoeOrder = [1];
        var b = Army("İkinci", ("kilicli", 12), ("okcu", 6)); b.FoeOrder = [1];
        var m = new BattleSimulator(Rules).SimulateMulti([a, weak, b], new Random(3), null, recordBattle: true);
        Assert.NotNull(m.WinnerSide);
        Assert.NotEqual(1, m.WinnerSide);
        var r = m.Record!;
        Assert.Contains(Enumerable.Range(0, r.Hits.Count / 3), i => r.Soldiers[r.Hits[i * 3 + 1]].Side == 0 && r.Soldiers[r.Hits[i * 3 + 2]].Side == 2);

        // Choosing the rival from the start sends the first blows there.
        var pick = Army("Birinci", ("kilicli", 12), ("okcu", 6)); pick.Foe = 2;
        var chosen = new BattleSimulator(Rules).SimulateMulti([pick, Defender(), Second()], new Random(3), null, recordBattle: true).Record!;
        int atRival = 0, atCastle = 0;
        for (int i = 0; i < chosen.Hits.Count; i += 3)
        {
            if (chosen.Soldiers[chosen.Hits[i + 1]].Side != 0) continue;
            if (chosen.Soldiers[chosen.Hits[i + 2]].Side == 2) atRival++; else atCastle++;
        }
        Assert.True(atRival > atCastle);
    }

    [Fact]
    public void A_focus_event_moves_the_blows_from_that_tick_on_and_the_same_events_tell_the_same_story()
    {
        int tick = 40;
        var ev = new SimEvent[] { new JoinEvent(10, Second()), new FocusEvent(tick, 0, 2) };
        var one = new BattleSimulator(Rules).SimulateMulti([First(), Defender()], new Random(9), ev, recordBattle: true).Record!;
        var two = new BattleSimulator(Rules).SimulateMulti([First(), Defender()], new Random(9), ev, recordBattle: true).Record!;
        Assert.Equal(one.Hits, two.Hits);
        Assert.Equal(one.Deaths, two.Deaths);
        int atRival = 0, atCastle = 0;
        for (int i = 0; i < one.Hits.Count; i += 3)
        {
            if (one.Hits[i] <= tick + 25 || one.Soldiers[one.Hits[i + 1]].Side != 0) continue;
            if (one.Soldiers[one.Hits[i + 2]].Side == 2) atRival++; else atCastle++;
        }
        Assert.True(atRival > atCastle, $"after the choice side 0 hits the rival ({atRival} vs {atCastle})");
    }

    [Fact]
    public void Healers_alone_are_finished_in_a_three_sided_battle_too()
    {
        var monks = Army("Keşişler", ("kesis", 3));
        var m = new BattleSimulator(Rules).SimulateMulti([First(), Defender(), monks], new Random(2), null, recordBattle: true);
        Assert.Equal(0, m.Sides[2].Survivors);
        Assert.NotEqual(2, m.WinnerSide);
    }
}
