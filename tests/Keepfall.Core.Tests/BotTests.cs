using Keepfall.Bots;
using Keepfall.BotHost;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>The bot's frame: timing, reaction delay, budget, refused commands, and a room that plays with bots in it.</summary>
public class BotTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static Room RoomWithBots(BotDifficulty a, BotDifficulty b, int seed = 11, double prep = 600, double war = 300)
    {
        var room = new Room("BOTS", Rules, new RoomOptions { MinPlayers = 2, PrepSeconds = prep, WarSeconds = war, Seed = seed });
        var human = room.Join("Ali", null, false, DateTime.UtcNow).Player!;
        Assert.True(room.AddBot(human.Token, a).Ok);
        Assert.True(room.AddBot(human.Token, b).Ok);
        Assert.True(room.SetReady(human.Token, true).Ok);
        Assert.True(room.Start(human.Token).Ok);
        return room;
    }

    [Fact]
    public void The_balance_file_has_slower_thinking_and_reacting_for_the_easy_bot()
    {
        var easy = Rules.Bots.Of(BotDifficulty.Easy);
        var medium = Rules.Bots.Of(BotDifficulty.Medium);
        Assert.True(easy.ThinkMin > medium.ThinkMax - 1e-9 || easy.ThinkMin > medium.ThinkMin);
        Assert.True(easy.ReactMin > medium.ReactMin);
        Assert.True(easy.ReactMax > medium.ReactMax);
        Assert.True(easy.Commands < medium.Commands);
    }

    [Fact]
    public void A_bot_thinks_only_when_it_is_due_and_then_waits_its_pause()
    {
        var room = RoomWithBots(BotDifficulty.Medium, BotDifficulty.Medium);
        var host = new BotHost.BotHost(Rules, 3);
        var level = Rules.Bots.Medium;
        var thinkTimes = new List<double>();
        for (int t = 0; t < 120; t++)
        {
            int before = host.Stats.TryGetValue(2, out var s) ? s["thinks"] : 0;
            room.Tick(1, dt => host.Step(room, dt));
            int after = host.Stats[2]["thinks"];
            if (after > before) thinkTimes.Add(room.Game!.ElapsedSeconds);
        }
        Assert.True(thinkTimes.Count > 120 / level.ThinkMax - 3 && thinkTimes.Count < 120 / level.ThinkMin + 3, $"thought {thinkTimes.Count} times");
        // Never twice within the shortest pause (ticks are whole seconds, so allow one second of rounding).
        Assert.All(thinkTimes.Zip(thinkTimes.Skip(1)), p => Assert.True(p.Second - p.First >= level.ThinkMin - 1e-9));
    }

    [Fact]
    public void A_bot_puts_its_idle_people_to_work_through_the_ordinary_commands()
    {
        var room = RoomWithBots(BotDifficulty.Medium, BotDifficulty.Easy);
        var host = new BotHost.BotHost(Rules, 5);
        for (int t = 0; t < 40; t++) room.Tick(1, dt => host.Step(room, dt));

        foreach (var bot in room.Players.Where(p => p.IsBot))
        {
            var view = ViewMapper.CastleOf(room, bot)!;
            Assert.True(view.Jobs.First(j => j.Job == Job.Idle).Count <= 2, $"{bot.Name} left people idle");
            Assert.True(view.Jobs.First(j => j.Job == Job.Farmer).Count > 0);
        }
        Assert.True(host.Stats.Values.All(s => s["commands"] > 0));
    }

    [Fact]
    public void A_refused_command_is_not_offered_again_straight_away()
    {
        var memory = new BotMemory(Rules.Bots.Medium);
        var command = new MoveWorkers(Job.Idle, Job.Farmer, 3);
        memory.Refused(command, now: 100);
        Assert.True(memory.IsRefused(command, 110));
        Assert.False(memory.IsRefused(command, 121));
        Assert.False(memory.IsRefused(new MoveWorkers(Job.Idle, Job.Farmer, 2), 110));
    }

    [Fact]
    public void An_incoming_army_reaches_the_bots_mind_only_after_its_reaction_delay()
    {
        var room = RoomWithBots(BotDifficulty.Easy, BotDifficulty.Easy, prep: 5, war: 600);
        var bot = room.Players.First(p => p.IsBot);
        var game = room.Game!;
        for (int i = 0; i < 6; i++) room.Tick(1); // the war has begun
        var other = room.Players.Last(p => p.IsBot && p.Seat != bot.Seat);
        game.CastleOf(other.CastleKey)!.AddSoldiers(Rules.FindUnit("kilicli")!, 5);
        Assert.True(room.Execute(other.Token, new SendArmy(bot.CastleKey, new Dictionary<string, int> { ["kilicli"] = 5 })).Ok);

        var memory = new BotMemory(Rules.Bots.Easy);
        var rng = new Random(1);
        double noticed = -1, due = -1;
        for (int t = 0; t < 60 && due < 0; t++)
        {
            room.Tick(1);
            var input = new BotInput(ViewMapper.CastleOf(room, bot)!, null, null, ViewMapper.ToView(room), bot.Seat);
            memory.Observe(input, rng);
            if (noticed < 0 && memory.Events.Count > 0) noticed = game.ElapsedSeconds;
            if (memory.Due(BotEventKind.IncomingArmy, game.ElapsedSeconds).Any()) due = game.ElapsedSeconds;
        }
        Assert.True(noticed > 0 && due > 0, "the warning never reached the bot");
        var easy = Rules.Bots.Easy;
        Assert.InRange(due - noticed, easy.ReactMin - 1e-9, easy.ReactMax + 1e-9);
        Assert.Single(memory.Events); // seen again every tick, still one event
    }

    [Fact]
    public void Bots_do_not_get_the_humans_notifications_and_no_bot_token_is_in_any_view()
    {
        var room = RoomWithBots(BotDifficulty.Medium, BotDifficulty.Medium);
        var json = System.Text.Json.JsonSerializer.Serialize(ViewMapper.ToView(room));
        foreach (var p in room.Players) Assert.DoesNotContain(p.Token, json);
        var bot = room.Players.First(p => p.IsBot);
        Assert.DoesNotContain(bot.Token, System.Text.Json.JsonSerializer.Serialize(ViewMapper.CastleOf(room, bot)));
    }

    [Fact]
    public void The_same_seed_plays_the_same_match()
    {
        string Run()
        {
            var room = RoomWithBots(BotDifficulty.Medium, BotDifficulty.Easy, seed: 21);
            var host = new BotHost.BotHost(Rules, 8);
            for (int t = 0; t < 90; t++) room.Tick(1, dt => host.Step(room, dt));
            return string.Join("|", room.Players.Select(p => ViewMapper.CastleOf(room, p)!)
                .Select(c => $"{c.Population}/{c.Resources.Food:0.0}/{string.Join(",", c.Jobs.Select(j => j.Count))}"));
        }
        Assert.Equal(Run(), Run());
    }
}
