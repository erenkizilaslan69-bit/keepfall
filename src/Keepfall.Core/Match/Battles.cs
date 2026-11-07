using Keepfall.Core.Combat;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Match;

public enum BattleKind
{
    /// <summary>An army at a castle gate against whoever defends it; if the attacker wins the castle falls.</summary>
    Siege,
    /// <summary>Two armies that met on the road.</summary>
    Field,
    /// <summary>An army against the bandits of a camp in the forest.</summary>
    Camp,
}

/// <summary>A battle a player is to be told about: all of it, or (<paramref name="UpdateFromTick"/>) only what changes from that tick on, because somebody joined it.</summary>
public readonly record struct StartedBattle(ActiveBattle Battle, int? UpdateFromTick);

/// <summary>
/// A battle that is being fought right now. It is simulated in full the moment it starts (so its
/// record can be replayed), but it takes its time: for <see cref="FightSeconds"/> the soldiers fight. Until
/// <see cref="EndsAt"/> everyone in it is held: the armies do not move and the defenders cannot be sent
/// or disarmed. Only then are losses and the report applied (and, if the attacker won at a castle, it falls).
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
        Attackers.Add(attacker);
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
    /// <summary>Every army that besieges the gate, in the order they came (the first is <see cref="Attacker"/>). Always one, except in a siege.</summary>
    public List<ArmyMarch> Attackers { get; } = [];
    /// <summary>Side B in a field battle; null at a castle.</summary>
    public ArmyMarch? Opponent { get; }
    /// <summary>Player key of side B: the castle's owner, or the other army's.</summary>
    public string Defender { get; }

    public IReadOnlyDictionary<UnitType, int> AttackerUnits { get; internal set; } = new Dictionary<UnitType, int>();
    public IReadOnlyDictionary<UnitType, int> DefenderUnits { get; internal set; } = new Dictionary<UnitType, int>();
    public IReadOnlyDictionary<UnitType, int> AttackerSurvivors { get; internal set; } = new Dictionary<UnitType, int>();
    public IReadOnlyDictionary<UnitType, int> DefenderSurvivors { get; internal set; } = new Dictionary<UnitType, int>();
    public BattleWinner Winner { get; internal set; }

    // A siege can have more than one attacker: side 0 (the first), side 1 (the castle), then side 2... for those who joined.
    internal int Seed { get; set; }
    internal List<ArmySetup> Setups { get; } = [];
    internal List<SimEvent> Events { get; } = [];
    public IReadOnlyList<IReadOnlyDictionary<UnitType, int>> ExtraUnits { get; internal set; } = [];
    public IReadOnlyList<IReadOnlyDictionary<UnitType, int>> ExtraSurvivors { get; internal set; } = [];
    public IReadOnlyList<int> KillsBySide { get; internal set; } = [];
    /// <summary>The side left standing in a siege (0 or 2.. a besieger, 1 the castle); null = nobody.</summary>
    public int? WinnerSide { get; internal set; }
    /// <summary>The side number of the n-th attacker in the record: 0, then 2, 3...</summary>
    public int SideOfAttacker(int index) => index == 0 ? 0 : index + 1;
    public IReadOnlyDictionary<UnitType, int> UnitsOf(int attackerIndex) => attackerIndex == 0 ? AttackerUnits : ExtraUnits[attackerIndex - 1];
    public IReadOnlyDictionary<UnitType, int> SurvivorsOf(int attackerIndex) => attackerIndex == 0 ? AttackerSurvivors : ExtraSurvivors[attackerIndex - 1];
    public BattleRecord Record { get; internal set; } = null!;

    public double FightSeconds { get; internal set; }
    public double EndsAt => StartedAt + FightSeconds;

    public bool Involves(string player) => Defender == player || Attackers.Any(a => a.From == player);
}
