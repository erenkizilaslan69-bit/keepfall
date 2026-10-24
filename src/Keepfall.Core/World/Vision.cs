using Keepfall.Core.Units;

namespace Keepfall.Core.World;

/// <summary>Part of the map a player can see right now.</summary>
public sealed record VisionCircle(Vec Center, double Radius)
{
    public bool Contains(Vec p) => Center.DistanceTo(p) <= Radius + 1e-9;
}

public enum MoverKind { Army, Scout }

/// <summary>
/// Another player's army or scout as somebody who can see it: who it belongs to, where it is, which
/// way and how fast it is going, and (for an army) which soldiers it has. Deliberately nothing about
/// where it is headed, its road or when it gets there. <see cref="Id"/> is random and says nothing
/// about the owner, the target or how many others there are.
/// </summary>
public sealed record SeenMover(
    string Id, MoverKind Kind, string Owner, Vec Position, Vec Velocity, IReadOnlyDictionary<UnitType, int> Units);
