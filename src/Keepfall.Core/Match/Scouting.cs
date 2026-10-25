using Keepfall.Core.Economy;
using Keepfall.Core.World;

namespace Keepfall.Core.Match;

public enum MissionKind
{
    /// <summary>To a rival's gate and back with a report.</summary>
    Spy,
    /// <summary>A tour of one quarter of the forest, finding its places.</summary>
    Explore,
    /// <summary>To a chest in the forest and home with its gold.</summary>
    Chest,
}

/// <summary>A scout on the road from <see cref="From"/>'s gate to <see cref="Target"/>'s and back (or on a tour of a forest quarter).</summary>
public sealed class ScoutMission
{
    internal ScoutMission(string publicId, string from, string target, double startedAt, Route route, double speed,
        MissionKind kind = MissionKind.Spy, Corner? quarter = null)
    {
        PublicId = publicId;
        From = from;
        Target = target;
        StartedAt = startedAt;
        Out = new Traveller(route, speed);
        Kind = kind;
        Quarter = quarter;
    }

    public MissionKind Kind { get; }
    /// <summary>For a chest mission: the chest.</summary>
    public SiteState? Site { get; internal init; }
    /// <summary>Gold picked up, delivered when the scout is home.</summary>
    public int LootGold { get; internal set; }
    public int LootIron { get; internal set; }
    /// <summary>For a tour: which quarter of the forest (named by its corner).</summary>
    public Corner? Quarter { get; }

    /// <summary>What other players see it as: random, so it gives nothing away.</summary>
    public string PublicId { get; }
    public string From { get; }
    public string Target { get; }
    public double StartedAt { get; }
    public Traveller Out { get; }
    /// <summary>The way home, once the scout has looked; null until then.</summary>
    public Traveller? Back { get; internal set; }
    public Traveller Leg => Back ?? Out;
    public Vec Position => Leg.Position;
    public Vec Velocity => Leg.Arrived ? new Vec(0, 0) : Leg.Direction * Leg.Speed;
    /// <summary>Taken when the scout arrives; handed to <see cref="From"/> only when the scout is back.</summary>
    public ScoutReport? Report { get; internal set; }
    public bool Arrived => Report is not null || (Kind == MissionKind.Chest && Back is not null);
    /// <summary>Where the last trail point was laid (the next one comes a little further on).</summary>
    internal Vec? LastTrail { get; set; }

    /// <summary>Seconds until the scout is home with its report.</summary>
    public double SecondsLeft => Kind == MissionKind.Explore ? Out.SecondsLeft : Back?.SecondsLeft ?? Out.SecondsLeft + Out.Route.Length / Out.Speed;

    /// <summary>0 → 0.5 on the way there, 0.5 → 1 on the way back (a tour: 0 → 1 round).</summary>
    public double Progress => Kind == MissionKind.Explore ? Out.Fraction : Back is null ? Out.Fraction / 2 : 0.5 + Back.Fraction / 2;
}

/// <summary>A soldier type as the scout saw it: the type is certain, the count is approximate.</summary>
public sealed record ScoutedUnit(string UnitId, string Name, int Count);

/// <summary>
/// What a scout brings back. Deliberately only this: approximate soldier counts and exact building
/// levels. Weapons in storage, workers, resources and queues are never part of a report.
/// </summary>
public sealed record ScoutReport(
    string Target,
    double ObservedAt,
    double DeliveredAt,
    IReadOnlyList<ScoutedUnit> Soldiers,
    IReadOnlyDictionary<BuildingType, int> BuildingLevels);

public enum NotificationKind
{
    /// <summary>OtherPlayer's scout looked at our castle.</summary>
    ScoutedBy,
    /// <summary>An army from OtherPlayer came into sight of the castle and arrives at ArrivesAt.</summary>
    ArmyIncoming,
    /// <summary>We fought OtherPlayer; the report is BattleId.</summary>
    BattleFought,
    /// <summary>OtherPlayer's castle fell (sent to everyone).</summary>
    Eliminated,
}

/// <summary>Something that happened to a player because of another one.</summary>
public sealed record GameNotification(NotificationKind Kind, string OtherPlayer, double At,
    double? ArrivesAt = null, int? BattleId = null);
