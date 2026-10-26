using Keepfall.Core.Economy;
using Keepfall.Core.Units;

namespace Keepfall.Core.Match;

/// <summary>Something a player asks their castle to do. The castle validates every command.</summary>
public abstract record GameCommand;

/// <summary>Move people between jobs (Idle included).</summary>
public sealed record MoveWorkers(Job From, Job To, int Count) : GameCommand;

/// <summary>Add weapons to the forge queue. Resources are paid now and refunded on cancel.</summary>
public sealed record QueueWeapon(string UnitId, int Count) : GameCommand;

/// <summary>Cancel an order in the forge queue; unfinished weapons are refunded.</summary>
public sealed record CancelWeapon(int OrderIndex) : GameCommand;

/// <summary>Give weapons from the stockpile to people from <paramref name="From"/>; they become soldiers.</summary>
public sealed record ArmWorkers(string UnitId, int Count, Job From = Job.Idle) : GameCommand;

/// <summary>Soldiers put their weapons back in the stockpile and become idle workers.</summary>
public sealed record DisarmSoldiers(string UnitId, int Count) : GameCommand;

public sealed record UpgradeBuilding(BuildingType Building) : GameCommand;

/// <summary>Raise the wall to its next level (more hit points; takes wood, iron and time).</summary>
public sealed record UpgradeWall : GameCommand;

/// <summary>Send one person from <paramref name="From"/> to scout <paramref name="TargetKey"/>'s castle.</summary>
public sealed record SendScout(string TargetKey, Job From = Job.Idle) : GameCommand;

/// <summary>Send one person from <paramref name="From"/> as an envoy to <paramref name="TargetKey"/>'s castle with goods and/or a message.</summary>
public sealed record SendEnvoy(string TargetKey, int Food, int Wood, int Iron, int Gold, string? Message = null, Job From = Job.Idle) : GameCommand;

/// <summary>Send one person from <paramref name="From"/> to explore one quarter of the forest (named by its corner): they walk its road, find its places and come home.</summary>
public sealed record SendExplore(World.Corner Quarter, Job From = Job.Idle) : GameCommand;

/// <summary>Send one person from <paramref name="From"/> to a chest they have found: they pick it up and bring the gold home.</summary>
public sealed record SendChestScout(string SiteId, Job From = Job.Idle) : GameCommand;

public enum ArmyMode
{
    /// <summary>March to the target's castle and lay siege.</summary>
    Attack,
    /// <summary>Head down the road towards the target to cut off whoever comes the other way: home after the
    /// first battle on the road, or from half way if nobody came. Nobody else can tell the difference.</summary>
    Intercept,
}

/// <summary>
/// War: send soldiers (unit id → count) towards <paramref name="TargetKey"/>, with an optional row per
/// type, the archers' preferred target and whether to attack the castle or cut off the road.
/// </summary>
public sealed record SendArmy(
    string TargetKey,
    IReadOnlyDictionary<string, int> Units,
    IReadOnlyDictionary<string, Row>? Rows = null,
    string? ArcherPriority = null,
    ArmyMode Mode = ArmyMode.Attack) : GameCommand;

/// <summary>War: send soldiers to a place in the forest the player has found (plunder a village, clear a bandit camp).</summary>
public sealed record SendArmyToSite(
    string SiteId,
    IReadOnlyDictionary<string, int> Units,
    IReadOnlyDictionary<string, Row>? Rows = null,
    string? ArcherPriority = null) : GameCommand;

/// <summary>
/// Give a new order to one of our armies that is on the road (not fighting; marching or on its way home): attack another
/// castle (<paramref name="TargetKey"/>, war phase only) or go to a place in the forest (<paramref name="SiteId"/>). It walks
/// there from where it stands, over the roads. To bring it home use <see cref="RecallArmy"/>.
/// </summary>
public sealed record RedirectArmy(int ArmyId, string? TargetKey = null, string? SiteId = null) : GameCommand;

/// <summary>Call one of our armies home from wherever it is on the road (not while it is fighting).</summary>
public sealed record RecallArmy(int ArmyId) : GameCommand;

/// <summary>How the soldiers at home line up when the castle is attacked.</summary>
public sealed record SetDefense(IReadOnlyDictionary<string, Row>? Rows, string? ArcherPriority) : GameCommand;

/// <summary>Hire soldiers for gold at the castle: they are there at once and cannot become workers.</summary>
public sealed record HireMercenary(string UnitId, int Count) : GameCommand;

/// <summary>Turn automatic population growth on or off.</summary>
public sealed record SetGrowth(bool Enabled) : GameCommand;

public sealed record CommandResult(bool Ok, string? Error = null)
{
    public static readonly CommandResult Success = new(true);
    public static CommandResult Fail(string error) => new(false, error);
}
