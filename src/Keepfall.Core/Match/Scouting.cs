using Keepfall.Core.Economy;
using Keepfall.Core.World;

namespace Keepfall.Core.Match;

/// <summary>A scout on the road from <see cref="From"/>'s gate to <see cref="Target"/>'s and back.</summary>
public sealed class ScoutMission
{
    internal ScoutMission(string from, string target, double startedAt, Route route, double speed)
    {
        From = from;
        Target = target;
        StartedAt = startedAt;
        Out = new Traveller(route, speed);
    }

    public string From { get; }
    public string Target { get; }
    public double StartedAt { get; }
    public Traveller Out { get; }
    /// <summary>The way home, once the scout has looked; null until then.</summary>
    public Traveller? Back { get; internal set; }
    public Traveller Leg => Back ?? Out;
    public Vec Position => Leg.Position;
    /// <summary>Taken when the scout arrives; handed to <see cref="From"/> only when the scout is back.</summary>
    public ScoutReport? Report { get; internal set; }
    public bool Arrived => Report is not null;

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
    /// <summary>An army from OtherPlayer arrives at ArrivesAt. Deliberately nothing about its size.</summary>
    ArmyIncoming,
    /// <summary>We fought OtherPlayer; the report is BattleId.</summary>
    BattleFought,
    /// <summary>OtherPlayer's castle fell (sent to everyone).</summary>
    Eliminated,
}

/// <summary>Something that happened to a player because of another one.</summary>
public sealed record GameNotification(NotificationKind Kind, string OtherPlayer, double At,
    double? ArrivesAt = null, int? BattleId = null);
