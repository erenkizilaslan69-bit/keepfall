using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Keepfall.GameCore.Units;

namespace Keepfall.GameCore.Config;

// Raw JSON shape of config/balance.json. Use BalanceConfigLoader to turn it into GameRules.

public sealed class BalanceConfig
{
    public EconomyConfig Economy { get; set; } = new();
    public CombatConfig Combat { get; set; } = new();
    public List<UnitConfig> Units { get; set; } = [];
    public Dictionary<string, Dictionary<string, JsonElement>> Counters { get; set; } = [];
}

public sealed class EconomyConfig
{
    public ProductionConfig ProductionPerMinute { get; set; } = new();
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
            new ProductionRates(p.Food, p.Wood, p.Iron));
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
