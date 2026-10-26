using Keepfall.Core;
using Keepfall.Core.World;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Views;

namespace Keepfall.Bots;

/// <summary>What a module sees and uses while the bot is thinking once.</summary>
public sealed class BotContext(GameRules rules, BotInput input, BotMemory memory, BotDifficulty difficulty, BotLevelRules level, BotStats stats, Random rng)
{
    private readonly List<(double Priority, GameCommand Command, double Wood, double Iron, double Gold)> _wishes = [];

    public GameRules Rules { get; } = rules;
    public BotInput Input { get; } = input;
    public CastleView Castle => Input.Castle;
    public MapStateView? Map => Input.Map;
    public double Now => Input.Now;
    public BotMemory Memory { get; } = memory;
    public BotDifficulty Difficulty { get; } = difficulty;
    public BotLevelRules Level { get; } = level;
    public BotStats Stats { get; } = stats;
    public Random Rng { get; } = rng;
    public Keepfall.Core.Combat.BattleSimulator Simulator { get; init; } = new(rules);

    public int Seat => Input.Seat;
    /// <summary>
    /// The places of the forest the bot may go for now: in the first part of the preparation only those of its own quarter (the big camp in the middle
    /// and the other players' quarters wait, <c>bots.otherQuartersFrom</c>); later on, and in the war, every place it knows.
    /// </summary>
    public IReadOnlyList<SiteView> Sites
    {
        get
        {
            var all = Map?.Sites ?? [];
            if (AtWar || PrepProgress >= Rules.Bots.OtherQuartersFrom) return all;
            var own = Castle.Scouting.Quarters.FirstOrDefault(q => q.Seat == Seat)?.Corner;
            return all.Where(s => s.Kind != SiteKind.BigCamp && s.Quarter is { } q && q == own).ToList();
        }
    }
    public VecView? MyGate => Input.Layout?.Regions.FirstOrDefault(r => r.Seat == Seat)?.Gate;
    public IEnumerable<PlayerView> Rivals => Input.Room.Players.Where(p => p.Seat != Seat && !p.Eliminated);

    /// <summary>The newest scout report about a rival (null: never scouted).</summary>
    public ScoutReportView? LatestReport(int seat) =>
        Castle.Scouting.Reports.Where(r => r.TargetSeat == seat).OrderByDescending(r => r.ObservedAt).FirstOrDefault();

    /// <summary>Who can go scouting: an idle person, else somebody from a job where one person less hardly matters.</summary>
    public Job? ScoutSource()
    {
        if (Count(Job.Idle) > 0) return Job.Idle;
        return new[] { Job.Lumberjack, Job.Miner, Job.Blacksmith, Job.Farmer }.Where(j => Count(j) >= (j == Job.Farmer ? 5 : 2))
            .OrderByDescending(j => Count(j) - (j == Job.Farmer ? 3 : 0)).Cast<Job?>().FirstOrDefault();
    }

    /// <summary>How far into the war we are (0–1; 0 before it begins).</summary>
    public double WarProgress
    {
        get
        {
            if (!AtWar) return 0;
            double elapsed = Castle.ElapsedSeconds - Castle.PrepSeconds;
            return Math.Clamp(elapsed / Math.Max(1, elapsed + Castle.RemainingSeconds), 0, 1);
        }
    }

    /// <summary>A scout or an army is already on its way to this place.</summary>
    public bool SiteBusy(string siteId) =>
        Castle.Scouting.Missions.Any(m => m.SiteId == siteId) || Castle.War.Armies.Any(a => a.SiteId == siteId);

    /// <summary>About how long an army needs to get from the gate to a place (the road is longer than the straight line).</summary>
    public double ArmyTravelSeconds(VecView to) =>
        MyGate is { } g ? Math.Sqrt((g.X - to.X) * (g.X - to.X) + (g.Y - to.Y) * (g.Y - to.Y)) * 1.5 / Rules.Map.ArmySpeed : 60;

    /// <summary>Wood and iron a module has set aside (for an upgrade it is saving up for): weapons are not forged out of it.</summary>
    public (double Wood, double Iron) Reserved { get; private set; }

    public void Reserve(double wood, double iron) => Reserved = (Reserved.Wood + wood, Reserved.Iron + iron);

    /// <summary>True when this part of the mind slips this time (never for a good bot, now and then for a poor one).</summary>
    public bool Slip() => Rng.NextDouble() < Level.Mistake;

    /// <summary>The same for the economy parts of the mind (people, buildings, weapons).</summary>
    public bool SlipEco() => Rng.NextDouble() < Level.EcoMistake;

    public int Count(Job job) => Castle.Jobs.FirstOrDefault(j => j.Job == job)?.Count ?? 0;
    public int? Capacity(Job job) => Castle.Jobs.FirstOrDefault(j => j.Job == job)?.Capacity;
    public UnitView Unit(string id) => Castle.Units.First(u => u.Id == id);

    /// <summary>Weapons forged or still in the queue, which are waiting to be turned into soldiers.</summary>
    public int WeaponsWaiting => Castle.Units.Sum(u => u.Weapons) + Castle.Queue.Sum(o => o.Remaining);

    private readonly Dictionary<string, int> _committed = [];

    /// <summary>Soldiers another module has already sent away in this think (they are not at home any more).</summary>
    public void Commit(IReadOnlyDictionary<string, int> units)
    {
        foreach (var (id, n) in units) _committed[id] = _committed.GetValueOrDefault(id) + n;
    }

    /// <summary>Soldiers of a type at home and not yet promised to an army this think.</summary>
    public int HomeSoldiers(string unitId) => Math.Max(0, Unit(unitId).Soldiers - _committed.GetValueOrDefault(unitId));

    /// <summary>An army is on its way to the castle (and the bot has had time to notice): nobody leaves.</summary>
    public bool UnderThreat => Memory.Threats(Now).Any();

    /// <summary>What the bot works out about a rival's soldiers: the newest of a scout report (approximate) and the last siege it fought at that gate (exact).</summary>
    public RivalEstimate? EstimateOf(int seat)
    {
        RivalEstimate? best = null;
        if (LatestReport(seat) is { } r)
            best = new RivalEstimate(r.Soldiers.ToDictionary(u => u.UnitId, u => u.Count), r.ObservedAt, false);
        var siege = Castle.War.Battles.Where(b => b.Kind == BattleKind.Siege && b.Attacking && b.OpponentSeat == seat).OrderByDescending(b => b.At).FirstOrDefault();
        if (siege is not null && (best is null || siege.At > best.At))
            best = new RivalEstimate(siege.DefenderUnits.ToDictionary(u => u.UnitId, u => Math.Max(0, u.Count - u.Lost)), siege.At, true);
        return best;
    }

    /// <summary>Soldiers at home and on the road.</summary>
    public int SoldiersTotal => Castle.Soldiers + Castle.War.SoldiersAway;

    /// <summary>Soldiers, weapons and queued weapons of one unit type, wherever they are.</summary>
    public int Owned(string unitId) =>
        Unit(unitId).Soldiers + Unit(unitId).Weapons + Castle.Queue.Where(o => o.UnitId == unitId).Sum(o => o.Remaining)
        + Castle.War.Armies.SelectMany(a => a.Units).Where(u => u.UnitId == unitId).Sum(u => u.Count);

    /// <summary>How many more people may become soldiers (or weapons for them) before the castle would run short of workers.</summary>
    public int ArmyRoom => Math.Max(0, (int)Math.Floor(Castle.Population * Rules.Bots.ArmyShare) - SoldiersTotal - WeaponsWaiting);

    /// <summary>How far into the preparation we are (0–1; 1 once the war has begun).</summary>
    public double PrepProgress => Castle.PrepSeconds <= 0 ? 1 : Math.Clamp(Castle.ElapsedSeconds / Castle.PrepSeconds, 0, 1);
    public bool AtWar => Castle.Phase == MatchPhase.War;
    /// <summary>Late in the preparation, and in the war: stored weapons are turned into soldiers.</summary>
    public bool ArmingTime => !Level.HoldWeapons && (AtWar || PrepProgress >= Rules.Bots.ArmFrom);
    /// <summary>The army is being built: the preparation is past its first stretch.</summary>
    public bool ForgingTime => AtWar || PrepProgress >= Rules.Bots.WeaponsFrom;

    private int _idleTaken;

    /// <summary>
    /// Turns <paramref name="n"/> stored weapons of one unit type into soldiers now (people leave their jobs for it if nobody is idle).
    /// The commands go first in the think, so a soldier armed here can be sent out in the same go.
    /// </summary>
    public void ArmFromStore(string unitId, int n)
    {
        n = Math.Min(n, Unit(unitId).Weapons);
        if (n <= 0) return;
        int idle = Math.Max(0, Count(Job.Idle) - _idleTaken);
        int pull = n - idle;
        if (pull > 0)
        {
            var from = Jobs.Working.Where(j => j != Job.Farmer).OrderByDescending(Count).FirstOrDefault();
            int take = Math.Min(pull, Count(from));
            if (take > 0) { Wish(112, new MoveWorkers(from, Job.Idle, take)); idle += take; }
        }
        n = Math.Min(n, idle);
        if (n <= 0) return;
        _idleTaken += n;
        Wish(110, new ArmWorkers(unitId, n, Job.Idle));
    }

    /// <summary>
    /// The unit type that does best against the soldiers its rivals have as the scout reports show them (the biggest rival it has a report on):
    /// each type is tried added to what the bot has, in the game's own fight calculator. Null for a bot that does not do this, or with nothing to go on.
    /// It is worked out now and then, not every think.
    /// </summary>
    public string? CounterPick()
    {
        if (!Level.CounterUnits) return null;
        if (Now - Memory.CounterAt < 25) return Memory.CounterPick;
        Memory.CounterAt = Now;
        Memory.CounterPick = null;
        RivalEstimate? rival = null;
        foreach (var r in Rivals)
            if (EstimateOf(r.Seat) is { } e && Now - e.At < Rules.Bots.StaleReportSeconds * 3 && e.Total > (rival?.Total ?? 0)) rival = e;
        if (rival is null) return null;
        var theirs = Tactics.Setup(this, "Rakip", rival.Units);
        var mine = Castle.Units.ToDictionary(u => u.Id, u => Owned(u.Id));
        string? best = null;
        double bestRate = -1;
        foreach (var u in Castle.Units.OrderBy(_ => Rng.Next()))
        {
            var with = new Dictionary<string, int>(mine);
            with[u.Id] += 4;
            double rate = Tactics.Win(this, Tactics.Setup(this, "Biz", with), theirs).Rate;
            if (rate > bestRate + 1e-9) { bestRate = rate; best = u.Id; }
        }
        return Memory.CounterPick = best;
    }

    /// <summary>Ask for a command: higher <paramref name="priority"/> goes first; it only goes out if what it costs is still there.</summary>
    public void Wish(double priority, GameCommand command, double wood = 0, double iron = 0, double gold = 0)
    {
        if (Memory.IsRefused(command, Now)) return;
        _wishes.Add((priority, command, wood, iron, gold));
    }

    /// <summary>The wishes in order of priority, as many as the budget and <paramref name="most"/> allow.</summary>
    public IReadOnlyList<GameCommand> Decide(int most)
    {
        var res = Castle.Resources;
        double wood = res.Wood, iron = res.Iron, gold = res.Gold;
        var chosen = new List<GameCommand>();
        foreach (var w in _wishes.OrderByDescending(w => w.Priority))
        {
            if (chosen.Count >= most) break;
            if (w.Wood > wood + 1e-9 || w.Iron > iron + 1e-9 || w.Gold > gold + 1e-9) continue;
            wood -= w.Wood;
            iron -= w.Iron;
            gold -= w.Gold;
            chosen.Add(w.Command);
        }
        return chosen;
    }
}
