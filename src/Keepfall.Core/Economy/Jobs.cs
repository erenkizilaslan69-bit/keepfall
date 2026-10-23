namespace Keepfall.Core.Economy;

public enum Job { Idle, Farmer, Lumberjack, Miner, Blacksmith }

public enum BuildingType { Farm, LumberCamp, Mine, Forge }

public enum Resource { Food, Wood, Iron }

public static class Jobs
{
    public static readonly IReadOnlyList<Job> All = Enum.GetValues<Job>();
    public static readonly IReadOnlyList<Job> Working = [Job.Farmer, Job.Lumberjack, Job.Miner, Job.Blacksmith];
    public static readonly IReadOnlyList<BuildingType> Buildings = Enum.GetValues<BuildingType>();

    /// <summary>The building a job works in; null for idle people (no capacity limit).</summary>
    public static BuildingType? BuildingOf(Job job) => job switch
    {
        Job.Farmer => BuildingType.Farm,
        Job.Lumberjack => BuildingType.LumberCamp,
        Job.Miner => BuildingType.Mine,
        Job.Blacksmith => BuildingType.Forge,
        _ => null,
    };

    public static Job WorkerOf(BuildingType building) => building switch
    {
        BuildingType.Farm => Job.Farmer,
        BuildingType.LumberCamp => Job.Lumberjack,
        BuildingType.Mine => Job.Miner,
        _ => Job.Blacksmith,
    };

    /// <summary>The raw resource a job gathers; null for idle people and blacksmiths (who make weapons).</summary>
    public static Resource? ProductOf(Job job) => job switch
    {
        Job.Farmer => Resource.Food,
        Job.Lumberjack => Resource.Wood,
        Job.Miner => Resource.Iron,
        _ => null,
    };

    public static string Name(Job job) => job switch
    {
        Job.Idle => "Boşta",
        Job.Farmer => "Çiftçi",
        Job.Lumberjack => "Oduncu",
        Job.Miner => "Madenci",
        _ => "Demirci",
    };

    public static string Name(BuildingType building) => building switch
    {
        BuildingType.Farm => "Tarla",
        BuildingType.LumberCamp => "Oduncu kampı",
        BuildingType.Mine => "Maden",
        _ => "Demirhane",
    };
}
