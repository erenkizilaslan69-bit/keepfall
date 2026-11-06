using System.Text.Json;
using System.Text.Json.Serialization;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.Core.Challenges;

/// <summary>Text in the two languages the client ships. Plain data (config/challenges.json), nothing to do with the balance numbers.</summary>
public sealed class ChallengeText
{
    public string Tr { get; init; } = "";
    public string En { get; init; } = "";
}

/// <summary>One computer player of a challenge. The kingdom and deck are secret from the player, like anyone's in a match.</summary>
public sealed class ChallengeBot
{
    /// <summary>"easy", "medium" or "hard".</summary>
    public string Difficulty { get; init; } = "easy";
    public string? Kingdom { get; init; }
    public List<string>? Deck { get; init; }

    public BotDifficulty Level => Difficulty switch { "hard" => BotDifficulty.Hard, "medium" => BotDifficulty.Medium, _ => BotDifficulty.Easy };
}

/// <summary>One thing to achieve. <see cref="Star"/> 1 goals are what it takes to beat the challenge, 2 and 3 are the extra stars.</summary>
public sealed class ChallengeGoal
{
    public string Id { get; init; } = "";
    public string Type { get; init; } = "";
    public double Value { get; init; }
    public int Star { get; init; } = 1;
}

public sealed class ChallengeDef
{
    public string Id { get; init; } = "";
    /// <summary>Position in the list (1…); 0 for the daily challenge. A challenge opens when the one before it has a star.</summary>
    public int Order { get; init; }
    public bool Daily { get; init; }
    public ChallengeText Name { get; init; } = new();
    public ChallengeText Description { get; init; } = new();
    public ChallengeText Tip { get; init; } = new();
    /// <summary>The whole match (map, forest, corners, decks, kingdoms of the computer players, their dice) comes from this.</summary>
    public int Seed { get; init; }
    /// <summary>The player's kingdom (a kingdom id, see <see cref="Factions"/>).</summary>
    public string Kingdom { get; init; } = "";
    public List<string>? PlayerDeck { get; init; }
    /// <summary>Plays by the starter rules (no kingdom abilities, rows fixed) unless the player chose full rules. The first cards use it.</summary>
    public bool Starter { get; init; }
    public List<ChallengeBot> Bots { get; init; } = [];
    /// <summary>Null = the game's usual preparation (with its faster economy); a number plays that many seconds at plain speed.</summary>
    public double? PrepSeconds { get; init; }
    public double? WarSeconds { get; init; }
    public List<ChallengeGoal> Goals { get; init; } = [];
}

public sealed class ChallengeFile
{
    public int Version { get; init; } = 1;
    public List<ChallengeDef> Challenges { get; init; } = [];
}

public sealed class ChallengeConfigException(string message) : Exception(message);

/// <summary>
/// Goals the server can work out from the finished room. Anything not in this list is refused when the file is loaded, so a goal
/// can never be one nobody can measure.
/// </summary>
public static class GoalTypes
{
    public const string Win = "win";
    public const string WinWithin = "winWithin";
    public const string MaxSoldiersLost = "maxSoldiersLost";
    public const string MaxBattlesLost = "maxBattlesLost";
    public const string MinPopulation = "minPopulation";
    public const string MinBattlesWon = "minBattlesWon";
    public const string MinCastlesFelled = "minCastlesFelled";
    public const string MinEnemiesKilled = "minEnemiesKilled";
    public const string MinGold = "minGold";
    public const string MinVillages = "minVillages";
    public const string MinCamps = "minCamps";
    public const string MinChests = "minChests";
    public const string MinScouts = "minScouts";
    public const string MinReports = "minReports";
    public const string MinEnvoys = "minEnvoys";
    public const string MinDecoys = "minDecoys";
    public const string MinFakeReports = "minFakeReports";
    public const string MinBribed = "minBribed";
    public const string MinCampsRented = "minCampsRented";
    public const string MinDisguises = "minDisguises";

    public static readonly IReadOnlyList<string> All =
    [
        Win, WinWithin, MaxSoldiersLost, MaxBattlesLost, MinPopulation, MinBattlesWon, MinCastlesFelled, MinEnemiesKilled, MinGold,
        MinVillages, MinCamps, MinChests, MinScouts, MinReports, MinEnvoys, MinDecoys, MinFakeReports, MinBribed, MinCampsRented, MinDisguises,
    ];

    /// <summary>"The smaller the better" goals (the others want at least the value).</summary>
    public static bool IsLimit(string type) => type is WinWithin or MaxSoldiersLost or MaxBattlesLost;
}

/// <summary>The challenges of config/challenges.json, checked against the game's rules when loaded.</summary>
public sealed class ChallengeCatalog
{
    public const int Version = 1;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    public static ChallengeCatalog Empty { get; } = new([]);

    private ChallengeCatalog(IReadOnlyList<ChallengeDef> all) => All = all;

    /// <summary>The fixed challenges, in order.</summary>
    public IReadOnlyList<ChallengeDef> All { get; }

    public ChallengeDef? Find(string? id) => All.FirstOrDefault(c => c.Id == id);

    /// <summary>Looks for config/challenges.json next to the balance file; an absent file is no challenges.</summary>
    public static ChallengeCatalog LoadBeside(string balancePath, GameRules rules)
    {
        var path = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(balancePath)) ?? ".", "challenges.json");
        return File.Exists(path) ? LoadFromJson(File.ReadAllText(path), rules) : Empty;
    }

    public static ChallengeCatalog LoadFromJson(string json, GameRules rules)
    {
        ChallengeFile? file;
        try { file = JsonSerializer.Deserialize<ChallengeFile>(json, JsonOptions); }
        catch (JsonException ex) { throw new ChallengeConfigException($"Meydan okuma dosyası okunamadı: {ex.Message}"); }
        if (file is null) throw new ChallengeConfigException("Meydan okuma dosyası boş.");
        if (file.Version != Version) throw new ChallengeConfigException($"Meydan okuma dosyasının sürümü {file.Version}, beklenen {Version}.");
        var errors = new List<string>();
        var ids = new HashSet<string>();
        foreach (var c in file.Challenges)
        {
            if (!ids.Add(c.Id)) errors.Add($"\"{c.Id}\" kimliği birden fazla.");
            Validate(c, rules, errors);
        }
        var orders = file.Challenges.Select(c => c.Order).OrderBy(o => o).ToList();
        if (!orders.SequenceEqual(Enumerable.Range(1, orders.Count))) errors.Add("order değerleri 1'den başlayıp sırayla gitmeli.");
        if (errors.Count > 0) throw new ChallengeConfigException("Meydan okuma dosyasında hata var:\n- " + string.Join("\n- ", errors));
        return new ChallengeCatalog(file.Challenges.OrderBy(c => c.Order).ToList());
    }

    /// <summary>The rules a definition has to follow; every problem is added to <paramref name="errors"/>.</summary>
    public static void Validate(ChallengeDef c, GameRules rules, List<string> errors)
    {
        string who = $"\"{c.Id}\"";
        if (string.IsNullOrWhiteSpace(c.Id)) errors.Add("Kimliği olmayan meydan okuma var.");
        if (c.Name.Tr.Length == 0 || c.Name.En.Length == 0) errors.Add($"{who}: ad iki dilde de yazılmalı.");
        if (c.Description.Tr.Length == 0 || c.Description.En.Length == 0) errors.Add($"{who}: açıklama iki dilde de yazılmalı.");
        if (Factions.Find(c.Kingdom) is null) errors.Add($"{who}: bilinmeyen krallık \"{c.Kingdom}\".");
        if (c.Bots.Count is < 1 or > 3) errors.Add($"{who}: 1–3 bot olmalı.");
        foreach (var b in c.Bots)
        {
            if (b.Difficulty is not ("easy" or "medium" or "hard")) errors.Add($"{who}: bilinmeyen bot zorluğu \"{b.Difficulty}\".");
            if (b.Kingdom is not null && Factions.Find(b.Kingdom) is null) errors.Add($"{who}: botun bilinmeyen krallığı \"{b.Kingdom}\".");
            if (b.Deck is not null && !rules.IsValidDeck(b.Deck)) errors.Add($"{who}: botun destesi geçersiz.");
        }
        if (c.PlayerDeck is not null && !rules.IsValidDeck(c.PlayerDeck)) errors.Add($"{who}: oyuncunun destesi geçersiz.");
        if (c.PrepSeconds is < 60 or > 3600) errors.Add($"{who}: prepSeconds 60–3600 olmalı.");
        if (c.WarSeconds is < 60 or > 3600) errors.Add($"{who}: warSeconds 60–3600 olmalı.");
        var goalIds = new HashSet<string>();
        foreach (var g in c.Goals)
        {
            if (!goalIds.Add(g.Id)) errors.Add($"{who}: \"{g.Id}\" hedef kimliği birden fazla.");
            if (!GoalTypes.All.Contains(g.Type)) errors.Add($"{who}: ölçülemeyen hedef türü \"{g.Type}\".");
            if (g.Star is < 1 or > 3) errors.Add($"{who}: hedef \"{g.Id}\" yıldızı 1–3 olmalı.");
            if (g.Value < 0) errors.Add($"{who}: hedef \"{g.Id}\" değeri negatif olamaz.");
        }
        if (!c.Goals.Any(g => g.Type == GoalTypes.Win && g.Star == 1)) errors.Add($"{who}: 1 yıldızlık bir \"win\" hedefi olmalı.");
        for (int s = 1; s <= 3; s++)
            if (!c.Goals.Any(g => g.Star == s)) errors.Add($"{who}: {s}. yıldız için hedef yok.");
    }

    /// <summary>
    /// The day's challenge: everything comes from the date (UTC), so everybody who plays it on the same day faces the same match.
    /// </summary>
    public static ChallengeDef Daily(DateTime utcNow, GameRules rules)
    {
        var day = utcNow.Date;
        int seed = day.Year * 10000 + day.Month * 100 + day.Day;
        var rng = new Random(seed * 7919 + 13);
        var kingdoms = Factions.All.Select(f => f.Id).OrderBy(_ => rng.Next()).ToList();
        int botCount = 1 + rng.Next(3);
        var bots = Enumerable.Range(0, botCount)
            .Select(i => new ChallengeBot { Difficulty = rng.Next(100) < 70 ? "easy" : "medium", Kingdom = kingdoms[(i + 1) % kingdoms.Count] })
            .ToList();
        var deck = rules.Deck.Enabled ? rules.RandomDeck(rng).ToList() : null;
        double war = 420 + 60 * botCount;
        return new ChallengeDef
        {
            Id = $"daily-{seed}",
            Order = 0,
            Daily = true,
            Name = new ChallengeText { Tr = "Günün Meydan Okuması", En = "Daily Challenge" },
            Description = new ChallengeText
            {
                Tr = "Bugünün maçı herkes için aynı: aynı harita, aynı rakipler. Gün (UTC) değişince yenisi gelir.",
                En = "Today's match is the same for everybody: same map, same rivals. A new one arrives when the day (UTC) changes.",
            },
            Tip = new ChallengeText { Tr = "Krallığının gücünü kullan, rakiplerin krallığını tahmin et.", En = "Use your kingdom's power and guess your rivals' kingdoms." },
            Seed = seed,
            Kingdom = kingdoms[0],
            PlayerDeck = deck,
            Bots = bots,
            WarSeconds = war,
            Goals =
            [
                new ChallengeGoal { Id = "win", Type = GoalTypes.Win, Value = 1, Star = 1 },
                new ChallengeGoal { Id = "thrifty", Type = GoalTypes.MaxSoldiersLost, Value = 15 * botCount + 15, Star = 2 },
                new ChallengeGoal { Id = "swift", Type = GoalTypes.WinWithin, Value = 240 + 60 * botCount, Star = 3 },
            ],
        };
    }
}

public sealed record GoalOutcome(string Id, string Type, double Target, double Actual, bool Passed, int Star);

/// <summary>How the player did: <see cref="Stars"/> is 0 when the challenge was lost.</summary>
public sealed record ChallengeOutcome(string Id, bool Won, int Stars, IReadOnlyList<GoalOutcome> Goals);

/// <summary>Works the goals out from a finished room. Only the player's own figures are used.</summary>
public static class ChallengeEvaluator
{
    public static ChallengeOutcome? Evaluate(Room room, RoomPlayer player)
    {
        if (room.Challenge is not { } def || room.Game is not { Phase: MatchPhase.Ended, Result: { } result } game) return null;
        var key = player.CastleKey;
        var stats = game.CastleOf(key)!.Stats;
        bool won = result.Winners.Contains(key);
        var battles = game.BattlesOf(key);
        bool Lost(BattleReport b) => b.Winner switch
        {
            BattleWinner.Attacker => b.Defender == key,
            BattleWinner.Defender => b.Attacker == key,
            _ => false,
        };
        bool Won(BattleReport b) => b.Winner switch
        {
            BattleWinner.Attacker => b.Attacker == key,
            BattleWinner.Defender => b.Defender == key,
            _ => false,
        };
        double Actual(ChallengeGoal g) => g.Type switch
        {
            GoalTypes.Win => won ? 1 : 0,
            GoalTypes.WinWithin => game.WarElapsedSeconds,
            GoalTypes.MaxSoldiersLost => stats.SoldiersLost,
            GoalTypes.MaxBattlesLost => battles.Count(Lost),
            GoalTypes.MinPopulation => result.Ranking.FirstOrDefault(r => r.Player == key)?.Population ?? 0,
            GoalTypes.MinBattlesWon => battles.Count(Won),
            GoalTypes.MinCastlesFelled => battles.Count(b => b.Attacker == key && b.DefenderEliminated),
            GoalTypes.MinEnemiesKilled => stats.EnemiesKilled,
            GoalTypes.MinGold => stats.GoldGained,
            GoalTypes.MinVillages => stats.VillagesPlundered,
            GoalTypes.MinCamps => stats.CampsCleared,
            GoalTypes.MinChests => stats.ChestsLooted,
            GoalTypes.MinScouts => stats.ScoutsSent,
            GoalTypes.MinReports => stats.ReportsRead,
            GoalTypes.MinEnvoys => stats.EnvoysDelivered,
            GoalTypes.MinDecoys => stats.DecoysSent,
            GoalTypes.MinFakeReports => stats.FakeReportsSet,
            GoalTypes.MinBribed => stats.SoldiersBribed,
            GoalTypes.MinCampsRented => stats.CampsRented,
            GoalTypes.MinDisguises => stats.Disguises,
            _ => 0,
        };
        var goals = def.Goals.Select(g =>
        {
            double actual = Actual(g);
            // The limits only count when the challenge was won: a castle that fell early has lost "few soldiers" for nothing.
            bool passed = g.Type == GoalTypes.Win ? won
                : GoalTypes.IsLimit(g.Type) ? won && actual <= g.Value + 1e-9
                : actual + 1e-9 >= g.Value;
            return new GoalOutcome(g.Id, g.Type, g.Value, Math.Round(actual, 1), passed, g.Star);
        }).ToList();
        int stars = 0;
        for (int s = 1; s <= 3; s++)
        {
            if (goals.Where(g => g.Star <= s).All(g => g.Passed)) stars = s;
            else break;
        }
        return new ChallengeOutcome(def.Id, won, won ? stars : 0, goals);
    }
}
