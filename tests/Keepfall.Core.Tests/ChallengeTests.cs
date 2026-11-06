using System.Text.Json;
using Keepfall.Core;
using Keepfall.Core.Challenges;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.Core.Tests;

/// <summary>Challenge mode: the definitions load and are checked, the daily one depends on the date only, the room is built from the definition, goals and stars come from the finished room.</summary>
public class ChallengeTests
{
    private static readonly string BalancePath = BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı.");
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(BalancePath);
    private static readonly ChallengeCatalog Catalog = ChallengeCatalog.LoadBeside(BalancePath, Rules);

    private static string ShippedJson() => File.ReadAllText(Path.Combine(Path.GetDirectoryName(BalancePath)!, "challenges.json"));

    // ---- the definitions -----------------------------------------------------------------------

    [Fact]
    public void The_shipped_file_loads_with_six_to_eight_challenges_that_each_teach_one_thing()
    {
        Assert.InRange(Catalog.All.Count, 6, 8);
        Assert.Equal(Enumerable.Range(1, Catalog.All.Count), Catalog.All.Select(c => c.Order));
        foreach (var c in Catalog.All)
        {
            Assert.NotEmpty(c.Name.Tr); Assert.NotEmpty(c.Name.En);
            Assert.NotEmpty(c.Description.Tr); Assert.NotEmpty(c.Description.En);
            Assert.Contains(c.Goals, g => g.Type == GoalTypes.Win && g.Star == 1);
            Assert.All(c.Goals, g => Assert.Contains(g.Type, GoalTypes.All));
        }
        // every kingdom has a challenge of its own
        foreach (var f in Factions.All) Assert.Contains(Catalog.All, c => c.Kingdom == f.Id);
    }

    [Fact]
    public void A_missing_file_is_no_challenges()
    {
        var dir = Path.Combine(Path.GetTempPath(), "kf-nochallenges-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try { Assert.Empty(ChallengeCatalog.LoadBeside(Path.Combine(dir, "balance.json"), Rules).All); }
        finally { Directory.Delete(dir, true); }
    }

    [Theory]
    [InlineData("\"type\": \"minReports\"", "\"type\": \"minCoffee\"", "ölçülemeyen")]
    [InlineData("\"kingdom\": \"golge\"", "\"kingdom\": \"yok\"", "bilinmeyen krallık")]
    [InlineData("\"difficulty\": \"medium\"", "\"difficulty\": \"insane\"", "bot zorluğu")]
    [InlineData("\"id\": \"gozcu-ve-rapor\"", "\"id\": \"ilk-zafer\"", "birden fazla")]
    [InlineData("\"playerDeck\": [\"okcu\", \"kilicli\", \"kalkanli\", \"kesis\"]", "\"playerDeck\": [\"okcu\"]", "destesi geçersiz")]
    [InlineData("\"warSeconds\": 540", "\"warSeconds\": 5", "warSeconds")]
    [InlineData("\"version\": 1", "\"version\": 2", "sürümü")]
    [InlineData("\"order\": 8", "\"order\": 9", "order")]
    public void A_broken_definition_is_refused_when_loading(string from, string to, string message)
    {
        var json = ShippedJson();
        Assert.Contains(from, json);
        var ex = Assert.Throws<ChallengeConfigException>(() => ChallengeCatalog.LoadFromJson(json.Replace(from, to), Rules));
        Assert.Contains(message, ex.Message);
    }

    [Fact]
    public void A_challenge_without_a_win_goal_or_with_an_unknown_field_or_bad_json_is_refused()
    {
        var json = ShippedJson();
        var noWin = json.Replace("{ \"id\": \"win\", \"type\": \"win\", \"value\": 1, \"star\": 1 },", "", StringComparison.Ordinal);
        Assert.NotEqual(json, noWin);
        Assert.Throws<ChallengeConfigException>(() => ChallengeCatalog.LoadFromJson(noWin, Rules));
        var unknownField = json.Replace("\"seed\": 7101,", "\"seed\": 7101, \"mystery\": 1,");
        Assert.NotEqual(json, unknownField);
        Assert.Throws<ChallengeConfigException>(() => ChallengeCatalog.LoadFromJson(unknownField, Rules));
        Assert.Throws<ChallengeConfigException>(() => ChallengeCatalog.LoadFromJson("{ not json", Rules));
        Assert.Throws<ChallengeConfigException>(() => ChallengeCatalog.LoadFromJson("null", Rules));
    }

    // ---- the daily challenge -------------------------------------------------------------------

    [Fact]
    public void The_daily_challenge_depends_on_the_utc_date_only()
    {
        static string Json(ChallengeDef d) => JsonSerializer.Serialize(d);
        var morning = ChallengeCatalog.Daily(new DateTime(2026, 11, 6, 0, 5, 0, DateTimeKind.Utc), Rules);
        var night = ChallengeCatalog.Daily(new DateTime(2026, 11, 6, 23, 59, 0, DateTimeKind.Utc), Rules);
        Assert.Equal(Json(morning), Json(night));
        Assert.Equal("daily-20261106", morning.Id);
        Assert.Equal(20261106, morning.Seed);
        // a new day is a new match (over a month it is not always the same kingdom or number of bots)
        var days = Enumerable.Range(0, 30).Select(i => ChallengeCatalog.Daily(new DateTime(2026, 11, 1, 12, 0, 0, DateTimeKind.Utc).AddDays(i), Rules)).ToList();
        Assert.True(days.Select(d => d.Kingdom).Distinct().Count() > 1);
        Assert.True(days.Select(d => d.Bots.Count).Distinct().Count() > 1);
        Assert.Equal(30, days.Select(d => d.Seed).Distinct().Count());
        foreach (var d in days)
        {
            var errors = new List<string>();
            ChallengeCatalog.Validate(d, Rules, errors);
            Assert.Empty(errors);
        }
    }

    // ---- the room ------------------------------------------------------------------------------

    private static (Room Room, RoomPlayer Human) Lobby()
    {
        var room = new Room("ABCDEF", Rules);
        var human = room.Join("Ada", null, false, DateTime.UtcNow).Player!;
        return (room, human);
    }

    [Fact]
    public void A_challenge_room_is_built_from_the_definition_and_is_the_same_every_time()
    {
        var def = Catalog.Find("hayalet-ordu")!;
        static (string, string?)[] Describe(Room r) => r.Players.Select(p => (p.Name + p.Bot, r.Game!.FactionOf(p.CastleKey))).ToArray();
        var (r1, h1) = Lobby();
        var (r2, h2) = Lobby();
        Assert.True(r1.StartChallenge(h1.Token, def).Ok);
        Assert.True(r2.StartChallenge(h2.Token, def).Ok);

        Assert.Equal(RoomPhase.Preparation, r1.Phase);
        Assert.Equal(def.Id, r1.Challenge!.Id);
        Assert.Equal(def.Bots.Count + 1, r1.Players.Count);
        Assert.Equal(def.Bots.Count, r1.Players.Count(p => p.IsBot));
        Assert.Equal(def.Kingdom, r1.Game!.FactionOf(h1.CastleKey));
        Assert.Equal(def.WarSeconds, r1.Game.WarSeconds);
        Assert.Equal(Describe(r1), Describe(r2));
        Assert.Equal(def.PlayerDeck!.Order(), r1.CastleOf(h1)!.UnitTypes.Select(u => u.Id).Order());
        // the forest comes from the seed too
        Assert.Equal(r1.Game.AllSites.Select(s => s.Site.Id), r2.Game.AllSites.Select(s => s.Site.Id));
        Assert.Equal(r1.Game.AllSites.Select(s => s.Site.Position), r2.Game.AllSites.Select(s => s.Site.Position));
        // every player's kingdom is different
        Assert.Equal(r1.Players.Count, r1.Players.Select(p => r1.Game.FactionOf(p.CastleKey)).Distinct().Count());
    }

    [Fact]
    public void A_challenge_is_for_one_player_and_only_from_the_lobby()
    {
        var (room, human) = Lobby();
        room.Join("Bob", null, false, DateTime.UtcNow);
        var refused = room.StartChallenge(human.Token, Catalog.All[0]);
        Assert.False(refused.Ok);
        Assert.Contains("tek kişilik", refused.Error);

        var (solo, me) = Lobby();
        Assert.True(solo.StartChallenge(me.Token, Catalog.All[0]).Ok);
        Assert.False(solo.StartChallenge(me.Token, Catalog.All[0]).Ok); // already in a match
        Assert.False(solo.StartChallenge("not-a-token", Catalog.All[0]).Ok);
    }

    [Fact]
    public void An_invalid_definition_never_starts_a_match()
    {
        var (room, human) = Lobby();
        var bad = new ChallengeDef { Id = "x", Kingdom = "yok", Bots = [new ChallengeBot()], Goals = [] };
        Assert.False(room.StartChallenge(human.Token, bad).Ok);
        Assert.Equal(RoomPhase.Lobby, room.Phase);
        Assert.Null(room.Challenge);
    }

    [Fact]
    public void Playing_again_in_the_same_room_starts_from_scratch()
    {
        var (room, human) = Lobby();
        var def = Catalog.All[0];
        Assert.True(room.StartChallenge(human.Token, def).Ok);
        var first = room.Game;
        Win(room, human);
        Assert.True(room.BackToLobby(human.Token).Ok);
        Assert.Null(room.Challenge);
        Assert.True(room.StartChallenge(human.Token, def).Ok);
        Assert.NotSame(first, room.Game);
        Assert.Equal(def.Bots.Count + 1, room.Players.Count); // not more bots than before
        Assert.Equal(RoomPhase.Preparation, room.Phase);
    }

    // ---- goals and stars -----------------------------------------------------------------------

    /// <summary>The human walks over the (idle) bots and the match ends with their win.</summary>
    private static void Win(Room room, RoomPlayer human)
    {
        while (room.Game!.Phase == MatchPhase.Preparation) room.Tick(1);
        var sword = Rules.FindUnit("kilicli")!;
        room.Game.CastleOf(human.CastleKey)!.AddSoldiers(sword, 60);
        foreach (var bot in room.Players.Where(p => p.IsBot))
        {
            var sent = room.Execute(human.Token, new SendArmy(bot.CastleKey, new Dictionary<string, int> { ["kilicli"] = 20 }));
            Assert.True(sent.Ok, sent.Error);
        }
        for (int i = 0; i < 1500 && room.Phase != RoomPhase.Ended; i++) room.Tick(1);
        Assert.Equal(RoomPhase.Ended, room.Phase);
    }

    private static ChallengeDef Custom(params ChallengeGoal[] goals) => new()
    {
        Id = "t", Order = 1, Name = new() { Tr = "t", En = "t" }, Description = new() { Tr = "t", En = "t" }, Kingdom = Factions.Merchant, Seed = 5,
        PlayerDeck = ["okcu", "kilicli", "mizrakci", "kalkanli"], Bots = [new ChallengeBot { Difficulty = "easy" }], WarSeconds = 600, Goals = [.. goals],
    };

    private static ChallengeGoal G(string id, string type, double value, int star) => new() { Id = id, Type = type, Value = value, Star = star };

    [Fact]
    public void Stars_count_the_goals_in_order()
    {
        var (room, human) = Lobby();
        Assert.True(room.StartChallenge(human.Token, Custom(
            G("win", GoalTypes.Win, 1, 1),
            G("few", GoalTypes.MaxSoldiersLost, 0, 2),
            G("fast", GoalTypes.WinWithin, 1, 3))).Ok);
        Assert.Null(ChallengeEvaluator.Evaluate(room, human)); // the match is not over yet
        Win(room, human);

        var outcome = ChallengeEvaluator.Evaluate(room, human)!;
        Assert.True(outcome.Won);
        Assert.Equal(2, outcome.Stars); // won, lost nobody, but not within one second
        Assert.True(outcome.Goals.Single(g => g.Id == "win").Passed);
        Assert.True(outcome.Goals.Single(g => g.Id == "few").Passed);
        Assert.False(outcome.Goals.Single(g => g.Id == "fast").Passed);
        Assert.True(outcome.Goals.Single(g => g.Id == "fast").Actual > 1);
    }

    [Fact]
    public void Counting_goals_use_the_players_own_figures()
    {
        var (room, human) = Lobby();
        Assert.True(room.StartChallenge(human.Token, Custom(
            G("win", GoalTypes.Win, 1, 1),
            G("felled", GoalTypes.MinCastlesFelled, 1, 2),
            G("won", GoalTypes.MinBattlesWon, 1, 2),
            G("scouts", GoalTypes.MinScouts, 1, 3),
            G("decoys", GoalTypes.MinDecoys, 1, 3))).Ok);
        var bot = room.Players.First(p => p.IsBot);
        var scouted = room.Execute(human.Token, new SendScout(bot.CastleKey, Job.Idle));
        Assert.True(scouted.Ok, scouted.Error);
        Win(room, human);

        var outcome = ChallengeEvaluator.Evaluate(room, human)!;
        Assert.Equal(2, outcome.Stars);
        Assert.True(outcome.Goals.Single(g => g.Id == "felled").Passed);
        Assert.Equal(1, outcome.Goals.Single(g => g.Id == "scouts").Actual);
        Assert.Equal(0, outcome.Goals.Single(g => g.Id == "decoys").Actual);
        Assert.False(outcome.Goals.Single(g => g.Id == "decoys").Passed);
    }

    [Fact]
    public void A_match_that_is_not_won_gives_no_stars_even_if_a_limit_holds()
    {
        var (room, human) = Lobby();
        Assert.True(room.StartChallenge(human.Token, Custom(
            G("win", GoalTypes.Win, 1, 1), G("few", GoalTypes.MaxSoldiersLost, 5, 2), G("fast", GoalTypes.WinWithin, 500, 3))).Ok);
        // nobody does anything: the bot is not played and the human sits still; whatever the result is, it must be consistent
        for (int i = 0; i < 2000 && room.Phase != RoomPhase.Ended; i++) room.Tick(1);
        var outcome = ChallengeEvaluator.Evaluate(room, human)!;
        if (!outcome.Won)
        {
            Assert.Equal(0, outcome.Stars);
            Assert.False(outcome.Goals.Single(g => g.Id == "few").Passed); // a limit does not count in a lost match
        }
        else Assert.True(outcome.Stars >= 1);
    }

    [Fact]
    public void An_ordinary_room_has_no_challenge_result()
    {
        var room = new Room("ABCDEF", Rules, new RoomOptions { MinPlayers = 1 });
        var human = room.Join("Ada", null, false, DateTime.UtcNow).Player!;
        room.AddBot(human.Token, BotDifficulty.Easy);
        room.SetReady(human.Token, true);
        Assert.True(room.Start(human.Token).Ok);
        Assert.Null(room.Challenge);
        Assert.Null(ChallengeEvaluator.Evaluate(room, human));
    }
}
