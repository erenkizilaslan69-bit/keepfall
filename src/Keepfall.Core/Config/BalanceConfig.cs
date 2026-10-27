using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Config;

// Raw JSON shape of config/balance.json. Use BalanceConfigLoader to turn it into GameRules.

public sealed class BalanceConfig
{
    public MatchConfig Match { get; set; } = new();
    public EconomyConfig Economy { get; set; } = new();
    public List<BuildingLevelConfig> BuildingLevels { get; set; } = [];
    public ScoutingConfig Scouting { get; set; } = new();
    public WarConfig War { get; set; } = new();
    public MapConfig Map { get; set; } = new();
    public CombatConfig Combat { get; set; } = new();
    public ForestConfig Forest { get; set; } = new();
    public BotsConfig Bots { get; set; } = new();
    public EnvoyConfig Envoy { get; set; } = new();
    public WallsConfig Walls { get; set; } = new();
    public DeckConfig Deck { get; set; } = new();
    /// <summary>Gold price of hiring one soldier of each unit type (by unit id).</summary>
    public Dictionary<string, double> Mercenary { get; set; } = [];
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
    /// <summary>How far behind (game seconds) a fallen player's view of the whole map runs; 0 = live.</summary>
    public double SpectatorDelaySeconds { get; set; }
    /// <summary>After a castle falls its owner sees a countdown this long (game seconds) before the spectator view starts.</summary>
    public double SpectatorWaitSeconds { get; set; } = 5;
    /// <summary>When the last human falls with bots still playing, the match runs at least this much longer (game seconds), so the host can choose to keep watching or end it.</summary>
    public double SpectatorMinSeconds { get; set; } = 120;
    /// <summary>Seconds it takes to turn a worker into a soldier (0 = at once).</summary>
    public double ArmSeconds { get; set; }
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

public sealed class BotsConfig
{
    public BotLevelConfig Easy { get; set; } = new();
    public BotLevelConfig Medium { get; set; } = new();
    /// <summary>Not in the file: the hard level plays like Medium.</summary>
    public BotLevelConfig? Hard { get; set; }
    public Dictionary<string, double> Mix { get; set; } = [];
    public double WeaponsFrom { get; set; } = 0.3;
    public double ArmFrom { get; set; } = 0.75;
    public double ArmyShare { get; set; } = 0.5;
    public double AttackMargin { get; set; } = 1.2;
    public double AttackRate { get; set; } = 0.85;
    public double OtherQuartersFrom { get; set; } = 0.5;
    public double StaleReportSeconds { get; set; } = 120;
    public double BlindMargin { get; set; }
    public double BlindRivalShare { get; set; } = 0.8;
    public double BlindAfterWarSeconds { get; set; }
    public double GiftThreshold { get; set; } = 30;
    public double GiftPeaceSeconds { get; set; } = 90;
    /// <summary>Decks (unit ids) Medium and Hard bots pick from; empty: the four first units.</summary>
    public List<List<string>> Decks { get; set; } = [];
}

public sealed class BotLevelConfig
{
    public double ThinkMin { get; set; } = 3;
    public double ThinkMax { get; set; } = 5;
    public double ReactMin { get; set; } = 5;
    public double ReactMax { get; set; } = 10;
    public int Commands { get; set; } = 3;
    public double Mistake { get; set; }
    public int Slack { get; set; } = 1;
    /// <summary>Mistake chance of the economy parts; below zero (not given): the same as <see cref="Mistake"/>.</summary>
    public double EcoMistake { get; set; } = -1;
    // Not given: what that difficulty does by default (the good bot does everything, the poor one the plain version).
    public bool? ExploreAll { get; set; }
    public bool? ChestsAnywhere { get; set; }
    public int? Scouts { get; set; }
    public int? MercBatch { get; set; }
    public int? MercThreatBatch { get; set; }
    public bool? Saves { get; set; }
    public int? QueueDepth { get; set; }
    public double? KeepHome { get; set; }
    public double? HeadCountRatio { get; set; }
    public bool? Calculates { get; set; }
    public bool? SmartDefense { get; set; }
    public bool? ScoreAware { get; set; }
    public bool? HoldWeapons { get; set; }
    public bool? CounterUnits { get; set; }
    public bool? Opportunist { get; set; }
    public double? ScoutFactor { get; set; }
    public bool? UpgradeEarly { get; set; }
    public bool? Foresight { get; set; }
    public double? GarrisonShare { get; set; }
    public double? RaidEvery { get; set; }
    public int? RaidMax { get; set; }
}

public sealed class ForestConfig
{
    public int ChestsPerCorner { get; set; }
    public int VillagesPerCorner { get; set; }
    public int CampsPerCorner { get; set; }
    public double MinSpacing { get; set; } = 3.5;
    public double HubClearing { get; set; } = 2.5;
    public double FootMin { get; set; } = 2;
    public double FootMax { get; set; } = 11.5;
    public double SpurMin { get; set; } = 1.5;
    public double SpurMax { get; set; } = 4.5;
    public double EdgeMargin { get; set; } = 1.5;
    public double DiscoverRadius { get; set; } = 5;
    public ChestConfig Chest { get; set; } = new();
    public VillageConfig Village { get; set; } = new();
    public CampConfig Camp { get; set; } = new();
    public CampConfig BigCamp { get; set; } = new();
}

public sealed class ChestConfig
{
    public int GoldMin { get; set; }
    public int GoldMax { get; set; }
    public int IronMin { get; set; }
    public int IronMax { get; set; }
}

public sealed class VillageConfig
{
    public int GoldMin { get; set; }
    public int GoldMax { get; set; }
    public int PeopleMin { get; set; }
    public int PeopleMax { get; set; }
    public int MinSoldiers { get; set; } = 3;
    public int FoodMin { get; set; }
    public int FoodMax { get; set; }
}

public sealed class CampConfig
{
    public Dictionary<string, int> Bandits { get; set; } = [];
    public int GoldMin { get; set; }
    public int GoldMax { get; set; }
    public Dictionary<string, int> Weapons { get; set; } = [];
    public int WoodMin { get; set; }
    public int WoodMax { get; set; }
}

public sealed class MapConfig
{
    public double ArmySpeed { get; set; } = 1.5;
    public double ScoutSpeed { get; set; } = 2.5;
    /// <summary>The ground a scout walked over stays in view this long (s) after it passed; 0 = until the match ends.</summary>
    public double ScoutTrailSeconds { get; set; } = 120;
    public VisionConfig Vision { get; set; } = new();
}

public sealed class VisionConfig
{
    public double Castle { get; set; } = 20;
    public double Army { get; set; } = 6;
    public double Scout { get; set; } = 10;
}

public sealed class WarConfig
{
    public double FamineStart { get; set; } = 0.7;
    /// <summary>The famine starts this many seconds after the war does (overrides famineStart; negative = use the fraction).</summary>
    public double FamineStartSeconds { get; set; } = -1;
    public double FamineFoodMultiplier { get; set; } = 0.5;
    public double BattlePlayback { get; set; } = 1;
    public double EncounterRadius { get; set; } = 1;
    /// <summary>The share of a fallen castle's stores and gold its conqueror takes (0 = nothing).</summary>
    public double FallLootShare { get; set; }
    /// <summary>The share of a fallen castle's surviving workers who join its conqueror.</summary>
    public double FallWorkerShare { get; set; }
    /// <summary>The share of the defenders' army that fought at the gate who join the conqueror as soldiers when a castle falls (0 = none).</summary>
    public double PrisonerShare { get; set; }
    /// <summary>A raid that wins at a castle burns its fields: food production runs at raidBurnFactor for raidBurnSeconds.</summary>
    public double RaidBurnSeconds { get; set; } = 60;
    public double RaidBurnFactor { get; set; } = 0.5;
}

public sealed class DeckConfig
{
    public bool Enabled { get; set; }
    public int Size { get; set; } = 4;
}

public sealed class WallsConfig
{
    public double ArcherDefenseBonus { get; set; }
}

public sealed class EnvoyConfig
{
    public int MaxCargo { get; set; } = 40;
    public int MaxMessageLength { get; set; } = 140;
    public bool ProfanityFilter { get; set; }
}

public sealed class ScoutingConfig
{
    public double ReportError { get; set; } = 0.2;
    public int MaxScouts { get; set; } = 1;
    public double NoScoutLastPrepSeconds { get; set; }
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
    /// <summary>A healer: hit points it restores per heal (0 = none) and the seconds between heals.</summary>
    public double Heal { get; set; }
    public double HealInterval { get; set; }
    /// <summary>Area damage: this many extra targets of the same row are hit for splashFactor of the damage.</summary>
    public int SplashTargets { get; set; }
    public double SplashFactor { get; set; }
    /// <summary>Always goes for the enemy back row (the front row only when no back row is left).</summary>
    public bool BackFirst { get; set; }
    /// <summary>Goes over the front line for the enemy shooters and healers while any are alive.</summary>
    public bool Flank { get; set; }
    /// <summary>Walks this many times as fast as an army on the map (the slowest unit sets an army speed).</summary>
    public double SpeedFactor { get; set; } = 1;
    /// <summary>An army of nothing but raiders cannot bring a castle down: it burns the rival's fields instead.</summary>
    public bool Raider { get; set; }
    /// <summary>The most hit points one healer can restore in a single battle (0 = no limit): no army lives for ever behind its healers.</summary>
    public double HealBudget { get; set; }
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
        if (mc.SpectatorDelaySeconds < 0) errors.Add("match.spectatorDelaySeconds negatif olamaz.");
        if (mc.SpectatorWaitSeconds < 0) errors.Add("match.spectatorWaitSeconds negatif olamaz.");
        if (mc.SpectatorMinSeconds < 0) errors.Add("match.spectatorMinSeconds negatif olamaz.");
        if (mc.ArmSeconds < 0) errors.Add("match.armSeconds negatif olamaz.");
        if (mc.StartingPopulation < 0) errors.Add("match.startingPopulation negatif olamaz.");
        var sr = mc.StartingResources;
        if (sr.Food < 0 || sr.Wood < 0 || sr.Iron < 0) errors.Add("match.startingResources negatif olamaz.");

        foreach (var (name, level) in new[] { ("easy", config.Bots.Easy), ("medium", config.Bots.Medium), ("hard", config.Bots.Hard ?? config.Bots.Medium) })
        {
            if (level.ThinkMin <= 0 || level.ThinkMax < level.ThinkMin) errors.Add($"bots.{name}: thinkMin/thinkMax geçersiz.");
            if (level.ReactMin < 0 || level.ReactMax < level.ReactMin) errors.Add($"bots.{name}: reactMin/reactMax geçersiz.");
            if (level.Commands < 1) errors.Add($"bots.{name}: commands en az 1 olmalı.");
            if (level.Mistake < 0 || level.Mistake > 1) errors.Add($"bots.{name}: mistake 0 ile 1 arasında olmalı.");
            if (level.EcoMistake > 1) errors.Add($"bots.{name}: ecoMistake 1'den büyük olamaz.");
            if (level.Slack < 0) errors.Add($"bots.{name}: slack negatif olamaz.");
            if (level.KeepHome is < 0 or > 0.9 || level.HeadCountRatio is <= 0) errors.Add($"bots.{name}: keepHome 0–0,9 arasında, headCountRatio sıfırdan büyük olmalı.");
            if (level.Scouts < 1 || level.MercBatch < 1 || level.MercThreatBatch < 1 || level.QueueDepth < 1) errors.Add($"bots.{name}: scouts, mercBatch, mercThreatBatch ve queueDepth en az 1 olmalı.");
        }
        foreach (var id in config.Bots.Mix.Keys)
            if (!config.Units.Any(u => u.Id == id)) errors.Add($"bots.mix: bilinmeyen birim \"{id}\".");
        if (config.Bots.Mix.Count == 0 || config.Bots.Mix.Values.Any(v => v < 0) || config.Bots.Mix.Values.Sum() <= 0) errors.Add("bots.mix: en az bir pozitif pay olmalı.");
        if (config.Bots.WeaponsFrom is < 0 or > 1 || config.Bots.ArmFrom is < 0 or > 1) errors.Add("bots.weaponsFrom/armFrom 0 ile 1 arasında olmalı.");
        if (config.Bots.ArmyShare is <= 0 or > 1) errors.Add("bots.armyShare 0 ile 1 arasında olmalı.");
        if (config.Bots.GiftThreshold < 0 || config.Bots.GiftPeaceSeconds < 0) errors.Add("bots.giftThreshold ve giftPeaceSeconds negatif olamaz.");
        if (config.Bots.OtherQuartersFrom is < 0 or > 1) errors.Add("bots.otherQuartersFrom 0 ile 1 arasında olmalı.");
        if (config.Bots.AttackMargin < 0.5 || config.Bots.AttackMargin > 3) errors.Add("bots.attackMargin 0,5 ile 3 arasında olmalı.");
        if (config.Bots.AttackRate is <= 0 or > 1) errors.Add("bots.attackRate 0 ile 1 arasında olmalı.");

        var fo = config.Forest;
        if (fo.ChestsPerCorner < 0 || fo.VillagesPerCorner < 0 || fo.CampsPerCorner < 0) errors.Add("forest: nokta sayıları negatif olamaz.");
        if (fo.FootMin < 0 || fo.FootMax <= fo.FootMin || fo.FootMax > 14) errors.Add("forest.footMin/footMax: 0 ≤ min < max ≤ 14 olmalı.");
        if (fo.SpurMin <= 0 || fo.SpurMax < fo.SpurMin) errors.Add("forest.spurMin/spurMax geçersiz.");
        if (fo.DiscoverRadius < fo.SpurMax) errors.Add("forest.discoverRadius, spurMax'tan küçük olamaz (keşif yolu noktaları kaçırır).");
        if (fo.Chest.GoldMin < 0 || fo.Chest.GoldMax < fo.Chest.GoldMin || fo.Chest.IronMin < 0 || fo.Chest.IronMax < fo.Chest.IronMin) errors.Add("forest.chest: altın/demir aralığı geçersiz.");
        if (fo.Village.GoldMax < fo.Village.GoldMin || fo.Village.PeopleMax < fo.Village.PeopleMin || fo.Village.MinSoldiers < 1 || fo.Village.FoodMin < 0 || fo.Village.FoodMax < fo.Village.FoodMin) errors.Add("forest.village: aralıklar geçersiz.");
        foreach (var (name, camp) in new[] { ("camp", fo.Camp), ("bigCamp", fo.BigCamp) })
        {
            if (camp.GoldMax < camp.GoldMin || camp.WoodMin < 0 || camp.WoodMax < camp.WoodMin) errors.Add($"forest.{name}: altın/odun aralığı geçersiz.");
            foreach (var id in camp.Bandits.Keys.Concat(camp.Weapons.Keys))
                if (!config.Units.Any(u => u.Id == id)) errors.Add($"forest.{name}: bilinmeyen birim \"{id}\".");
        }
        if (fo.CampsPerCorner > 0 && fo.Camp.Bandits.Values.Sum() == 0) errors.Add("forest.camp: en az bir haydut olmalı.");
        if (fo.BigCamp.Bandits.Values.Sum() == 0 && fo.BigCamp.GoldMax > 0) errors.Add("forest.bigCamp: en az bir haydut olmalı.");

        foreach (var (id, price) in config.Mercenary)
        {
            if (!config.Units.Any(u => u.Id == id)) errors.Add($"mercenary.{id}: bilinmeyen birim.");
            else if (price <= 0) errors.Add($"mercenary.{id}: fiyat sıfırdan büyük olmalı.");
        }

        var e = config.Economy;
        if (e.WorkerFoodPerMinute < 0 || e.SoldierFoodPerMinute < 0) errors.Add("economy: yemek tüketimi negatif olamaz.");
        if (e.StarvationMultiplier < 0 || e.StarvationMultiplier > 1) errors.Add("economy.starvationMultiplier 0 ile 1 arasında olmalı.");
        if (e.NewPersonBaseCost <= 0) errors.Add("economy.newPersonBaseCost sıfırdan büyük olmalı.");
        if (e.NewPersonCostGrowth < 0) errors.Add("economy.newPersonCostGrowth negatif olamaz.");
        if (e.GrowthReserveSeconds < 0) errors.Add("economy.growthReserveSeconds negatif olamaz.");

        var w = config.War;
        if (w.FamineStart < 0 || w.FamineStart > 1) errors.Add("war.famineStart 0 ile 1 arasında olmalı.");
        if (w.FamineFoodMultiplier < 0 || w.FamineFoodMultiplier > 1) errors.Add("war.famineFoodMultiplier 0 ile 1 arasında olmalı.");
        if (w.PrisonerShare < 0 || w.PrisonerShare > 1) errors.Add("war.prisonerShare 0 ile 1 arasında olmalı.");
        if (w.BattlePlayback <= 0) errors.Add("war.battlePlayback sıfırdan büyük olmalı.");
        if (w.EncounterRadius <= 0) errors.Add("war.encounterRadius sıfırdan büyük olmalı.");

        var sc = config.Scouting;
        var mp = config.Map;
        if (mp.ArmySpeed <= 0 || mp.ScoutSpeed <= 0) errors.Add("map: hızlar sıfırdan büyük olmalı.");
        if (mp.ScoutTrailSeconds < 0) errors.Add("map.scoutTrailSeconds negatif olamaz.");
        if (mp.Vision.Castle < 0 || mp.Vision.Army < 0 || mp.Vision.Scout < 0) errors.Add("map.vision: görüş yarıçapları negatif olamaz.");
        if (sc.ReportError < 0 || sc.ReportError >= 1) errors.Add("scouting.reportError 0 ile 1 arasında olmalı.");
        if (sc.MaxScouts < 1) errors.Add("scouting.maxScouts en az 1 olmalı.");
        if (config.Walls.ArcherDefenseBonus < 0) errors.Add("walls.archerDefenseBonus negatif olamaz.");
        if (config.Envoy.MaxCargo < 0) errors.Add("envoy.maxCargo negatif olamaz.");
        if (config.Envoy.MaxMessageLength is < 0 or > 500) errors.Add("envoy.maxMessageLength 0 ile 500 arasında olmalı.");
        if (sc.NoScoutLastPrepSeconds < 0) errors.Add("scouting.noScoutLastPrepSeconds negatif olamaz.");

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
            if (u.Heal < 0 || (u.Heal > 0 && u.HealInterval <= 0)) errors.Add($"{where}: heal negatif olamaz ve healInterval sıfırdan büyük olmalı.");
            if (u.SplashTargets < 0 || u.SplashFactor < 0 || u.SpeedFactor <= 0) errors.Add($"{where}: splashTargets, splashFactor negatif, speedFactor sıfır olamaz.");

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
                u.BuildSeconds, u.Hp, u.Damage, u.AttackInterval, range, row,
                u.Heal, u.HealInterval, u.SplashTargets, u.SplashFactor, u.BackFirst, u.Flank, u.SpeedFactor, u.Raider, u.HealBudget));
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
                mc.ServerTickSeconds, mc.StartingPopulation, sr.Food, sr.Wood, sr.Iron, mc.SpectatorDelaySeconds, mc.SpectatorWaitSeconds, mc.SpectatorMinSeconds, mc.ArmSeconds),
            new EconomyRules(
                e.WorkerFoodPerMinute, e.SoldierFoodPerMinute, e.StarvationMultiplier,
                e.NewPersonBaseCost, e.NewPersonCostGrowth, e.NewPersonBasePopulation, e.GrowthReserveSeconds,
                config.BuildingLevels.Select((l, i) => new BuildingLevel(
                    i + 1, l.Capacity, l.Multiplier, l.UpgradeWood, l.UpgradeIron, l.UpgradeSeconds)).ToList()),
            new ScoutingRules(sc.ReportError, sc.MaxScouts, sc.NoScoutLastPrepSeconds),
            new WarRules(w.FamineStart, w.FamineFoodMultiplier,
                w.BattlePlayback, w.EncounterRadius, w.FallLootShare, w.FallWorkerShare, w.FamineStartSeconds, w.PrisonerShare, w.RaidBurnSeconds, w.RaidBurnFactor),
            new MapRules(mp.ArmySpeed, mp.ScoutSpeed, mp.Vision.Castle, mp.Vision.Army, mp.Vision.Scout, mp.ScoutTrailSeconds),
            config.Mercenary,
            new ForestRules(fo.ChestsPerCorner, fo.VillagesPerCorner, fo.CampsPerCorner, fo.MinSpacing, fo.HubClearing, fo.FootMin, fo.FootMax,
                fo.SpurMin, fo.SpurMax, fo.EdgeMargin, fo.DiscoverRadius,
                new ChestRules(fo.Chest.GoldMin, fo.Chest.GoldMax, fo.Chest.IronMin, fo.Chest.IronMax),
                new VillageRules(fo.Village.GoldMin, fo.Village.GoldMax, fo.Village.PeopleMin, fo.Village.PeopleMax, fo.Village.MinSoldiers,
                    fo.Village.FoodMin, fo.Village.FoodMax),
                new CampRules(fo.Camp.Bandits, fo.Camp.GoldMin, fo.Camp.GoldMax, fo.Camp.Weapons, fo.Camp.WoodMin, fo.Camp.WoodMax),
                new CampRules(fo.BigCamp.Bandits, fo.BigCamp.GoldMin, fo.BigCamp.GoldMax, fo.BigCamp.Weapons, fo.BigCamp.WoodMin, fo.BigCamp.WoodMax)),
            new BotRules(BotLevel(config.Bots.Easy, false), BotLevel(config.Bots.Medium, true), config.Bots.Mix, config.Bots.WeaponsFrom, config.Bots.ArmFrom, config.Bots.ArmyShare,
                config.Bots.AttackMargin, config.Bots.AttackRate, config.Bots.OtherQuartersFrom,
                config.Bots.StaleReportSeconds, config.Bots.BlindMargin, config.Bots.BlindRivalShare, config.Bots.BlindAfterWarSeconds,
                config.Bots.Hard is null ? null : BotLevel(config.Bots.Hard, true), config.Bots.GiftThreshold, config.Bots.GiftPeaceSeconds, config.Bots.Decks.Select(d => (IReadOnlyList<string>)d).ToList()),
            new EnvoyRules(config.Envoy.MaxCargo, config.Envoy.MaxMessageLength, config.Envoy.ProfanityFilter),
            new WallRules(config.Walls.ArcherDefenseBonus),
            new DeckRules(config.Deck.Enabled, config.Deck.Size));
    }

    private static BotLevelRules BotLevel(BotLevelConfig c, bool good) => new(c.ThinkMin, c.ThinkMax, c.ReactMin, c.ReactMax, c.Commands, c.Mistake, c.Slack, c.EcoMistake < 0 ? c.Mistake : c.EcoMistake,
        c.ExploreAll ?? good, c.ChestsAnywhere ?? good, c.Scouts ?? (good ? 2 : 1), c.MercBatch ?? (good ? 3 : 1), c.MercThreatBatch ?? (good ? 6 : 1),
        c.Saves ?? good, c.QueueDepth ?? (good ? 3 : 2), c.KeepHome ?? (good ? 0.25 : 0.1), c.HeadCountRatio ?? 1.0, c.Calculates ?? good, c.SmartDefense ?? good, c.ScoreAware ?? false,
        c.HoldWeapons ?? false, c.CounterUnits ?? false, c.Opportunist ?? false, c.ScoutFactor ?? 1.0, c.UpgradeEarly ?? false, c.Foresight ?? false, c.GarrisonShare ?? 0, c.RaidEvery ?? 0, c.RaidMax ?? 4);

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
