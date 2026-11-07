using Keepfall.Core.Economy;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Match;

/// <summary>
/// Shape check for a command that came over the wire, before any rule looks at it: a number the client sends for an enum
/// (job, building, corner, row, mode) may be anything an int can be, and a dictionary may have any number of entries.
/// Nothing here is a game rule; it only keeps a hand-made message from reaching code that indexes arrays by those values
/// (a row of 99 would blow up the battle simulation of whoever gets attacked, tick after tick).
/// </summary>
public static class CommandGuard
{
    /// <summary>Most entries any unit table of a command may have (a deck is four; this is generous on purpose).</summary>
    public const int MaxEntries = 16;
    /// <summary>Longest id, key or unit name a command may carry.</summary>
    public const int MaxIdLength = 64;
    /// <summary>Largest number of people, weapons or soldiers any command may name (a castle never holds a thousandth of it); keeps sums of several entries from overflowing an int.</summary>
    public const int MaxCount = 1_000_000;

    private static readonly CommandResult Malformed = CommandResult.Fail("Geçersiz komut.");

    /// <summary>Null when the command is well formed, otherwise the refusal.</summary>
    public static CommandResult? Check(GameCommand? command)
    {
        if (command is null) return Malformed;
        bool ok = command switch
        {
            MoveWorkers c => Defined(c.From) && Defined(c.To) && Count(c.Count),
            QueueWeapon c => Id(c.UnitId) && Count(c.Count),
            ArmWorkers c => Id(c.UnitId) && Defined(c.From) && Count(c.Count),
            DisarmSoldiers c => Id(c.UnitId) && Count(c.Count),
            UpgradeBuilding c => Enum.IsDefined(c.Building),
            SendScout c => Id(c.TargetKey) && Defined(c.From),
            SendEnvoy c => Id(c.TargetKey) && Defined(c.From) && OptId(c.AsKey),
            SendExplore c => Enum.IsDefined(c.Quarter) && Defined(c.From),
            SendChestScout c => Id(c.SiteId) && Defined(c.From),
            SendArmy c => Id(c.TargetKey) && Enum.IsDefined(c.Mode) && OptId(c.AsKey) && Table(c.Units) && Rows(c.Rows) && OptId(c.ArcherPriority),
            SendArmyToSite c => Id(c.SiteId) && Table(c.Units) && Rows(c.Rows) && OptId(c.ArcherPriority),
            RedirectArmy c => OptId(c.TargetKey) && OptId(c.SiteId),
            SetDefense c => Rows(c.Rows) && OptId(c.ArcherPriority),
            HireMercenary c => Id(c.UnitId) && Count(c.Count),
            SendDecoy c => Id(c.TargetKey) && Table(c.Units),
            SetFakeReport c => Table(c.Units),
            BribeArmy c => Id(c.ArmyId) && Count(c.Count),
            HireCamp c => Id(c.SiteId) && Id(c.TargetKey),
            _ => true,
        };
        return ok ? null : Malformed;
    }

    private static bool Defined(Job job) => Enum.IsDefined(job);

    private static bool Count(int n) => n <= MaxCount;

    private static bool Id(string? s) => s is not null && s.Length <= MaxIdLength;

    private static bool OptId(string? s) => s is null || s.Length <= MaxIdLength;

    private static bool Table(IReadOnlyDictionary<string, int>? units) =>
        units is null || (units.Count <= MaxEntries && units.All(kv => Id(kv.Key) && Count(kv.Value)));

    private static bool Rows(IReadOnlyDictionary<string, Row>? rows) =>
        rows is null || (rows.Count <= MaxEntries && rows.All(kv => Id(kv.Key) && Enum.IsDefined(kv.Value)));
}
