using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Match;

/// <summary>What is left of one of the forest's places: it can be used up (a chest taken, a village plundered), and a camp loses bandits.</summary>
public sealed class SiteState
{
    internal SiteState(ForestSite site, IReadOnlyDictionary<UnitType, int> bandits)
    {
        Site = site;
        Bandits = bandits.ToDictionary(kv => kv.Key, kv => kv.Value);
    }

    public ForestSite Site { get; }
    /// <summary>Used up: a chest taken or a village plundered (a camp is never "gone": it just has no bandits left).</summary>
    public bool Gone { get; internal set; }
    /// <summary>Who is left in a camp.</summary>
    public Dictionary<UnitType, int> Bandits { get; }
    public int BanditCount => Bandits.Values.Sum();
    /// <summary>Counts up whenever the place changes, so a player's picture of it can tell whether it is out of date.</summary>
    public int Version { get; internal set; }
    /// <summary>A place in use by an army or a scout right now (nobody else loots it in the same moment).</summary>
    public bool Cleared => Site.Kind is SiteKind.Camp or SiteKind.BigCamp ? BanditCount == 0 : Gone;
}

/// <summary>
/// What one player knows of a place of the forest: that it is there (they found it), and how it looked the last
/// time they had it in sight. Never more: a place nobody found is not in anyone's knowledge.
/// </summary>
public sealed record KnownSite(
    ForestSite Site, double DiscoveredAt, double SeenAt, bool Gone, IReadOnlyDictionary<UnitType, int> BanditsSeen);

internal sealed class SiteKnowledge
{
    public double DiscoveredAt { get; init; }
    public double SeenAt { get; set; }
    public int SeenVersion { get; set; }
    public bool Gone { get; set; }
    public IReadOnlyDictionary<UnitType, int> Bandits { get; set; } = new Dictionary<UnitType, int>();
}
