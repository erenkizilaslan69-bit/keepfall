using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Keepfall.Core.Economy;
using Keepfall.Core.Units;

namespace Keepfall.Core.Config;

// Raw JSON shape of config/balance.json. Use BalanceConfigLoader to turn it into GameRules.

public sealed class BalanceConfig
{
    public MatchConfig Match { get; set; } = new();
    public EconomyConfig Economy { get; set; } = new();
    public List<BuildingLevelConfig> BuildingLevels { get; set; } = [];
    public ScoutingConfig Scouting { get; set; } = new();
    public WarConfig War { get; set; } = new();
    public CombatConfig Combat { get; set; } = new();
    public List<UnitConfig> Units { get; set; } = [];
    public Dictionary<string, Dictionary<string, JsonElement>> Counters { get; set; } = [];
}

public sealed class MatchConfig
{
    public double ShortModeMinutes { get; set; } = 15;
    public double ShortModePrepMinutes { get; set; } = 7;
    public double LongModeMinutes { get; set; } = 30;
    public double LongModePrepMinutes { get; set; } = 12;
    public double ServerTickSeconds { get; set; } = 1;
    public int StartingPopulation { get; set; } = 10;
    public ProductionConfig StartingResources { get; set; } = new();
}

public sealed class EconomyConfig
{
    public ProductionConfig ProductionPerMinute { get; set; } = new();
    public double WorkerFoodPerMinute { get; set; }
    public double SoldierFoodPerMinute { get; set; }
    public double StarvationMultiplier { get; set; } = 0.5;
    public double NewPersonBaseCost { get; set; }
    public double NewPersonCostGrowth { get; set; }
    public int NewPersonBasePopulation { get; set; } = 10;
    public double GrowthReserveSeconds { get; set; }
}

public sealed class WarConfig
{
    public double MarchSeconds { get; set; } = 30;
    public double WarningSeconds { get; set; } = 10;
    public double FamineStart { get; set; } = 0.7;
    public double FamineFoodMultiplier { get; set; } = 0.5;
    public double CastleHp { get; set; } = 500;
    public double SiegeSeconds { get; set; } = 5;
    public double ArcherSiegeMultiplier { get; set; } = 0.5;
}

public sealed class ScoutingConfig
{
    public double MissionSeconds { get; set; } = 45;
    public double ArrivalFraction { get; set; } = 0.5;
    public double ReportError { get; set; } = 0.2;
}

public sealed class BuildingLevelConfig
{
    public int Capacity { get; set; }
    public double Multiplier { get; set; } = 1;
    public double UpgradeWood { get; set; }
    public double UpgradeIron { get; set; }
    public double UpgradeSeconds { get; set; }
}

public sealed class ProductionConfig
{
    public double Food { get; set; }
    public double Wood { get; set; }
    public double Iron { get; set; }
}

public sealed class CombatConfig
{
    public double TickSeconds { get; set; } = 0.1;
    public double MaxBattleSeconds { get; set; } = 600;
    public bool RandomizeFirstAttack { get; set; } = true;
    public double ApproachTime { get; set; }
    public double AdvantageMultiplier { get; set; } = 1.5;
    public double DisadvantageMultiplier { get; set; } = 0.75;
    public double NeutralMultiplier { get; set; } = 1.0;
}

public sealed class UnitConfig
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public int Phase { get; set; } = 1;
    public CostConfig Cost { get; set; } = new();
    public double BuildSeconds { get; set; }
    public double Hp { get; set; }
    public double Damage { get; set; }
    public double AttackInterval { get; set; }
    public string Range { get; set; } = "melee";
    public string Row { get; set; } = "front";
}

public sealed class CostConfig
{
    public double Iron { get; set; }
    public double Wood { get; set; }
    public double Food { get; set; }
    public int People { get; set; } = 1;
}

public sealed class BalanceConfigException(string message) : Exception(message);

public static class BalanceConfigLoader
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    /// <summary>Looks for config/balance.json in <paramref name="startDirectory"/> and its parents.</summary>
    public static string? FindDefaultPath(string startDirectory)
    {
        for (var dir = new DirectoryInfo(startDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "config", "balance.json");
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    public static GameRules LoadFromFile(string path)
    {
        if (!File.Exists(path))
            throw new BalanceConfigException($"Ayar dosyası bulunamadı: {path}");
        return LoadFromJson(File.ReadAllText(path));
    }

    public static GameRules LoadFromJson(string json)
    {
        BalanceConfig? config;
        try
        {
            config = JsonSerializer.Deserialize<BalanceConfig>(json, JsonOptions);
        }
        catch (JsonException ex)
        {
            throw new BalanceConfigException($"Ayar dosyası okunamadı: {ex.Message}");
        }
        if (config is null)
            throw new BalanceConfigException("Ayar dosyası boş.");
        return Build(config);
    }

    public static GameRules Build(BalanceConfig config)
    {
        var errors = new List<string>();

        var p = config.Economy.ProductionPerMinute;
        if (p.Food <= 0 || p.Wood <= 0 || p.Iron <= 0)
            errors.Add("economy.productionPerMinute: food, wood ve iron sıfırdan büyük olmalı.");

        var c = config.Combat;
        if (c.TickSeconds <= 0) errors.Add("combat.tickSeconds sıfırdan büyük olmalı.");
        if (c.MaxBattleSeconds <= 0) errors.Add("combat.maxBattleSeconds sıfırdan büyük olmalı.");
        if (c.ApproachTime < 0) errors.Add("combat.approachTime negatif olamaz.");

        var mc = config.Match;
        if (mc.ShortModeMinutes <= 0 || mc.LongModeMinutes <= 0) errors.Add("match: mod süreleri sıfırdan büyük olmalı.");
        if (mc.ShortModePrepMinutes <= 0 || mc.ShortModePrepMinutes >= mc.ShortModeMinutes)
            errors.Add("match.shortModePrepMinutes 0 ile shortModeMinutes arasında olmalı.");
        if (mc.LongModePrepMinutes <= 0 || mc.LongModePrepMinutes >= mc.LongModeMinutes)
            errors.Add("match.longModePrepMinutes 0 ile longModeMinutes arasında olmalı.");
        if (mc.ServerTickSeconds <= 0) errors.Add("match.serverTickSeconds sıfırdan büyük olmalı.");
        if (mc.StartingPopulation < 0) errors.Add("match.startingPopulation negatif olamaz.");
        var sr = mc.StartingResources;
        if (sr.Food < 0 || sr.Wood < 0 || sr.Iron < 0) errors.Add("match.startingResources negatif olamaz.");

        var e = config.Economy;
        if (e.WorkerFoodPerMinute < 0 || e.SoldierFoodPerMinute < 0) errors.Add("economy: yemek tüketimi negatif olamaz.");
        if (e.StarvationMultiplier < 0 || e.StarvationMultiplier > 1) errors.Add("economy.starvationMultiplier 0 ile 1 arasında olmalı.");
        if (e.NewPersonBaseCost <= 0) errors.Add("economy.newPersonBaseCost sıfırdan büyük olmalı.");
        if (e.NewPersonCostGrowth < 0) errors.Add("economy.newPersonCostGrowth negatif olamaz.");
        if (e.GrowthReserveSeconds < 0) errors.Add("economy.growthReserveSeconds negatif olamaz.");

        var w = config.War;
        if (w.MarchSeconds <= 0) errors.Add("war.marchSeconds sıfırdan büyük olmalı.");
        if (w.WarningSeconds < 0 || w.WarningSeconds > w.MarchSeconds) errors.Add("war.warningSeconds 0 ile marchSeconds arasında olmalı.");
        if (w.FamineStart < 0 || w.FamineStart > 1) errors.Add("war.famineStart 0 ile 1 arasında olmalı.");
        if (w.FamineFoodMultiplier < 0 || w.FamineFoodMultiplier > 1) errors.Add("war.famineFoodMultiplier 0 ile 1 arasında olmalı.");
        if (w.CastleHp <= 0) errors.Add("war.castleHp sıfırdan büyük olmalı.");
        if (w.SiegeSeconds < 0 || w.ArcherSiegeMultiplier < 0) errors.Add("war: kuşatma değerleri negatif olamaz.");

        var sc = config.Scouting;
        if (sc.MissionSeconds <= 0) errors.Add("scouting.missionSeconds sıfırdan büyük olmalı.");
        if (sc.ArrivalFraction <= 0 || sc.ArrivalFraction >= 1) errors.Add("scouting.arrivalFraction 0 ile 1 arasında olmalı.");
        if (sc.ReportError < 0 || sc.ReportError >= 1) errors.Add("scouting.reportError 0 ile 1 arasında olmalı.");

        if (config.BuildingLevels.Count == 0) errors.Add("buildingLevels: en az bir seviye tanımlanmalı.");
        for (int i = 0; i < config.BuildingLevels.Count; i++)
        {
            var l = config.BuildingLevels[i];
            if (l.Capacity < 0 || l.Multiplier < 0 || l.UpgradeWood < 0 || l.UpgradeIron < 0 || l.UpgradeSeconds < 0)
                errors.Add($"buildingLevels[{i}] (seviye {i + 1}): değerler negatif olamaz.");
        }

        var units = new List<UnitType>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var u in config.Units)
        {
            var where = $"units[{(string.IsNullOrWhiteSpace(u.Id) ? units.Count.ToString(CultureInfo.InvariantCulture) : u.Id)}]";
            if (string.IsNullOrWhiteSpace(u.Id)) { errors.Add($"{where}: id boş."); continue; }
            if (!seenIds.Add(u.Id)) { errors.Add($"{where}: id tekrar ediyor."); continue; }
            if (u.Hp <= 0) errors.Add($"{where}.hp sıfırdan büyük olmalı.");
            if (u.Damage < 0) errors.Add($"{where}.damage negatif olamaz.");
            if (u.AttackInterval <= 0) errors.Add($"{where}.attackInterval sıfırdan büyük olmalı.");

            AttackRange range = u.Range.ToLowerInvariant() switch
            {
                "melee" => AttackRange.Melee,
                "ranged" => AttackRange.Ranged,
                _ => Fail<AttackRange>(errors, $"{where}.range \"{u.Range}\" geçersiz (melee | ranged)."),
            };
            Row row = u.Row.ToLowerInvariant() switch
            {
                "front" => Row.Front,
                "back" => Row.Back,
                _ => Fail<Row>(errors, $"{where}.row \"{u.Row}\" geçersiz (front | back)."),
            };

            units.Add(new UnitType(
                units.Count, u.Id, string.IsNullOrWhiteSpace(u.Name) ? u.Id : u.Name, u.Phase,
                new ResourceCost(u.Cost.Iron, u.Cost.Wood, u.Cost.Food, u.Cost.People),
                u.BuildSeconds, u.Hp, u.Damage, u.AttackInterval, range, row));
        }
        if (units.Count == 0) errors.Add("units: en az bir birlik tanımlanmalı.");

        var matrix = new double[units.Count, units.Count];
        for (int i = 0; i < units.Count; i++)
            for (int j = 0; j < units.Count; j++)
                matrix[i, j] = c.NeutralMultiplier;

        UnitType? Find(string id) => units.FirstOrDefault(x => string.Equals(x.Id, id, StringComparison.OrdinalIgnoreCase));

        foreach (var (attackerId, row) in config.Counters)
        {
            var attacker = Find(attackerId);
            if (attacker is null) { errors.Add($"counters: bilinmeyen saldıran \"{attackerId}\"."); continue; }
            foreach (var (defenderId, value) in row)
            {
                var defender = Find(defenderId);
                if (defender is null) { errors.Add($"counters.{attackerId}: bilinmeyen savunan \"{defenderId}\"."); continue; }
                double? m = ParseMultiplier(value, c);
                if (m is null || m < 0)
                    errors.Add($"counters.{attackerId}.{defenderId}: \"{value}\" geçersiz (\"+\", \"-\", \"=\" ya da sayı).");
                else
                    matrix[attacker.Index, defender.Index] = m.Value;
            }
        }

        if (errors.Count > 0)
            throw new BalanceConfigException("Ayar dosyasında hatalar var:\n  - " + string.Join("\n  - ", errors));

        return new GameRules(
            units,
            new CounterMatrix(matrix),
            new CombatSettings(c.TickSeconds, c.MaxBattleSeconds, c.RandomizeFirstAttack, c.ApproachTime),
            new ProductionRates(p.Food, p.Wood, p.Iron),
            new MatchRules(
                mc.ShortModePrepMinutes * 60, mc.LongModePrepMinutes * 60,
                (mc.ShortModeMinutes - mc.ShortModePrepMinutes) * 60,
                (mc.LongModeMinutes - mc.LongModePrepMinutes) * 60,
                mc.ServerTickSeconds, mc.StartingPopulation, sr.Food, sr.Wood, sr.Iron),
            new EconomyRules(
                e.WorkerFoodPerMinute, e.SoldierFoodPerMinute, e.StarvationMultiplier,
                e.NewPersonBaseCost, e.NewPersonCostGrowth, e.NewPersonBasePopulation, e.GrowthReserveSeconds,
                config.BuildingLevels.Select((l, i) => new BuildingLevel(
                    i + 1, l.Capacity, l.Multiplier, l.UpgradeWood, l.UpgradeIron, l.UpgradeSeconds)).ToList()),
            new ScoutingRules(sc.MissionSeconds, sc.ArrivalFraction, sc.ReportError),
            new WarRules(w.MarchSeconds, w.WarningSeconds, w.FamineStart, w.FamineFoodMultiplier,
                w.CastleHp, w.SiegeSeconds, w.ArcherSiegeMultiplier));
    }

    private static double? ParseMultiplier(JsonElement value, CombatConfig c)
    {
        if (value.ValueKind == JsonValueKind.Number) return value.GetDouble();
        if (value.ValueKind != JsonValueKind.String) return null;
        var s = value.GetString()!.Trim();
        return s switch
        {
            "+" => c.AdvantageMultiplier,
            "-" => c.DisadvantageMultiplier,
            "=" => c.NeutralMultiplier,
            _ => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : null,
        };
    }

    private static T Fail<T>(List<string> errors, string message)
    {
        errors.Add(message);
        return default!;
    }
}
