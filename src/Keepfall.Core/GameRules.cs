using Keepfall.Core.Lobby;
using Keepfall.Core.Economy;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core;

public sealed record CombatSettings(
    double TickSeconds,
    double MaxBattleSeconds,
    bool RandomizeFirstAttack,
    double ApproachTime);

public sealed record ProductionRates(double FoodPerMinute, double WoodPerMinute, double IronPerMinute);

/// <summary>Everything the simulation needs, resolved from the balance config.</summary>
public sealed class GameRules
{
    public GameRules(IReadOnlyList<UnitType> units, CounterMatrix counters, CombatSettings combat, ProductionRates production,
        MatchRules match, EconomyRules economy, ScoutingRules scouting, WarRules war, MapRules map,
        IReadOnlyDictionary<string, double>? mercenaryPrices = null, ForestRules? forest = null, BotRules? bots = null, EnvoyRules? envoy = null, WallRules? walls = null, DeckRules? deck = null)
    {
        Deck = deck ?? DeckRules.Off;
        Walls = walls ?? new WallRules();
        Envoy = envoy ?? EnvoyRules.Default;
        Bots = bots ?? BotRules.Default;
        Forest = forest ?? ForestRules.None;
        MercenaryPrices = mercenaryPrices ?? new Dictionary<string, double>();
        Units = units;
        Counters = counters;
        Combat = combat;
        Production = production;
        Match = match;
        Economy = economy;
        Scouting = scouting;
        War = war;
        Map = map;
    }

    public IReadOnlyList<UnitType> Units { get; }
    public CounterMatrix Counters { get; }
    public CombatSettings Combat { get; }
    public ProductionRates Production { get; }
    public MatchRules Match { get; }
    public EconomyRules Economy { get; }
    public ScoutingRules Scouting { get; }
    public WarRules War { get; }
    public MapRules Map { get; }
    public ForestRules Forest { get; }
    public BotRules Bots { get; }
    public EnvoyRules Envoy { get; }
    public WallRules Walls { get; }
    public DeckRules Deck { get; }
    /// <summary>Gold per soldier when hiring (by unit id); a unit without a price cannot be hired.</summary>
    public IReadOnlyDictionary<string, double> MercenaryPrices { get; }

    /// <summary>Is this a deck the match accepts: the right number of different, known units?</summary>
    public bool IsValidDeck(IEnumerable<string>? ids) =>
        ids is not null && ids.Select(i => FindUnit(i)?.Id).Distinct().Where(i => i is not null).Count() == Deck.Size && ids.Count() == Deck.Size;

    /// <summary>A random deck (for a player who did not pick, and for easy bots).</summary>
    public IReadOnlyList<string> RandomDeck(Random rng) => Units.OrderBy(_ => rng.Next()).Take(Deck.Size).Select(u => u.Id).ToList();

    public UnitType? FindUnit(string idOrName) =>
        Units.FirstOrDefault(u => string.Equals(u.Id, idOrName, StringComparison.OrdinalIgnoreCase)
                               || string.Equals(u.Name, idOrName, StringComparison.CurrentCultureIgnoreCase));

    /// <summary>
    /// Resource cost expressed in wood: each resource is weighted by how long one worker needs to
    /// produce it relative to wood (e.g. 1 iron = woodRate / ironRate wood).
    /// </summary>
    public double ResourceValueInWood(UnitType unit) =>
        unit.Cost.Wood
        + unit.Cost.Iron * Production.WoodPerMinute / Production.IronPerMinute
        + unit.Cost.Food * Production.WoodPerMinute / Production.FoodPerMinute;
}
