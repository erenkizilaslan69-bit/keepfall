using Keepfall.Core.Economy;
using Keepfall.Core.World;

namespace Keepfall.Core.Match;

/// <summary>A scout on the road from <see cref="From"/>'s gate to <see cref="Target"/>'s and back.</summary>
public sealed class ScoutMission
{
    internal ScoutMission(string publicId, string from, string target, double startedAt, Route route, double speed)
    {
        PublicId = publicId;
        From = from;
        Target = target;
        StartedAt = startedAt;
        Out = new Traveller(route, speed);
    }

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
    public bool Arrived => Report is not null;
    /// <summary>Where the last trail point was laid (the next one comes a little further on).</summary>
    internal Vec? LastTrail { get; set; }

    /// <summary>Seconds until the scout is home with its report.</summary>
    public double SecondsLeft => Back?.SecondsLeft ?? Out.SecondsLeft + Out.Route.Length / Out.Speed;

    /// <summary>0 → 0.5 on the way there, 0.5 → 1 on the way back.</summary>
    public double Progress => Back is null ? Out.Fraction / 2 : 0.5 + Back.Fraction / 2;
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
