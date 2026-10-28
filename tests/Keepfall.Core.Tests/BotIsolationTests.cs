using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using Keepfall.Bots;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.Core.Tests;

/// <summary>
/// The hidden-information rule for bots: a bot sees what a player sees and nothing more. The brain (Keepfall.Bots)
/// is a separate assembly, handed only the view records; these tests check what it can even refer to, and that
/// what it does depends on nothing but its pictures.
/// </summary>
public class BotIsolationTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    // ---- what the brain may refer to ---------------------------------------------------------------------

    /// <summary>Types of the game's own project the bots may use: public rules and data, never the match.</summary>
    private static readonly HashSet<string> AllowedCore = new()
    {
        // Public rules (the balance file), and the command language a player speaks.
        "Keepfall.Core.GameRules", "Keepfall.Core.Lobby.BotRules", "Keepfall.Core.Lobby.BotLevelRules", "Keepfall.Core.Lobby.BotDifficulty",
        "Keepfall.Core.Match.GameCommand", "Keepfall.Core.Match.MoveWorkers", "Keepfall.Core.Match.QueueWeapon", "Keepfall.Core.Match.CancelWeapon",
        "Keepfall.Core.Match.ArmWorkers", "Keepfall.Core.Match.DisarmSoldiers", "Keepfall.Core.Match.UpgradeBuilding", "Keepfall.Core.Match.UpgradeWall", "Keepfall.Core.Match.SendScout",
        "Keepfall.Core.Match.SendExplore", "Keepfall.Core.Match.SendChestScout", "Keepfall.Core.Match.SendArmy", "Keepfall.Core.Match.SendArmyToSite",
        "Keepfall.Core.Match.RecallArmy", "Keepfall.Core.Match.RedirectArmy", "Keepfall.Core.Match.SetDefense", "Keepfall.Core.Match.HireMercenary", "Keepfall.Core.Match.SetGrowth",
        "Keepfall.Core.Match.ArmyMode", "Keepfall.Core.Match.CastleKeys",
        "Keepfall.Core.Match.SendDecoy", "Keepfall.Core.Match.SetFakeReport", "Keepfall.Core.Match.BribeArmy", "Keepfall.Core.Match.HireCamp",
        // Plain enums and tables the views are made of.
        "Keepfall.Core.Economy.Job", "Keepfall.Core.Economy.Jobs", "Keepfall.Core.Economy.BuildingType", "Keepfall.Core.Economy.Resource",
        "Keepfall.Core.Units.Row", "Keepfall.Core.Units.ResourceCost", "Keepfall.Core.Economy.DeckRules", "Keepfall.Core.Units.UnitType", "Keepfall.Core.World.Corner", "Keepfall.Core.World.SiteKind",
        "Keepfall.Core.Match.MatchPhase", "Keepfall.Core.Match.MissionKind", "Keepfall.Core.Match.BattleWinner", "Keepfall.Core.Match.BattleKind",
        "Keepfall.Core.Match.ArmyState", "Keepfall.Core.Lobby.PlayerColor", "Keepfall.Core.Lobby.RoomPhase",
        // Public maths: the fight calculator works on rules and armies made up on the spot.
        "Keepfall.Core.World.MoverKind", "Keepfall.Core.Economy.MatchRules", "Keepfall.Core.Combat.BattleSimulator", "Keepfall.Core.Combat.ArmySetup", "Keepfall.Core.Combat.TargetPriority",
        "Keepfall.Core.Combat.BattleResult", "Keepfall.Core.Combat.BattleOutcome", "Keepfall.Core.Combat.SideReport",
        "Keepfall.Core.World.MapRules", "Keepfall.Core.Economy.WarRules", "Keepfall.Core.Economy.WallRules", "Keepfall.Core.Economy.WallLevelRules", "Keepfall.Core.Units.AttackRange",
    };

    /// <summary>The server's side of the views: they take the whole match as input, so the bots must not call them.</summary>
    private static readonly string[] ForbiddenViews = ["ViewMapper", "MapViewMapper", "SpectatorFeed", "Spectator"];

    private static IEnumerable<string> ReferencedTypes(Assembly assembly)
    {
        using var stream = File.OpenRead(assembly.Location);
        using var pe = new PEReader(stream);
        var md = pe.GetMetadataReader();
        foreach (var handle in md.TypeReferences)
        {
            var t = md.GetTypeReference(handle);
            yield return $"{md.GetString(t.Namespace)}.{md.GetString(t.Name)}";
        }
    }

    [Fact]
    public void The_brain_refers_only_to_views_and_public_rules_never_to_the_match()
    {
        var refs = ReferencedTypes(typeof(Bot).Assembly).Where(n => n.StartsWith("Keepfall.", StringComparison.Ordinal)).Distinct().ToList();
        Assert.NotEmpty(refs);

        var stray = refs.Where(n => !n.StartsWith("Keepfall.Bots.", StringComparison.Ordinal)
            && !(n.StartsWith("Keepfall.Views.", StringComparison.Ordinal) && !ForbiddenViews.Any(f => n.Contains(f)))
            && !AllowedCore.Contains(n)).ToList();
        Assert.True(stray.Count == 0,
            "The bots' assembly refers to types that carry the match itself (or that nobody approved): " + string.Join(", ", stray)
            + ". The bots may only use views and public rules; if one of these is just public data, add it to AllowedCore.");
    }

    [Fact]
    public void The_brain_does_not_refer_to_the_room_the_match_or_the_server()
    {
        var names = ReferencedTypes(typeof(Bot).Assembly).ToList();
        foreach (var forbidden in new[] { "GameState", "Room", "RoomPlayer", "RoomSession", "Castle", "ArmyMarch", "SiteState", "ScoutMission", "ForestLayout", "WorldMap", "ActiveBattle", "BotHost" })
            Assert.DoesNotContain(names, n => n.EndsWith("." + forbidden, StringComparison.Ordinal));
        Assert.DoesNotContain(typeof(Bot).Assembly.GetReferencedAssemblies(), a => a.Name is "Keepfall.Server" or "Keepfall.BotHost");
    }

    // ---- what it does depends only on its pictures -----------------------------------------------------

    /// <summary>Three humans in a started match (the same corners and battles every time); only the forest differs between calls.</summary>
    private static Room NewMatch(int forestSeed, int secret)
    {
        var room = new Room("TEST", Rules, new RoomOptions { MinPlayers = 2, PrepSeconds = 600, WarSeconds = 300, Seed = 5, ForestSeed = forestSeed });
        var players = Enumerable.Range(1, 3).Select(i => room.Join($"P{i}", null, false, DateTime.UtcNow).Player!).ToList();
        foreach (var p in players) Assert.True(room.SetReady(p.Token, true).Ok);
        Assert.True(room.Start(players[0].Token).Ok);
        // Things the bot in seat 1 has no way to see: what the rivals own.
        room.Game!.CastleOf("o2")!.AddSoldiers(Rules.FindUnit("kilicli")!, secret);
        room.Game.CastleOf("o3")!.AddSoldiers(Rules.FindUnit("okcu")!, secret * 2);
        room.Game.CastleOf("o3")!.AddGold(secret);
        return room;
    }

    private static List<(double At, string Command)> Play(Room room, double seconds)
    {
        var game = room.Game!;
        var me = room.Players[0];
        var bot = new Bot(Rules, BotDifficulty.Medium, 1, seed: 99);
        var log = new List<(double, string)>();
        for (int t = 0; t < seconds; t++)
        {
            if (bot.IsDue(game.ElapsedSeconds))
            {
                var input = new BotInput(Views.ViewMapper.CastleOf(room, me)!, Views.MapViewMapper.StateOf(room, me),
                    Views.MapViewMapper.LayoutOf(room), Views.ViewMapper.ToView(room), 1);
                foreach (var c in bot.Think(input))
                {
                    log.Add((game.ElapsedSeconds, c.ToString()!));
                    room.Execute(me.Token, c);
                }
            }
            room.Tick(1);
        }
        return log;
    }

    [Fact]
    public void Bots_act_the_same_whatever_the_rivals_own_until_they_have_scouted_them()
    {
        var roomA = NewMatch(forestSeed: 1, secret: 3);
        var roomB = NewMatch(forestSeed: 1, secret: 40); // the same world, but the rivals have far more soldiers and gold
        Assert.NotEqual(roomA.Game!.CastleOf("o2")!.Soldiers.Values.Sum(), roomB.Game!.CastleOf("o2")!.Soldiers.Values.Sum());

        // No spy is sent before a third of the preparation (200 s of 600): until then the pictures are the same.
        var a = Play(roomA, 150);
        var b = Play(roomB, 150);
        Assert.NotEmpty(a);
        Assert.Equal(a, b);
    }

    [Fact]
    public void Bots_act_the_same_whatever_the_forest_holds_until_they_have_found_it()
    {
        var roomA = NewMatch(forestSeed: 1, secret: 3);
        var roomB = NewMatch(forestSeed: 2, secret: 3); // another forest: other places, other bandits, other loot
        Assert.NotEqual(roomA.Game!.ForestSites.Select(x => x.Position), roomB.Game!.ForestSites.Select(x => x.Position));
        Assert.Equal(roomA.Game.Corners, roomB.Game!.Corners);

        // The first scout leaves at 17 s and needs a while to walk its quarter: nothing is found in the first 24 s.
        var a = Play(roomA, 24);
        var b = Play(roomB, 24);
        Assert.NotEmpty(a);
        Assert.Equal(a, b);
        Assert.Contains(a, x => x.Command.StartsWith("SendExplore"));
    }

    [Fact]
    public void What_the_bot_has_found_is_the_only_thing_the_forest_changes()
    {
        // After the first tour the two forests differ in what was found, and only then do the bot's commands differ.
        var a = Play(NewMatch(forestSeed: 1, secret: 3), 200).Select(x => x.Command).ToList();
        var b = Play(NewMatch(forestSeed: 2, secret: 3), 200).Select(x => x.Command).ToList();
        Assert.NotEqual(a, b);
    }
}
