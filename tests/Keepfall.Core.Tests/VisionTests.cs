using Keepfall.Core.Config;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>Fog of war: who sees which army or scout, and what seeing one tells you.</summary>
public class VisionTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3";
    private static readonly UnitType Sword = Rules.FindUnit("kilicli")!;
    private static readonly UnitType Archer = Rules.FindUnit("okcu")!;

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    /// <summary>A in the north-west, B opposite in the south-east, C in the north-east; already at war.</summary>
    private static GameState War()
    {
        var game = new GameState(Rules, [A, B, C], prepSeconds: 1, warSeconds: 1000, rng: new Random(1),
            corners: new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast, [C] = Corner.NorthEast });
        foreach (var p in new[] { A, B, C }) Ok(game.Execute(p, new SetGrowth(false)));
        game.Tick(1);
        Assert.Equal(MatchPhase.War, game.Phase);
        return game;
    }

    private static SendArmy Attack(string target, params (UnitType Type, int Count)[] units) =>
        new(target, units.ToDictionary(u => u.Type.Id, u => u.Count));

    [Fact]
    public void Vision_is_the_castle_plus_own_armies_and_scouts_with_their_radii()
    {
        Assert.Equal((20, 6, 10), (Rules.Map.CastleVision, Rules.Map.ArmyVision, Rules.Map.ScoutVision));
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 2);
        Ok(game.Execute(A, Attack(B, (Sword, 2))));
        Ok(game.Execute(A, new SendScout(C)));
        game.Tick(1);

        var vision = game.VisionOf(A);
        Assert.Equal(3, vision.Count);
        Assert.Equal(new VisionCircle(game.Map.RegionOf(Corner.NorthWest).Gate, 20), vision[0]);
        Assert.Equal(new[] { 6.0, 10.0 }, vision.Skip(1).Select(v => v.Radius));
        Assert.Equal(game.ArmiesOf(A).Single().Position, vision[1].Center);
        Assert.Single(game.VisionOf(B)); // just the castle
    }

    [Fact]
    public void An_army_far_from_everything_you_see_is_not_there_at_all()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        Ok(game.Execute(A, Attack(B, (Sword, 3))));
        for (int t = 0; t < 8; t++)
        {
            game.Tick(1);
            Assert.Empty(game.SeenBy(B)); // still near A's castle
            Assert.Empty(game.SeenBy(C));
        }
    }

    [Fact]
    public void Coming_into_sight_shows_owner_position_heading_and_soldiers_but_not_the_target_or_road()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        game.CastleOf(A)!.AddSoldiers(Archer, 2);
        Ok(game.Execute(A, Attack(B, (Sword, 3), (Archer, 2))));
        var army = game.ArmiesOf(A).Single();
        while (!game.CastleVisionOf(B).Contains(army.Position)) game.Tick(1);

        var seen = Assert.Single(game.SeenBy(B));
        Assert.Equal(MoverKind.Army, seen.Kind);
        Assert.Equal(A, seen.Owner);
        Assert.Equal(army.Position, seen.Position);
        Assert.Equal(Rules.Map.ArmySpeed, seen.Velocity.Length, 9);
        Assert.Equal(new Dictionary<UnitType, int> { [Sword] = 3, [Archer] = 2 }, seen.Units);
        Assert.NotEqual(army.Id.ToString(), seen.Id);
        Assert.Matches("^[0-9a-f]{16}$", seen.Id);

        // Structurally, a seen mover can only ever carry these fields: no target, road or arrival time.
        Assert.Equal(new[] { "Id", "Kind", "Owner", "Position", "Units", "Velocity" },
            typeof(SeenMover).GetProperties().Select(p => p.Name).Order());
        Assert.Empty(game.SeenBy(A)); // never your own
        Assert.Empty(game.SeenBy(C)); // C sees nothing of it
    }

    [Fact]
    public void Armies_coming_at_each_other_see_each_other_before_they_meet_but_bystanders_do_not()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 2);
        game.CastleOf(B)!.AddSoldiers(Sword, 2);
        Ok(game.Execute(A, Attack(B, (Sword, 2))));
        Ok(game.Execute(B, Attack(A, (Sword, 2))));
        bool sawIt = false;
        while (game.ActiveBattles.Count == 0)
        {
            game.Tick(1);
            if (game.ActiveBattles.Count > 0) break;
            var a = game.ArmiesOf(A).Single();
            var b = game.ArmiesOf(B).Single();
            bool close = a.Position.DistanceTo(b.Position) <= Rules.Map.ArmyVision;
            bool nearCastle = game.CastleVisionOf(A).Contains(b.Position) || game.CastleVisionOf(B).Contains(a.Position);
            if (!nearCastle) Assert.Equal(close, game.SeenBy(A).Any(m => m.Owner == B));
            sawIt |= close && !nearCastle;
            Assert.Empty(game.SeenBy(C)); // they meet in the forest, far from C
        }
        Assert.True(sawIt, "the two armies should see each other coming before they meet in the forest");
        Assert.Empty(game.SeenBy(A)); // once they fight, nobody sees them walking
        Assert.Empty(game.SeenBy(C));
    }

    [Fact]
    public void A_scout_is_seen_like_an_army_without_soldiers_and_sees_further()
    {
        var game = War();
        Ok(game.Execute(A, new SendScout(B)));
        var scout = game.MissionsOf(A).Single();
        while (!game.CastleVisionOf(B).Contains(scout.Position)) game.Tick(1);
        var seen = Assert.Single(game.SeenBy(B));
        Assert.Equal((MoverKind.Scout, A), (seen.Kind, seen.Owner));
        Assert.Empty(seen.Units);
        Assert.Equal(Rules.Map.ScoutSpeed, seen.Velocity.Length, 9);
    }

    [Fact]
    public void A_fallen_castle_sees_nothing()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 20);
        Ok(game.Execute(A, Attack(C, (Sword, 20))));
        while (!game.IsEliminated(C)) game.Tick(1);
        Assert.Empty(game.VisionOf(C));
        Assert.Empty(game.SeenBy(C)); // although A's army is right at its gate
    }
}
