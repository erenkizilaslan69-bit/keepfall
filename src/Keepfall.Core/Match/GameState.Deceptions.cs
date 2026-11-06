namespace Keepfall.Core.Match;

public enum DeceptionKind
{
    /// <summary>The Shadow set a false army table for scouts to read.</summary>
    FakeReportSet,
    /// <summary>A scout of <c>Target</c> read the Shadow's false table (<c>Actor</c> = the Shadow).</summary>
    FakeReportRead,
    /// <summary>The Oracle's scout read the Shadow's table and saw that it is false.</summary>
    FakeReportSeenThrough,
    DecoySent,
    /// <summary>The phantom came into the sight of its target's castle.</summary>
    DecoySighted,
    /// <summary>The phantom reached the target's gate and faded.</summary>
    DecoyFaded,
    /// <summary>The phantom came within reach of another army and faded on the road.</summary>
    DecoyMet,
    /// <summary>The Oracle saw a phantom or a disguised army coming at their castle.</summary>
    OracleSawIncoming,
    /// <summary>A Merchant bribed part of an army (<c>Target</c> = its owner, <c>Count</c> soldiers turned back home).</summary>
    Bribed,
    CampRented,
    /// <summary>A rented camp fought at the gate (<c>Detail</c> = "fell" or "held").</summary>
    RentedFought,
    EnvoyAsSent,
    EnvoyAsDelivered,
    ArmyAsSent,
    /// <summary>A disguised army fought (<c>Detail</c> = "fell" or "held").</summary>
    DisguisedFought,
    /// <summary>The disguise came out (<c>Target</c> = who was told, <c>Detail</c> = "time" or "scout").</summary>
    Unmasked,
}

/// <summary>
/// One entry of the match's deception log. Plain facts only (who did what to whom, when); the client words them.
/// Players are castle keys here; the log goes to the room's players only after the match is over.
/// </summary>
public sealed record DeceptionEvent(double At, DeceptionKind Kind, string Actor, string? Target = null, string? As = null, int Count = 0, string? Detail = null);

public sealed partial class GameState
{
    private const int MaxDeceptionEvents = 600;
    private readonly List<DeceptionEvent> _deceptions = [];

    /// <summary>What was faked, bribed and disguised so far. For the end-of-match summary: never show it to a player before the match is over.</summary>
    public IReadOnlyList<DeceptionEvent> DeceptionLog => _deceptions;

    private void LogDeception(DeceptionKind kind, string actor, string? target = null, string? asKey = null, int count = 0, string? detail = null)
    {
        if (_deceptions.Count < MaxDeceptionEvents) _deceptions.Add(new DeceptionEvent(ElapsedSeconds, kind, actor, target, asKey, count, detail));
    }
}
