using System.Reflection;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Match;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>Envoys: goods and a message to a rival's castle. They have a slot of their own (one on the road at a time), the scout's speed, gather nothing and cannot be caught.</summary>
public class EnvoyTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3";

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    private static GameState NewGame(double prep = 300)
    {
        var game = new GameState(Rules, [A, B, C], prepSeconds: prep, warSeconds: 1000, rng: new Random(1),
            corners: new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast, [C] = Corner.NorthEast });
        foreach (var p in new[] { A, B, C }) Ok(game.Execute(p, new SetGrowth(false)));
        game.CastleOf(A)!.AddGold(100);
        game.CastleOf(A)!.AddGoods(100, 100, 100);
        return game;
    }

    private static void UntilHome(GameState game, string player)
    {
        for (int t = 0; t < 600 && game.MissionsOf(player).Count > 0; t++) game.Tick(1);
        Assert.Empty(game.MissionsOf(player));
    }

    [Fact]
    public void The_goods_leave_the_senders_stores_at_once_and_reach_the_receiver_with_the_message()
    {
        var game = NewGame();
        var a = game.CastleOf(A)!; var b = game.CastleOf(B)!;
        double aFood = a.Food, aGold = a.Gold, bIron = b.Iron, bGold = b.Gold;
        Ok(game.Execute(A, new SendEnvoy(B, 5, 0, 3, 10, "Barış olsun.")));
        Assert.Equal(aFood - 5, a.Food, 6);
        Assert.Equal(aGold - 10, a.Gold, 6);
        Assert.Equal(1, a.ScoutsAway);
        Assert.Empty(game.LettersOf(B)); // not there yet

        while (!game.LettersOf(B).Any()) game.Tick(1);
        var letter = Assert.Single(game.LettersOf(B));
        Assert.Equal((A, 5, 0, 3, 10, "Barış olsun."), (letter.From, letter.Food, letter.Wood, letter.Iron, letter.Gold, letter.Message));
        Assert.True(b.Iron >= bIron + 3 - 1e-6 && b.Gold >= bGold + 10 - 1e-6); // (food is eaten as it goes)
        Assert.Empty(game.LettersOf(A)); // the sender gets nothing back, only a notice
        Assert.Empty(game.LettersOf(C));
        Assert.Contains(game.TakeNotifications(B), n => n.Kind == NotificationKind.EnvoyArrived && n.OtherPlayer == A);
        Assert.Contains(game.TakeNotifications(A), n => n.Kind == NotificationKind.EnvoyDelivered && n.OtherPlayer == B);
        Assert.Empty(game.TakeNotifications(C));

        UntilHome(game, A);
        Assert.Equal(0, a.ScoutsAway);
        Assert.Equal(aGold - 10, a.Gold, 6); // it does not bring anything back
    }

    [Fact]
    public void An_envoy_has_a_slot_of_its_own_one_at_a_time_and_the_next_goes_when_it_is_home_and_the_last_minute_ban_does_not_apply_to_it()
    {
        Assert.Equal(1, Rules.Scouting.MaxScouts);
        Assert.Equal(1, Rules.Envoy.MaxAtOnce);
        Assert.Equal(0, Rules.Envoy.MaxPerMatch);
        var game = NewGame();
        Ok(game.Execute(A, new SendEnvoy(B, 1, 0, 0, 0)));
        var second = game.Execute(A, new SendEnvoy(C, 0, 0, 0, 1)); // one envoy on the road at a time, checked by the server
        Assert.False(second.Ok);
        Assert.Contains("Ulağın yolda", second.Error);
        Ok(game.Execute(A, new SendScout(C))); // the scout's slot is its own: an envoy out does not block it
        Assert.False(game.Execute(A, new SendEnvoy(C, 0, 0, 0, 1)).Ok);
        var m = game.MissionsOf(A).Single(x => x.Kind == MissionKind.Envoy);
        Assert.Equal(MissionKind.Envoy, m.Kind);
        Assert.Equal(Rules.Map.ScoutSpeed * Rules.Match.PrepSpeed, m.Leg.Speed); // a scout (and an envoy) leaves in the preparation: it walks as much faster as the economy
        UntilHome(game, A);

        // and with a scout out, an envoy can still go (they do not share a slot any more); once the envoy is home the next one goes
        Ok(game.Execute(A, new SendScout(C)));
        Ok(game.Execute(A, new SendEnvoy(B, 1, 0, 0, 0)));
        UntilHome(game, A);
        for (int i = 0; i < 3; i++) { Ok(game.Execute(A, new SendEnvoy(B, 1, 0, 0, 0))); Assert.False(game.Execute(A, new SendEnvoy(B, 1, 0, 0, 0)).Ok); UntilHome(game, A); }

        var late = NewGame(prep: 100);
        for (int t = 0; t < 70; t++) late.Tick(1);
        Assert.True(late.ScoutingLocked);
        Assert.False(late.Execute(A, new SendScout(B)).Ok);
        Ok(late.Execute(A, new SendEnvoy(B, 1, 0, 0, 0, "Son dakika.")));
    }

    [Fact]
    public void An_envoy_gathers_nothing_no_trail_no_report_no_vision_and_nobody_is_told_of_a_scout()
    {
        var game = NewGame();
        Ok(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0, "Selam")));
        int circles = game.VisionOf(A).Count;
        for (int t = 0; t < 30; t++) game.Tick(1);
        Assert.Equal(circles, game.VisionOf(A).Count);
        Assert.Equal(1, circles); // just the castle
        Assert.Empty(game.TrailOf(A));
        UntilHome(game, A);
        Assert.Empty(game.ReportsOf(A));
        Assert.DoesNotContain(game.TakeNotifications(B), n => n.Kind == NotificationKind.ScoutedBy);
    }

    [Fact]
    public void Others_who_can_see_an_envoy_see_a_walking_envoy_in_its_senders_colour()
    {
        var game = NewGame();
        Ok(game.Execute(A, new SendEnvoy(B, 4, 0, 0, 0, "gizli mesaj")));
        bool seenByTarget = false;
        for (int t = 0; t < 120 && game.MissionsOf(A).Count > 0; t++)
        {
            game.Tick(1);
            foreach (var s in game.SeenBy(B)) { Assert.Equal(MoverKind.Envoy, s.Kind); Assert.Equal(A, s.Owner); Assert.Empty(s.Units); seenByTarget = true; }
            foreach (var s in game.SeenBy(C)) { Assert.Equal(MoverKind.Envoy, s.Kind); Assert.Equal(A, s.Owner); }
            Assert.DoesNotContain(game.SeenBy(A), s => s.Kind == MoverKind.Envoy); // never its own
        }
        Assert.True(seenByTarget, "the receiver should see it walk up to the gate");
    }

    [Fact]
    public void An_envoy_is_never_caught_it_stays_out_of_every_road_fight()
    {
        var game = NewGame(prep: 2);
        game.CastleOf(B)!.AddSoldiers(Rules.FindUnit("kilicli")!, 3);
        game.CastleOf(C)!.AddSoldiers(Rules.FindUnit("kilicli")!, 3);
        Ok(game.Execute(A, new SendEnvoy(B, 2, 0, 0, 0, "geçiyorum")));
        game.Tick(1); game.Tick(1);
        Ok(game.Execute(C, new SendArmy(B, new Dictionary<string, int> { ["kilicli"] = 3 }))); // armies out on the same roads
        for (int t = 0; t < 600 && !game.LettersOf(B).Any(); t++) game.Tick(1);
        Assert.Single(game.LettersOf(B));
        Assert.DoesNotContain(game.ActiveBattles, b => b.Involves(A));
    }

    [Fact]
    public void Checks_on_the_target_the_load_and_the_message()
    {
        var game = NewGame();
        Assert.False(game.Execute(A, new SendEnvoy(A, 1, 0, 0, 0)).Ok); // yourself
        Assert.False(game.Execute(A, new SendEnvoy("o9", 1, 0, 0, 0)).Ok); // nobody
        Assert.False(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0)).Ok); // nothing to carry
        Assert.False(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0, "   ")).Ok);
        Assert.False(game.Execute(A, new SendEnvoy(B, -1, 5, 0, 0)).Ok);
        int max = Rules.Envoy.MaxCargo;
        Assert.Equal(40, max);
        Assert.False(game.Execute(A, new SendEnvoy(B, 10, 10, 10, 11)).Ok); // 41
        Assert.False(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 1000)).Ok); // not in the stores
        Assert.False(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0, new string('x', Rules.Envoy.MaxMessageLength + 1))).Ok);
        foreach (var bad in new[] { "iki\nsatır", "sekme\there", "gizli​karakter", "bidi‮metin", "nul\0" })
            Assert.False(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0, bad)).Ok, bad);
        Assert.Equal(0, game.CastleOf(A)!.ScoutsAway); // none of that sent anybody
        Ok(game.Execute(A, new SendEnvoy(B, 10, 10, 10, 10, new string('x', Rules.Envoy.MaxMessageLength))));
    }

    [Fact]
    public void The_message_is_kept_as_it_was_sent_markup_and_all_and_trimmed()
    {
        var game = NewGame();
        Ok(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0, "  <img src=x onerror=alert(1)> & \"tırnak\"  ")));
        while (!game.LettersOf(B).Any()) game.Tick(1);
        Assert.Equal("<img src=x onerror=alert(1)> & \"tırnak\"", game.LettersOf(B)[0].Message); // the client shows it as text only
    }

    [Fact]
    public void Nothing_can_be_sent_to_a_fallen_player_and_goods_for_one_who_falls_on_the_way_go_home_again()
    {
        var game = NewGame();
        Ok(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 20, "geç kalma")));
        double gold = game.CastleOf(A)!.Gold;
        typeof(GameState).GetMethod("Eliminate", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(game, [B]);
        UntilHome(game, A);
        Assert.Empty(game.LettersOf(B));
        Assert.Equal(gold + 20, game.CastleOf(A)!.Gold, 6);
        Assert.False(game.Execute(A, new SendEnvoy(B, 1, 0, 0, 0)).Ok);
        Assert.False(game.Execute(B, new SendEnvoy(A, 1, 0, 0, 0)).Ok); // and the fallen send nothing
    }

    [Fact]
    public void A_disguised_envoy_follows_the_same_one_at_a_time_rule_and_a_per_match_limit_counts_every_envoy()
    {
        var path = Path.Combine(Path.GetTempPath(), $"kf-envoy-{Guid.NewGuid():N}.json");
        var text = File.ReadAllText(BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)!).TrimStart('﻿');
        File.WriteAllText(path, text.Replace("\"maxPerMatch\": 0", "\"maxPerMatch\": 2"));
        try
        {
            var rules = BalanceConfigLoader.LoadFromFile(path);
            Assert.Equal(2, rules.Envoy.MaxPerMatch);
            var game = new GameState(rules, [A, B, C], prepSeconds: 300, warSeconds: 1000, rng: new Random(1),
                corners: new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast, [C] = Corner.NorthEast });
            game.CastleOf(A)!.AddGoods(100, 100, 100);
            Ok(game.Execute(A, new SendEnvoy(B, 1, 0, 0, 0)));
            for (int t = 0; t < 600 && game.MissionsOf(A).Count > 0; t++) game.Tick(1);
            Ok(game.Execute(A, new SendEnvoy(B, 1, 0, 0, 0)));
            for (int t = 0; t < 600 && game.MissionsOf(A).Count > 0; t++) game.Tick(1);
            var third = game.Execute(A, new SendEnvoy(B, 1, 0, 0, 0));
            Assert.False(third.Ok);
            Assert.Contains("en fazla 2 ulak", third.Error);
        }
        finally { File.Delete(path); }
    }

}

/// <summary>The message checks and the optional swear-word mask.</summary>
public class EnvoyMessageTests
{
    private static readonly EnvoyRules Off = new(40, 140, false), On = new(40, 140, true);

    [Fact]
    public void The_filter_is_on_in_the_shipped_config_and_off_means_the_text_is_left_alone()
    {
        var rules = BalanceConfigLoader.LoadFromFile(BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)!);
        Assert.True(rules.Envoy.ProfanityFilter);
        Assert.Equal("fuck you", EnvoyMessage.Check("fuck you", Off).Text);
        // An emoji is fine, half of one cannot be sent as JSON.
        Assert.True(EnvoyMessage.Check("selam \U0001F600", Off).Ok);
        Assert.False(EnvoyMessage.Check("selam \ud83d", Off).Ok);
    }

    [Theory]
    [InlineData("fuck you", "**** you")]
    [InlineData("What the SHIT", "What the ****")]
    [InlineData("siktir git", "****** git")]
    [InlineData("Siktirgit", "*********")]
    [InlineData("amk ne yapıyorsun", "*** ne yapıyorsun")]
    [InlineData("ORospu çocuğu", "****** çocuğu")]
    [InlineData("PİÇ misin", "*** misin")]
    [InlineData("you ass", "you ***")]
    public void Swear_words_become_stars_in_the_mild_tier_and_in_names(string text, string masked)
    {
        // Two tiers: the server leaves ordinary swearing in a MESSAGE (the receiver's own game masks it, by the receiver's setting)...
        Assert.Equal(text, EnvoyMessage.Check(text, On).Text);
        // ...the mild tier itself (what that game applies) and a player's name (both tiers, always) mask it.
        Assert.Equal(masked, EnvoyMessage.MaskMild(text));
        Assert.Equal(masked, EnvoyMessage.Mask(text));
    }

    // The hate tier: slurs and death wishes, in every language. The server masks them in every message, whatever the config or anybody's settings say.
    [Theory]
    [InlineData("tr", "seni ibne", "ibne")]
    [InlineData("en", "you faggot", "faggot")]
    [InlineData("en", "dirty kike", "kike")]
    [InlineData("en", "what a retard", "retard")]
    [InlineData("de", "du Kanake", "Kanake")]
    [InlineData("de", "so eine Schwuchtel", "Schwuchtel")]
    [InlineData("es", "eres un maricón", "maricón")]
    [InlineData("fr", "sale pédé", "pédé")]
    [InlineData("it", "sei un frocio", "frocio")]
    [InlineData("pt", "seu viado", "viado")]
    [InlineData("pl", "ty cwelu", "cwelu")]
    [InlineData("ru", "ты пидор", "пидор")]
    [InlineData("uk", "ти підор", "підор")]
    [InlineData("zh", "你这个脑残", "脑残")]
    [InlineData("ja", "死ね", "死ね")]
    [InlineData("ko", "이 병신아", "병신")]
    public void Hate_speech_is_always_masked_by_the_server(string lang, string text, string word)
    {
        Assert.NotEmpty(lang);
        foreach (var rules in new[] { On, Off })
        {
            var sent = EnvoyMessage.Check(text, rules).Text!;
            Assert.DoesNotContain(word, sent, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("*", sent);
            Assert.Equal(text.Length, sent.Length);
        }
        // and the mild tier alone would NOT have caught it: the two lists do not overlap
        Assert.Contains(word, EnvoyMessage.MaskMild(text), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void A_message_with_both_keeps_the_swearing_for_the_receiver_to_decide_and_loses_the_slur()
    {
        var sent = EnvoyMessage.Check("fuck you, you faggot, scheiße", Off).Text!;
        Assert.Equal("fuck you, you ******, scheiße", sent);
        Assert.Equal("**** you, you ******, *******", EnvoyMessage.MaskMild(sent)); // what a receiver with the filter on sees
    }

    [Theory]
    [InlineData("class assignment")]
    [InlineData("aquarium")]
    [InlineData("Barış ve dostluk, mal alışverişi")]
    [InlineData("sikke ve altın")]
    [InlineData("Bütün hamle iyi niyetle")]
    public void Harmless_words_that_only_look_alike_are_left_alone(string text) =>
        Assert.Equal(text, EnvoyMessage.Mask(EnvoyMessage.Check(text, On).Text!));

    // The embedded per-language lists (Match/Profanity/*.txt): at least two words of each language must be masked, and the word must be gone from the result.
    [Theory]
    [InlineData("de", "Du bist ein Arschloch", "Arschloch")]
    [InlineData("de", "so ein Wichser", "Wichser")]
    [InlineData("es", "eres un gilipollas", "gilipollas")]
    [InlineData("es", "qué mierda", "mierda")]
    [InlineData("fr", "espèce de connard", "connard")]
    [InlineData("fr", "quelle merde", "merde")]
    [InlineData("it", "sei uno stronzo", "stronzo")]
    [InlineData("it", "che cazzo fai", "cazzo")]
    [InlineData("pt", "seu filho da puta", "filho da puta")]
    [InlineData("pt", "que caralho", "caralho")]
    [InlineData("pl", "ty kurwa", "kurwa")]
    [InlineData("pl", "spierdalaj stąd", "spierdalaj")]
    [InlineData("ru", "ты мудак", "мудак")]
    [InlineData("ru", "пошёл нахуй", "нахуй")]
    [InlineData("uk", "ти довбойоб", "довбойоб")]
    [InlineData("uk", "що за гівно", "гівно")]
    [InlineData("zh", "你这个傻逼", "傻逼")]
    [InlineData("zh", "他妈的", "他妈的")]
    [InlineData("ja", "このクソ野郎", "クソ野郎")]
    [InlineData("ja", "ファック", "ファック")]
    [InlineData("ko", "이 씨발 놈", "씨발")]
    [InlineData("ko", "병신 같네", "병신")]
    public void Swear_words_of_the_other_languages_are_masked(string lang, string text, string word)
    {
        Assert.NotEmpty(lang); // documents which list the sample comes from
        var masked = EnvoyMessage.Mask(EnvoyMessage.Check(text, On).Text!); // (either tier: this list of samples is older than the split)
        Assert.DoesNotContain(word, masked, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("*", masked);
    }

    [Theory]
    [InlineData("Die Vergangenheit ist vorbei und der Klassenraum offen")]
    [InlineData("la bite d'amarrage du bateau")]
    [InlineData("el pinche cocinero puso la mesa")]
    [InlineData("a putative leader and a retardant coating")]
    [InlineData("il pesce e il finocchio sono freschi")]
    [InlineData("o veado correu pela floresta")]
    [InlineData("Мы идём в голый лес за грибами")]
    [InlineData("Привіт, друже, як справи")]
    [InlineData("Dzień dobry, jak się masz")]
    [InlineData("今天天气很好，我们去攻城")]
    [InlineData("ナクソス島とエクソシスト")]
    [InlineData("안녕하세요 보지 말고 가세요")]
    public void Clean_sentences_in_the_other_languages_are_not_masked(string text) =>
        Assert.Equal(text, EnvoyMessage.Mask(EnvoyMessage.Check(text, On).Text!));

    [Fact]
    public void The_limits_hold_in_characters_and_an_empty_message_is_no_message()
    {
        Assert.Null(EnvoyMessage.Check(null, On).Text);
        Assert.Null(EnvoyMessage.Check("   ", On).Text);
        Assert.True(EnvoyMessage.Check(new string('ş', 140), Off).Ok);
        Assert.False(EnvoyMessage.Check(new string('ş', 141), Off).Ok);
        Assert.False(EnvoyMessage.Check("a\u0007b", Off).Ok); // bell
        Assert.False(EnvoyMessage.Check("a\u2028b", Off).Ok); // line separator
        Assert.False(EnvoyMessage.Check("a\uE000b", Off).Ok); // private use
    }

}
