namespace Keepfall.Core.World;

/// <summary>
/// The forest in the middle of the map ("forest" in the balance config): how many places of each kind every
/// corner gets, where they may be, how far a scout must come to find one, and what each is worth.
/// </summary>
/// <param name="MinSpacing">Places are at least this far apart (tiles).</param>
/// <param name="HubClearing">…and this far from the middle of the forest (where the big camp stands).</param>
/// <param name="FootMin">A trail leaves the forest road this far (tiles from the junction) at the earliest…</param>
/// <param name="FootMax">…and at the latest.</param>
/// <param name="SpurMin">A trail is at least this long…</param>
/// <param name="SpurMax">…and at most this long.</param>
/// <param name="EdgeMargin">Places stay this far inside the ring road.</param>
/// <param name="DiscoverRadius">A scout finds a place of the quarter it explores when it comes this close.</param>
public sealed record ForestRules(
    int ChestsPerCorner, int VillagesPerCorner, int CampsPerCorner,
    double MinSpacing, double HubClearing, double FootMin, double FootMax, double SpurMin, double SpurMax, double EdgeMargin,
    double DiscoverRadius,
    ChestRules Chest, VillageRules Village, CampRules Camp, CampRules BigCamp)
{
    /// <summary>No forest content at all (a rules set that never mentions it).</summary>
    public static ForestRules None { get; } = new(0, 0, 0, 3.5, 2.5, 2, 11.5, 1.5, 4.5, 1.5, 5,
        new ChestRules(0, 0), new VillageRules(0, 0, 0, 0, 3), new CampRules(new Dictionary<string, int>(), 0, 0, new Dictionary<string, int>()),
        new CampRules(new Dictionary<string, int>(), 0, 0, new Dictionary<string, int>()));
}

public sealed record ChestRules(int GoldMin, int GoldMax, int IronMin = 0, int IronMax = 0);

/// <param name="MinSoldiers">An army needs at least this many soldiers to plunder a village.</param>
public sealed record VillageRules(int GoldMin, int GoldMax, int PeopleMin, int PeopleMax, int MinSoldiers,
    int FoodMin = 0, int FoodMax = 0);

/// <param name="Bandits">Bandits by unit id (they fight with that unit's stats).</param>
/// <param name="Weapons">Ready weapons by unit id the winner takes home.</param>
public sealed record CampRules(IReadOnlyDictionary<string, int> Bandits, int GoldMin, int GoldMax, IReadOnlyDictionary<string, int> Weapons,
    int WoodMin = 0, int WoodMax = 0);
