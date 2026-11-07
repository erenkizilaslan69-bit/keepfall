using Keepfall.Core.Combat;
using Keepfall.Core;
using Keepfall.Core.Config;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>A second army that reaches a gate where a siege is on does not wait: it joins, and everyone fights at once.</summary>
public class SiegeJoinTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3", D = "o4";
    private static readonly UnitType Archer = Rules.FindUnit("okcu")!;
    private static readonly UnitType Sword = Rules.FindUnit("kilicli")!;
    private static readonly UnitType Shield = Rules.FindUnit("kalkanli")!;
    private static readonly UnitType Rider = Rules.FindUnit("suvari")!;
    private static readonly Corner[] Corners = [Corner.NorthWest, Corner.SouthEast, Corner.NorthEast, Corner.SouthWest];

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    private static GameState War(int players, int seed)
    {
        var keys = Enumerable.Range(1, players).Select(i => $"o{i}").ToList();
        var game = new GameState(Rules, keys, 10, 900, new Random(seed), keys.Select((k, i) => (k, i)).ToDictionary(x => x.k, x => Corners[x.i]));
        foreach (var k in keys) Ok(game.Execute(k, new SetGrowth(false)));
        for (int i = 0; i < 10; i++) game.Tick(1);
        Assert.Equal(MatchPhase.War, game.Phase);
        return game;
    }

    private static SendArmy Attack(string target, params (UnitType Type, int Count)[] units) =>
        new(target, units.ToDictionary(u => u.Type.Id, u => u.Count));

    /// <summary>A and B both send <paramref name="units"/> to C, timed so that the one coming later reaches the gate <paramref name="gap"/> seconds after the other.</summary>
    private static void SendStaggered(GameState game, UnitType type, int count, int gap = 3)
    {
        double ma = game.MarchSeconds(A, C), mb = game.MarchSeconds(B, C);
        var (first, second, wait) = ma + gap - mb >= 0 ? (A, B, ma + gap - mb) : (B, A, mb + gap - ma);
        Ok(game.Execute(first, Attack(C, (type, count))));
        for (int i = 0; i < (int)Math.Round(wait); i++) game.Tick(1);
        Ok(game.Execute(second, Attack(C, (type, count))));
    }

    /// <summary>Both A and B send an army to C; returns the game once both stand at the gate in one battle.</summary>
    private static (GameState Game, ActiveBattle Battle, int JoinTick) TwoAtTheGate(int seed, int swords = 20)
    {
        var game = War(3, seed);
        game.CastleOf(A)!.AddSoldiers(Sword, swords);
        game.CastleOf(B)!.AddSoldiers(Sword, swords);
        game.CastleOf(C)!.AddSoldiers(Shield, 25);
        game.CastleOf(C)!.AddSoldiers(Archer, 10);
        SendStaggered(game, Sword, swords);
        for (int t = 0; t < 400; t++)
        {
            game.Tick(1);
            if (game.ActiveBattles.Count == 1 && game.ActiveBattles[0].Attackers.Count == 2)
            {
                var update = game.TakeStartedBattles(C).Single(); // a battle C was told about already is updated, or both came in one message
                return (game, game.ActiveBattles[0], update.UpdateFromTick ?? 0);
            }
            if (game.BattlesOf(C).Count > 0) break;
        }
        throw new Xunit.Sdk.XunitException("the second army never joined the battle");
    }

    [Fact]
    public void A_second_army_joins_the_battle_at_the_gate_instead_of_waiting()
    {
        var (game, battle, _) = TwoAtTheGate(3);
        Assert.Equal(3, battle.Setups.Count); // attacker, castle, newcomer
        Assert.All(battle.Attackers, a => Assert.Same(battle, a.Battle));
        Assert.Contains(battle.Record.Soldiers, s => s.Side == 2);
        Assert.Equal(new[] { A, B }.OrderBy(x => x), battle.Attackers.Select(a => a.From).OrderBy(x => x));
        // Nobody outside is told.
        Assert.Empty(game.ActiveBattlesOf(D));
    }

    [Fact]
    public void Everyone_in_the_battle_is_told_it_changed_and_the_first_part_is_as_before()
    {
        var game = War(4, 4);
        game.CastleOf(A)!.AddSoldiers(Sword, 20);
        game.CastleOf(B)!.AddSoldiers(Sword, 20);
        game.CastleOf(C)!.AddSoldiers(Shield, 25);
        game.CastleOf(C)!.AddSoldiers(Archer, 10);
        SendStaggered(game, Sword, 20);
        ActiveBattle? battle = null;
        List<int>? hitsBefore = null;
        for (int t = 0; t < 300 && battle is null; t++) { game.Tick(1); battle = game.ActiveBattles.FirstOrDefault(); }
        Assert.NotNull(battle);
        Assert.Single(battle.Attackers);
        game.TakeStartedBattles(A); game.TakeStartedBattles(B); game.TakeStartedBattles(C);
        hitsBefore = battle.Record.Hits.ToList();
        int guard = 0;
        while (battle.Attackers.Count < 2 && game.ActiveBattles.Contains(battle) && guard++ < 300) game.Tick(1);
        Assert.Equal(2, battle.Attackers.Count);

        string first = battle.Attackers[0].From, second = battle.Attackers[1].From;
        foreach (var who in new[] { first, C })
        {
            var told = Assert.Single(game.TakeStartedBattles(who));
            Assert.Same(battle, told.Battle);
            Assert.NotNull(told.UpdateFromTick);
            // What came before the join is exactly what was sent before.
            int from = told.UpdateFromTick!.Value;
            var now = battle.Record.Hits;
            for (int i = 0; i < hitsBefore.Count && hitsBefore[i] < from; i += 3)
                Assert.Equal((hitsBefore[i], hitsBefore[i + 1], hitsBefore[i + 2]), (now[i], now[i + 1], now[i + 2]));
        }
        var newcomer = Assert.Single(game.TakeStartedBattles(second)); // the one who joined gets the whole battle
        Assert.Null(newcomer.UpdateFromTick);
        Assert.Empty(game.TakeStartedBattles(D));
    }

    [Fact]
    public void The_castle_falls_to_the_one_left_standing_and_only_that_one_takes_the_spoils()
    {
        int fellCount = 0, held = 0;
        for (int seed = 1; seed <= 12; seed++)
        {
            var game = War(3, seed);
            game.CastleOf(A)!.AddSoldiers(Sword, 14);
            game.CastleOf(B)!.AddSoldiers(Sword, 14);
            game.CastleOf(C)!.AddSoldiers(Shield, 12);
            game.CastleOf(C)!.AddSoldiers(Archer, 6);
            SendStaggered(game, Sword, 14);
            for (int t = 0; t < 600 && game.BattlesOf(C).Count < 2; t++) game.Tick(1);
            var reports = game.BattlesOf(C);
            Assert.Equal(2, reports.Count);
            Assert.True(reports.Count(r => r.DefenderEliminated) <= 1);
            Assert.True(reports.Count(r => r.Loot is not null) <= 1);
            Assert.True(reports.Count(r => r.Winner == BattleWinner.Attacker) <= 1);
            Assert.All(reports, r => Assert.NotNull(r.Rival));
            var winner = reports.SingleOrDefault(r => r.DefenderEliminated);
            if (winner is null) { held++; Assert.Equal(MatchPhase.War, game.Phase); continue; }
            fellCount++;
            Assert.NotNull(winner.Loot);
            Assert.NotNull(game.CastleOf(winner.Attacker));
            Assert.False(game.IsEliminated(winner.Attacker));
            Assert.True(game.IsEliminated(C));
            // Nobody stays held at the gate afterwards.
            Assert.Empty(game.ActiveBattles);
            Assert.All(game.ArmiesOf(A).Concat(game.ArmiesOf(B)), a => Assert.Null(a.Battle));
        }
        Assert.True(fellCount > 0 && fellCount + held == 12);
    }

    [Fact]
    public void An_army_of_the_same_player_still_waits_for_the_battle_to_end()
    {
        var game = War(3, 5);
        game.CastleOf(A)!.AddSoldiers(Sword, 12);
        game.CastleOf(C)!.AddSoldiers(Shield, 6);
        Ok(game.Execute(A, Attack(C, (Sword, 6))));
        game.Tick(1);
        Ok(game.Execute(A, Attack(C, (Sword, 6))));
        for (int t = 0; t < 400 && game.ActiveBattles.Count == 0; t++) game.Tick(1);
        for (int t = 0; t < 30 && game.ActiveBattles.Count > 0; t++)
        {
            game.Tick(1);
            Assert.All(game.ActiveBattles, b => Assert.Single(b.Attackers));
        }
    }

    [Fact]
    public void Riders_that_win_alone_burn_the_fields_and_do_not_take_the_castle_even_among_three()
    {
        var game = War(3, 7);
        game.CastleOf(A)!.AddSoldiers(Rider, 12);
        game.CastleOf(B)!.AddSoldiers(Sword, 3);
        game.CastleOf(C)!.AddSoldiers(Archer, 1);
        Ok(game.Execute(A, Attack(C, (Rider, 12))));
        for (int t = 0; t < 600 && game.BattlesOf(C).Count < 1; t++) game.Tick(1);
        var report = game.BattlesOf(C)[0];
        Assert.True(report.Raid);
        Assert.False(report.DefenderEliminated);
    }

    [Fact]
    public void A_besieger_can_choose_whom_to_hit_and_only_those_in_the_battle_can()
    {
        var (game, battle, _) = TwoAtTheGate(3);
        string first = battle.Attackers[0].From, second = battle.Attackers[1].From;
        game.TakeStartedBattles(A); game.TakeStartedBattles(B); game.TakeStartedBattles(C);
        Ok(game.Execute(first, new SetSiegeFocus(second)));
        Assert.Contains(battle.Events, e => e is FocusEvent f && f.Side == 0 && f.Foe == 2);
        foreach (var who in new[] { A, B, C })
            Assert.NotNull(Assert.Single(game.TakeStartedBattles(who)).UpdateFromTick); // all three are told
        Assert.False(game.Execute(first, new SetSiegeFocus(first)).Ok, "not itself");
        Assert.False(game.Execute(first, new SetSiegeFocus("nobody")).Ok, "nobody there");
        Ok(game.Execute(first, new SetSiegeFocus(null)));
        Ok(game.Execute(C, new SetSiegeFocus(second))); // the castle chooses too
    }
}
