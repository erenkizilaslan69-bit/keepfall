using Keepfall.Core.Economy;

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

/// <summary>Send one person from <paramref name="From"/> to scout <paramref name="TargetKey"/>'s castle.</summary>
public sealed record SendScout(string TargetKey, Job From = Job.Idle) : GameCommand;

/// <summary>Turn automatic population growth on or off.</summary>
public sealed record SetGrowth(bool Enabled) : GameCommand;

public sealed record CommandResult(bool Ok, string? Error = null)
{
    public static readonly CommandResult Success = new(true);
    public static CommandResult Fail(string error) => new(false, error);
}
