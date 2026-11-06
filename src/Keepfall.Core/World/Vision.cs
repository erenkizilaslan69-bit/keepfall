using Keepfall.Core.Units;

namespace Keepfall.Core.World;

/// <summary>Part of the map a player can see right now.</summary>
public sealed record VisionCircle(Vec Center, double Radius)
{
    public bool Contains(Vec p) => Center.DistanceTo(p) <= Radius + 1e-9;
}

/// <summary>
/// A stretch of ground a scout walked over, still in view. <see cref="Fade"/> goes 1 → 0 over the last seconds
/// before it closes (the client only uses it to draw the fog closing in; once it is gone it is simply not there).
/// </summary>
public sealed record TrailCircle(Vec Center, double Radius, double Fade);

/// <summary>Where a rival army was when the player last saw it (it has left their sight since): its owner as it looked then, its place, the soldiers they made out, and how long ago.</summary>
public sealed record LastSeenArmy(string Id, string Owner, Vec Position, IReadOnlyDictionary<UnitType, int> Units, double SecondsAgo);

public enum MoverKind { Army, Scout, Envoy }

/// <summary>
/// Another player's army or scout as somebody who can see it: who it belongs to, where it is, which
/// way and how fast it is going, and (for an army) which soldiers it has. Deliberately nothing about
/// where it is headed, its road or when it gets there. <see cref="Id"/> is random and says nothing
/// about the owner, the target or how many others there are.
/// </summary>
public sealed record SeenMover(
    string Id, MoverKind Kind, string Owner, Vec Position, Vec Velocity, IReadOnlyDictionary<UnitType, int> Units,
    bool Fake = false, string? RealOwner = null);
