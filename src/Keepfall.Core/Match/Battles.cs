using Keepfall.Core.Combat;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Match;

public enum BattleKind
{
    /// <summary>An army at a castle gate against whoever defends it, then (if it wins) a siege of the gate.</summary>
    Siege,
    /// <summary>Two armies that met on the road.</summary>
    Field,
    /// <summary>An army against the bandits of a camp in the forest.</summary>
    Camp,
}

/// <summary>
/// A battle that is being fought right now. It is simulated in full the moment it starts (so its
/// record can be replayed), but it takes its time: for <see cref="FightSeconds"/> the soldiers fight
/// and, after a won siege fight, the survivors hammer the gate for <see cref="SiegeSeconds"/>. Until
/// <see cref="EndsAt"/> everyone in it is held: the armies do not move and the defenders cannot be sent
/// or disarmed. Only then are losses, castle damage and the report applied.
/// </summary>
public sealed class ActiveBattle
{
    internal ActiveBattle(int id, string publicId, BattleKind kind, Vec position, Vec facing, double startedAt,
        ArmyMarch attacker, ArmyMarch? opponent, string defender)
    {
        Id = id;
        PublicId = publicId;
        Kind = kind;
        Position = position;
        Facing = facing;
        StartedAt = startedAt;
        Attacker = attacker;
        Opponent = opponent;
        Defender = defender;
    }

    public int Id { get; }
    /// <summary>What players see it as: random, so it gives nothing away.</summary>
    public string PublicId { get; }
    public BattleKind Kind { get; }
    /// <summary>Where it is fought: the defender's gate, or where the two armies met.</summary>
    public Vec Position { get; }
    /// <summary>The way the attacking side faces (towards the gate, or towards the other army).</summary>
    public Vec Facing { get; }
    public double StartedAt { get; }

    /// <summary>Side A of the record: the army at the gate, or the first of the two that met.</summary>
    public ArmyMarch Attacker { get; }
    /// <summary>Side B in a field battle; null at a castle.</summary>
    public ArmyMarch? Opponent { get; }
    /// <summary>Player key of side B: the castle's owner, or the other army's.</summary>
    public string Defender { get; }

    public IReadOnlyDictionary<UnitType, int> AttackerUnits { get; internal set; } = new Dictionary<UnitType, int>();
    public IReadOnlyDictionary<UnitType, int> DefenderUnits { get; internal set; } = new Dictionary<UnitType, int>();
    public IReadOnlyDictionary<UnitType, int> AttackerSurvivors { get; internal set; } = new Dictionary<UnitType, int>();
    public IReadOnlyDictionary<UnitType, int> DefenderSurvivors { get; internal set; } = new Dictionary<UnitType, int>();
    public BattleWinner Winner { get; internal set; }
    /// <summary>Damage the gate takes when the siege is over (0 unless the attacker won at a castle).</summary>
    public double CastleDamage { get; internal set; }
    public BattleRecord Record { get; internal set; } = null!;

    public double FightSeconds { get; internal set; }
    public double SiegeSeconds { get; internal set; }
    public double EndsAt => StartedAt + FightSeconds + SiegeSeconds;

    public bool Involves(string player) => Attacker.From == player || Defender == player;
}
