using Keepfall.Core;
using Keepfall.Core.Economy;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Views;

// The "how to play" page reads its numbers from here, so it stays right when config/balance.json changes. Everything in it is a public
// rule (the same for every player in every match): nothing of any match, castle or player.

public sealed record GuideRange(int Min, int Max);
public sealed record GuideCount(string Name, int Count);
public sealed record GuideLevelView(int Level, int Capacity, double Multiplier, double UpgradeWood, double UpgradeIron, double UpgradeSeconds);

/// <param name="Price">Gold to hire one (null: cannot be hired).</param>
/// <param name="Strong">Units it hits harder than usual.</param>
/// <param name="Weak">Units it hits less hard.</param>
public sealed record GuideUnitView(
    string Id, string Name, double Hp, double Damage, double Dps, bool Ranged, double Iron, double Wood, double BuildSeconds,
    double? Price, IReadOnlyList<string> Strong, IReadOnlyList<string> Weak);

public sealed record GuideChestView(GuideRange Gold, GuideRange Iron);
public sealed record GuideVillageView(GuideRange Gold, GuideRange Food, GuideRange People, int MinSoldiers);
public sealed record GuideCampView(IReadOnlyList<GuideCount> Bandits, GuideRange Gold, GuideRange Wood, IReadOnlyList<GuideCount> Weapons);

public sealed record GuideView(
    double ShortPrepSeconds, double ShortWarSeconds, double LongPrepSeconds, double LongWarSeconds, int StartingPopulation,
    double WorkerFoodPerMinute, double SoldierFoodPerMinute, double FoodPerMinute, double WoodPerMinute, double IronPerMinute,
    double NewPersonBaseCost, double NewPersonCostGrowth, double FamineStart, double FamineFoodMultiplier,
    IReadOnlyList<GuideLevelView> Levels, IReadOnlyList<GuideUnitView> Units,
    double CastleHp, double SiegeSeconds, double ArcherSiegeMultiplier,
    int MaxScouts, double ScoutErrorPercent, double ArmySpeed, double ScoutSpeed,
    int ChestsPerCorner, int VillagesPerCorner, int CampsPerCorner,
    GuideChestView Chest, GuideVillageView Village, GuideCampView Camp, GuideCampView BigCamp,
    double FallLootShare, double FallWorkerShare,
    IReadOnlyList<GuideWallLevelView>? Walls = null, double ArcherDefenseBonusPercent = 0);

public sealed record GuideWallLevelView(int Level, double Hp, double UpgradeWood, double UpgradeIron, double UpgradeSeconds);

public static class GuideMapper
{
    public static GuideView Of(GameRules rules)
    {
        var e = rules.Economy;
        var f = rules.Forest;
        var units = rules.Units.Select(u => new GuideUnitView(
            u.Id, u.Name, u.Hp, u.Damage, Math.Round(u.Dps, 2), u.Range == AttackRange.Ranged, u.Cost.Iron, u.Cost.Wood, u.BuildSeconds,
            rules.MercenaryPrices.TryGetValue(u.Id, out var price) ? price : null,
            rules.Units.Where(d => rules.Counters.Get(u, d) > 1.0001).Select(d => d.Name).ToList(),
            rules.Units.Where(d => rules.Counters.Get(u, d) < 0.9999).Select(d => d.Name).ToList())).ToList();
        string NameOf(string id) => rules.FindUnit(id)?.Name ?? id;
        List<GuideCount> Counts(IReadOnlyDictionary<string, int> d) => d.Where(kv => kv.Value > 0).Select(kv => new GuideCount(NameOf(kv.Key), kv.Value)).ToList();
        GuideCampView Camp(CampRules c) => new(Counts(c.Bandits), new(c.GoldMin, c.GoldMax), new(c.WoodMin, c.WoodMax), Counts(c.Weapons));
        return new GuideView(
            rules.Match.ShortModePrepSeconds, rules.Match.ShortModeWarSeconds, rules.Match.LongModePrepSeconds, rules.Match.LongModeWarSeconds,
            rules.Match.StartingPopulation,
            e.WorkerFoodPerMinute, e.SoldierFoodPerMinute, rules.Production.FoodPerMinute, rules.Production.WoodPerMinute, rules.Production.IronPerMinute,
            e.NewPersonBaseCost, e.NewPersonCostGrowth, rules.War.FamineStart, rules.War.FamineFoodMultiplier,
            e.BuildingLevels.Select(l => new GuideLevelView(l.Level, l.Capacity, l.Multiplier, l.UpgradeWood, l.UpgradeIron, l.UpgradeSeconds)).ToList(), units,
            rules.War.CastleHp, rules.War.SiegeSeconds, rules.War.ArcherSiegeMultiplier,
            rules.Scouting.MaxScouts, Math.Round(rules.Scouting.ReportError * 100), rules.Map.ArmySpeed, rules.Map.ScoutSpeed,
            f.ChestsPerCorner, f.VillagesPerCorner, f.CampsPerCorner,
            new GuideChestView(new(f.Chest.GoldMin, f.Chest.GoldMax), new(f.Chest.IronMin, f.Chest.IronMax)),
            new GuideVillageView(new(f.Village.GoldMin, f.Village.GoldMax), new(f.Village.FoodMin, f.Village.FoodMax),
                new(f.Village.PeopleMin, f.Village.PeopleMax), f.Village.MinSoldiers),
            Camp(f.Camp), Camp(f.BigCamp), rules.War.FallLootShare, rules.War.FallWorkerShare,
            Enumerable.Range(1, rules.Walls.MaxLevel).Select(l => l == 1
                ? new GuideWallLevelView(1, rules.Walls.HpOf(1), 0, 0, 0)
                : new GuideWallLevelView(l, rules.Walls.HpOf(l), rules.Walls.UpgradeTo(l).UpgradeWood, rules.Walls.UpgradeTo(l).UpgradeIron, rules.Walls.UpgradeTo(l).UpgradeSeconds)).ToList(),
            Math.Round(rules.Walls.ArcherDefenseBonus * 100));
    }
}
