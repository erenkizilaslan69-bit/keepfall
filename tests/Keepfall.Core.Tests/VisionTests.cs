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

    // ---- the scout's trail --------------------------------------------------------------------

    [Fact]
    public void A_scout_leaves_open_ground_behind_it_for_its_owner_only()
    {
        Assert.Equal(120, Rules.Map.ScoutTrailSeconds);
        var game = War();
        Ok(game.Execute(A, new SendScout(C)));
        for (int t = 0; t < 10; t++) game.Tick(1);

        var trail = game.TrailOf(A);
        Assert.True(trail.Count >= 5);
        Assert.All(trail, c => Assert.Equal((Rules.Map.ScoutVision, 1.0), (c.Radius, c.Fade)));
        Assert.Empty(game.TrailOf(B));
        Assert.Empty(game.TrailOf(C)); // the scouted player gets nothing back
    }

    [Fact]
    public void The_trail_closes_after_the_configured_time_and_fades_first()
    {
        var game = War();
        Ok(game.Execute(A, new SendScout(C)));
        while (game.MissionsOf(A).Count > 0) game.Tick(1);
        Assert.NotEmpty(game.TrailOf(A));

        double fading = 0;
        for (int t = 0; t < 400 && game.TrailOf(A).Count > 0; t++)
        {
            game.Tick(1);
            if (game.TrailOf(A).Any(c => c.Fade < 1)) fading++;
        }
        Assert.Empty(game.TrailOf(A));
        Assert.InRange(fading, GameState.TrailFadeSeconds, 95); // points close one after the other, each fading for its last seconds
        Assert.True(game.ElapsedSeconds < 1 + 2 * 31 + 120 + 30, "closed far too late");
    }

    [Fact]
    public void Armies_crossing_the_trail_are_seen_but_never_inside_a_castles_region()
    {
        var game = War();
        game.CastleOf(C)!.AddSoldiers(Sword, 2);
        Ok(game.Execute(A, new SendScout(C)));
        while (game.MissionsOf(A).Count > 0) game.Tick(1);
        Assert.Single(game.VisionOf(A)); // no scout out: only the castle sees

        Ok(game.Execute(C, Attack(A, (Sword, 2))));
        game.Tick(1);
        var army = game.ArmiesOf(C).Single();
        var region = game.Map.RegionOf(Corner.NorthEast);
        Assert.True(army.Position.X >= region.Origin.X && army.Position.X <= region.Origin.X + region.Width
                    && army.Position.Y >= region.Origin.Y && army.Position.Y <= region.Origin.Y + region.Height, "starts inside its region");
        Assert.Empty(game.SeenBy(A)); // inside the region: not through the trail

        bool seenOnTheRoad = false;
        for (int t = 0; t < 30 && !seenOnTheRoad; t++)
        {
            game.Tick(1);
            if (game.CastleVisionOf(A).Contains(army.Position)) break; // from here on the castle sees it anyway
            seenOnTheRoad = game.SeenBy(A).Any(s => s.Owner == C);
        }
        Assert.True(seenOnTheRoad, "the trail should show the army out on the road");
        Assert.Empty(game.SeenBy(B)); // nobody else gets the trail
    }

    [Fact]
    public void A_trail_of_zero_seconds_never_closes()
    {
        var path = Path.Combine(Path.GetTempPath(), $"balance-{Guid.NewGuid():N}.json");
        File.WriteAllText(path, File.ReadAllText(BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)!)
            .Replace("\"scoutTrailSeconds\": 120", "\"scoutTrailSeconds\": 0"));
        var rules = BalanceConfigLoader.LoadFromFile(path);
        File.Delete(path);
        Assert.Equal(0, rules.Map.ScoutTrailSeconds);
        var game = new GameState(rules, [A, B, C], prepSeconds: 1, warSeconds: 100_000, rng: new Random(1),
            corners: new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast, [C] = Corner.NorthEast });
        foreach (var p in new[] { A, B, C }) Ok(game.Execute(p, new SetGrowth(false)));
        game.Tick(1);
        Ok(game.Execute(A, new SendScout(C)));
        while (game.MissionsOf(A).Count > 0) game.Tick(1);
        int laid = game.TrailOf(A).Count;
        for (int t = 0; t < 2000; t++) game.Tick(1);
        Assert.Equal(laid, game.TrailOf(A).Count);
        Assert.All(game.TrailOf(A), c => Assert.Equal(1.0, c.Fade));
    }

    [Fact]
    public void A_fallen_castle_loses_its_trail()
    {
        var game = War();
        Ok(game.Execute(C, new SendScout(A)));
        game.Tick(5);
        Assert.NotEmpty(game.TrailOf(C));
        game.CastleOf(A)!.AddSoldiers(Sword, 20);
        Ok(game.Execute(A, Attack(C, (Sword, 20))));
        while (!game.IsEliminated(C)) game.Tick(1);
        Assert.Empty(game.TrailOf(C));
    }
}
