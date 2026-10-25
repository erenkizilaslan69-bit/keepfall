using Keepfall.Core.Config;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>What the bots do with the forest: scouts, chests, villages, bandit camps and the gold.</summary>
public class BotForestTests
{
    // Easy is pinned to the plain poor bot (see PoorBotRules); Medium is whatever balance.json says.
    private static readonly GameRules Rules = PoorBotRules.From(BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı.")));

    /// <summary>A preparation of the given length played by two bots of one difficulty; returns the room and the host (for their counters).</summary>
    private static (Room Room, BotHost.BotHost Host) Play(BotDifficulty level, int seed, double prep = 600, double war = 0.0, double seconds = 600)
    {
        var room = Room.StartBotMatch("FOR", Rules, new RoomOptions { MinPlayers = 1, PrepSeconds = prep, WarSeconds = war > 0 ? war : 300, Seed = seed }, [level, level]);
        var host = new BotHost.BotHost(Rules, seed);
        for (int t = 0; t < seconds && room.Phase != RoomPhase.Ended; t++) room.Tick(1, dt => host.Step(room, dt));
        return (room, host);
    }

    [Fact]
    public void A_bot_tours_its_own_quarter_early_and_picks_up_chests()
    {
        var (room, _) = Play(BotDifficulty.Medium, seed: 5, seconds: 150);
        foreach (var p in room.Players)
        {
            var game = room.Game!;
            Assert.Contains(game.CornerOf(p.CastleKey), game.ExploredBy(p.CastleKey));
            Assert.True(game.CastleOf(p.CastleKey)!.Stats.GoldGained > 0, $"{p.Name} found no gold");
        }
    }

    [Fact]
    public void In_the_first_half_of_the_preparation_a_bot_stays_in_its_own_quarter()
    {
        var (room, host) = Play(BotDifficulty.Medium, seed: 6, prep: 600, seconds: 295);
        var game = room.Game!;
        foreach (var p in room.Players)
            Assert.Equal([game.CornerOf(p.CastleKey)], game.ExploredBy(p.CastleKey).ToArray());
        // The only places it knows are those of its own quarter (touring it also shows the big camp, which it leaves alone for now).
        foreach (var p in room.Players)
            Assert.All(game.KnownSitesOf(p.CastleKey).Where(k => k.Site.Kind != SiteKind.BigCamp), k => Assert.Equal(game.CornerOf(p.CastleKey), k.Site.Quadrant));
        Assert.Equal(0, host.Stats.Values.Sum(st => st["bigCampAttacks"]));
    }

    [Fact]
    public void A_good_bot_tours_the_other_quarters_too_a_poor_one_hardly_does()
    {
        var medium = Play(BotDifficulty.Medium, seed: 6, seconds: 360).Room;
        var easy = Play(BotDifficulty.Easy, seed: 6, seconds: 360).Room;
        int Explored(Room r) => r.Players.Sum(p => r.Game!.ExploredBy(p.CastleKey).Count);
        Assert.True(Explored(medium) > Explored(easy), $"medium {Explored(medium)}, easy {Explored(easy)}");
        Assert.True(Explored(medium) >= 4);
    }

    [Fact]
    public void Bots_plunder_villages_and_spy_on_each_other()
    {
        var (room, host) = Play(BotDifficulty.Medium, seed: 7);
        Assert.True(host.Stats.Values.Sum(s => s["villageRaids"]) >= 1);
        Assert.All(room.Players, p => Assert.NotEmpty(room.Game!.ReportsOf(p.CastleKey)));
    }

    [Fact]
    public void Bots_spend_their_gold_on_soldiers_when_they_need_them()
    {
        var (room, _) = Play(BotDifficulty.Medium, seed: 8);
        var hired = room.Players.Sum(p => room.Game!.CastleOf(p.CastleKey)!.Stats.MercenariesHired);
        var gained = room.Players.Sum(p => room.Game!.CastleOf(p.CastleKey)!.Stats.GoldGained);
        Assert.True(gained > 0);
        Assert.True(hired > 0, "no mercenary was ever hired");
    }

    [Fact]
    public void A_good_bot_picks_the_camps_it_can_beat_a_poor_one_loses_more_of_them()
    {
        double Rate(BotDifficulty level, out int fights)
        {
            int won = 0;
            fights = 0;
            for (int seed = 20; seed < 28; seed++)
            {
                var (room, _) = Play(level, seed, seconds: 600);
                foreach (var p in room.Players)
                    foreach (var b in room.Game!.BattlesOf(p.CastleKey).Where(b => b.Kind == BattleKind.Camp))
                    {
                        fights++;
                        if (b.Winner == BattleWinner.Attacker) won++;
                    }
            }
            return fights == 0 ? 0 : won / (double)fights;
        }

        double medium = Rate(BotDifficulty.Medium, out int mediumFights);
        double easy = Rate(BotDifficulty.Easy, out int easyFights);
        Assert.True(mediumFights >= 6, $"only {mediumFights} camp fights");
        Assert.True(medium >= 0.85, $"good bots won {medium:P0} of {mediumFights} camp fights");
        Assert.True(medium >= easy, $"good {medium:P0} ({mediumFights}), poor {easy:P0} ({easyFights})");
    }
}
