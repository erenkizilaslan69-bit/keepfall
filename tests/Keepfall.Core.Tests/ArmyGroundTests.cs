using Keepfall.Core.Config;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>The ground armies open for good, the forest places they pass, and rival armies remembered as "last seen" (never more than the player saw).</summary>
public class ArmyGroundTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3";
    private static readonly UnitType Sword = Rules.FindUnit("kilicli")!;

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    private static GameState War()
    {
        var game = new GameState(Rules, [A, B, C], prepSeconds: 1, warSeconds: 2000, rng: new Random(1),
            corners: new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast, [C] = Corner.NorthEast });
        foreach (var p in new[] { A, B, C }) Ok(game.Execute(p, new SetGrowth(false)));
        game.Tick(1);
        Assert.Equal(MatchPhase.War, game.Phase);
        return game;
    }

    [Fact]
    public void The_ground_an_army_walked_over_stays_open_but_never_inside_a_rivals_corner()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        Ok(game.Execute(A, new SendArmy(B, new Dictionary<string, int> { [Sword.Id] = 3 })));
        for (int i = 0; i < 25; i++) game.Tick(1);
        var walked = game.WalkedOf(A);
        Assert.NotEmpty(walked);
        Assert.All(walked, c => Assert.Equal(Rules.Map.ArmyVision, c.Radius));
        Assert.Empty(game.WalkedOf(B)); // B's armies have not moved
        foreach (var corner in new[] { Corner.SouthEast, Corner.NorthEast })
        {
            var r = game.Map.RegionOf(corner);
            Assert.DoesNotContain(walked, c => c.Center.X >= r.Origin.X && c.Center.X <= r.Origin.X + r.Width && c.Center.Y >= r.Origin.Y && c.Center.Y <= r.Origin.Y + r.Height);
        }
        // it stays open after the army is home (or gone): nothing about it fades
        Ok(game.Execute(A, new RecallArmy(game.ArmiesOf(A).Single().Id)));
        for (int i = 0; i < 300; i++) game.Tick(1);
        Assert.True(game.WalkedOf(A).Count >= walked.Count);
        Assert.All(game.WalkedOf(A), c => Assert.Equal(1, c.Fade));
    }

    [Fact]
    public void A_rival_army_that_leaves_sight_is_remembered_as_last_seen_only_by_who_saw_it_and_only_for_a_while()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        Ok(game.Execute(A, new SendArmy(B, new Dictionary<string, int> { [Sword.Id] = 3 })));
        var armyId = game.ArmiesOf(A).Single().Id;
        var everSeen = new Dictionary<string, HashSet<string>> { [A] = [], [B] = [], [C] = [] };
        string? seenId = null;
        IReadOnlyDictionary<UnitType, int>? seenUnits = null;
        void Watch()
        {
            foreach (var v in new[] { A, B, C })
                foreach (var s in game.SeenBy(v).Where(s => s.Kind == MoverKind.Army)) { everSeen[v].Add(s.Id); if (v == B) { seenId = s.Id; seenUnits = s.Units; } }
        }
        for (int i = 0; i < 900 && seenId is null; i++) { game.Tick(1); Watch(); }
        Assert.NotNull(seenId); // B's castle sight (20 tiles) picks it up
        Assert.Empty(game.LastSeenOf(B)); // still in sight: not a memory yet
        Ok(game.Execute(A, new RecallArmy(armyId)));
        for (int i = 0; i < 400 && !game.LastSeenOf(B).Any(); i++) { game.Tick(1); Watch(); }
        var ghost = Assert.Single(game.LastSeenOf(B));
        Assert.Equal(seenId, ghost.Id);
        Assert.Equal(A, ghost.Owner);
        Assert.Equal(seenUnits!.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key.Id, kv => kv.Value), ghost.Units.ToDictionary(kv => kv.Key.Id, kv => kv.Value)); // what B made out then
        Assert.DoesNotContain(game.SeenBy(B), s => s.Id == seenId);
        Assert.Empty(game.LastSeenOf(A)); // never one's own
        foreach (var v in new[] { A, B, C }) Assert.All(game.LastSeenOf(v), g => Assert.Contains(g.Id, everSeen[v])); // nobody is told of an army they never saw
        // forgotten after map.lastSeenSeconds
        for (int i = 0; i < Rules.Map.LastSeenSeconds + 5; i++) { game.Tick(1); Watch(); if (!game.LastSeenOf(B).Any()) break; }
        Assert.Empty(game.LastSeenOf(B));
    }
}
