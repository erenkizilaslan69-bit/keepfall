using System.Security.Cryptography;
using Keepfall.Core.Combat;
using Keepfall.Core.Economy;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Match;

public enum MatchPhase { Preparation, War, Ended }

public sealed record EconomySample(double Seconds, int Population, int Soldiers, double Food, double Wood, double Iron);

/// <summary>A player's end-of-match summary: economy and war.</summary>
public sealed record EconomySummary(
    double DurationSeconds,
    int StartPopulation,
    int FinalPopulation,
    int PeakPopulation,
    int PeopleBorn,
    IReadOnlyDictionary<Job, int> Workers,
    IReadOnlyDictionary<string, int> Soldiers,
    IReadOnlyDictionary<string, int> WeaponsInStock,
    int WeaponsMade,
    double ProducedFood,
    double ProducedWood,
    double ProducedIron,
    double FinalFood,
    double FinalWood,
    double FinalIron,
    double StarvingSeconds,
    double IdleWorkerSeconds,
    IReadOnlyDictionary<BuildingType, int> BuildingLevels,
    IReadOnlyList<EconomySample> Samples,
    WarStats War);

/// <summary>
/// A match: one shared clock (preparation, then war) and one castle per player. <see cref="Tick"/> is a
/// plain function of elapsed time, so tests can drive it directly; the server calls it once per tick.
///
/// Commands always name the player, so a command only ever changes that player's own castle. Other
/// castles are only ever touched through the rules here: a scout looks (and learns what a
/// <see cref="ScoutReport"/> holds), an army arrives and fights (and both sides get a <see cref="BattleReport"/>).
/// </summary>
public sealed class GameState
{
    public const double SampleIntervalSeconds = 30;

    private readonly Dictionary<string, PlayerEconomy> _players;
    private readonly Dictionary<string, Corner> _corners;
    private readonly List<ScoutMission> _missions = [];
    private readonly Dictionary<(string From, string Target), ScoutReport> _reports = [];
    private readonly List<ArmyMarch> _armies = [];
    private readonly List<BattleReport> _battles = [];
    private readonly List<ActiveBattle> _active = [];
    private readonly Dictionary<string, List<ActiveBattle>> _startedBattles = [];
    /// <summary>Every battle that began since the spectator feed last asked (for fallen players, who watch all of them).</summary>
    private readonly List<ActiveBattle> _startedForSpectators = [];
    /// <summary>The ground scouts walked over that is still in view: where, whose, and until when (null = to the end).</summary>
    private readonly List<TrailPoint> _trail = [];
    private sealed record TrailPoint(string Owner, Vec Center, double? ExpiresAt);
    /// <summary>The trail fades out over this many seconds before it closes.</summary>
    public const double TrailFadeSeconds = 10;
    /// <summary>What is left of each place in the forest (by id).</summary>
    private readonly Dictionary<string, SiteState> _sites = [];
    /// <summary>What each player has found, and how it looked when they last saw it.</summary>
    private readonly Dictionary<string, Dictionary<string, SiteKnowledge>> _knowledge = [];
    /// <summary>Quarters each player's scouts have toured.</summary>
    private readonly Dictionary<string, HashSet<Corner>> _explored = [];
    private readonly Dictionary<string, double> _eliminated = [];
    private readonly Dictionary<string, List<GameNotification>> _notifications = [];
    /// <summary>What envoys left at each castle, newest last (only that castle's owner ever sees it).</summary>
    private readonly Dictionary<string, List<Letter>> _letters = [];
    private int _nextLetter = 1;
    public const int MaxLetters = 30;
    private readonly BattleSimulator _simulator;
    private readonly Random _rng;
    private double _nextSample;
    private int _nextId = 1;

    /// <param name="prepSeconds">Preparation length; default: the short mode's.</param>
    /// <param name="warSeconds">War length; default: the short mode's.</param>
    /// <param name="rng">Randomness for scout errors and battles; tests pass a seeded one.</param>
    /// <param name="corners">Which corner of the map each player gets; default: <see cref="AssignCorners"/>.</param>
    public GameState(GameRules rules, IEnumerable<string> playerKeys, double? prepSeconds = null,
        double? warSeconds = null, Random? rng = null, IReadOnlyDictionary<string, Corner>? corners = null, int? forestSeed = null)
    {
        Rules = rules;
        // Its own randomness, so seeded matches play their battles the same whatever the forest looks like.
        ForestSites = ForestLayout.Generate(WorldMap.Standard, rules.Forest, new Random(forestSeed ?? RandomNumberGenerator.GetInt32(int.MaxValue)));
        Map = WorldMap.Standard.WithSites(ForestSites);
        foreach (var site in ForestSites)
            _sites[site.Id] = new SiteState(site, site.Bandits.Where(kv => rules.FindUnit(kv.Key) is not null)
                .ToDictionary(kv => rules.FindUnit(kv.Key)!, kv => kv.Value));
        _rng = rng ?? new Random(RandomNumberGenerator.GetInt32(int.MaxValue));
        _simulator = new BattleSimulator(rules);
        PrepSeconds = prepSeconds ?? rules.Match.ShortModePrepSeconds;
        WarSeconds = warSeconds ?? rules.Match.ShortModeWarSeconds;
        _players = playerKeys.Distinct().ToDictionary(k => k, _ => new PlayerEconomy(new Castle(rules)));
        if (_players.Count == 0) throw new ArgumentException("A match needs at least one player.", nameof(playerKeys));
        if (_players.Count > 4) throw new ArgumentException("The map has four corners.", nameof(playerKeys));
        _corners = corners?.ToDictionary(kv => kv.Key, kv => kv.Value) ?? AssignCorners(_players.Keys.ToList());
        if (!_players.Keys.All(_corners.ContainsKey) || _corners.Values.Distinct().Count() != _corners.Count)
            throw new ArgumentException("Every player needs a corner of their own.", nameof(corners));
        TakeSamples();
    }

    /// <summary>
    /// Two players get opposite corners; three get three of the four, chosen at random (so no seat is
    /// always the one between two neighbours); four fill the map. Who gets which is random too.
    /// Uses its own randomness, so a seeded match plays its battles the same whatever the corners.
    /// </summary>
    public static Dictionary<string, Corner> AssignCorners(IReadOnlyList<string> players, Random? random = null)
    {
        var rng = random ?? new Random(RandomNumberGenerator.GetInt32(int.MaxValue));
        Corner[] pool = players.Count == 2
            ? rng.Next(2) == 0 ? [Corner.NorthWest, Corner.SouthEast] : [Corner.NorthEast, Corner.SouthWest]
            : [Corner.NorthWest, Corner.NorthEast, Corner.SouthWest, Corner.SouthEast];
        rng.Shuffle(pool);
        return players.Select((p, i) => (p, i)).ToDictionary(x => x.p, x => pool[x.i]);
    }

    public GameRules Rules { get; }
    /// <summary>The shared map, with trails to the forest's places for routing (the public roads are the standard ones).</summary>
    public WorldMap Map { get; }
    /// <summary>The forest's places and what they hold. The truth: players learn of them only by finding them.</summary>
    public IReadOnlyList<ForestSite> ForestSites { get; }
    public MatchPhase Phase { get; private set; } = MatchPhase.Preparation;
    public double PrepSeconds { get; }
    public double WarSeconds { get; }
    public double ElapsedSeconds { get; private set; }
    /// <summary>Time left in the current phase.</summary>
    public double RemainingSeconds => Math.Max(0, PhaseEndsAt - ElapsedSeconds);
    public double WarElapsedSeconds => Math.Max(0, ElapsedSeconds - PrepSeconds);
    /// <summary>Late in the war food production drops (famine).</summary>
    public bool Famine => Phase == MatchPhase.War && WarElapsedSeconds + 1e-9 >= Rules.War.FamineStart * WarSeconds;
    public double FamineStartsIn => Math.Max(0, PrepSeconds + Rules.War.FamineStart * WarSeconds - ElapsedSeconds);
    public IReadOnlyCollection<string> PlayerKeys => _players.Keys;
    public MatchResult? Result { get; private set; }

    private double PhaseEndsAt => Phase == MatchPhase.Preparation ? PrepSeconds : PrepSeconds + WarSeconds + _extraWarSeconds;
    private double _extraWarSeconds;

    /// <summary>The war lasts at least <paramref name="seconds"/> more (the match is not cut short; the famine keeps its place in the planned war).</summary>
    public void EnsureWarRemaining(double seconds)
    {
        if (Phase == MatchPhase.War && RemainingSeconds < seconds) _extraWarSeconds += seconds - RemainingSeconds;
    }

    public Castle? CastleOf(string playerKey) => _players.GetValueOrDefault(playerKey)?.Castle;
    public Corner CornerOf(string playerKey) => _corners[playerKey];
    public IReadOnlyDictionary<string, Corner> Corners => _corners;

    /// <summary>The road from one player's gate to another's.</summary>
    public Route RouteBetween(string from, string to) => Map.RouteBetween(_corners[from], _corners[to]);

    /// <summary>How long an army needs from one castle to another (one way).</summary>
    public double MarchSeconds(string from, string to) => RouteBetween(from, to).Length / Rules.Map.ArmySpeed;

    /// <summary>How long a scout needs from one castle to another (one way).</summary>
    public double ScoutSeconds(string from, string to) => RouteBetween(from, to).Length / Rules.Map.ScoutSpeed;
    public bool IsEliminated(string playerKey) => _eliminated.ContainsKey(playerKey);
    public IReadOnlyDictionary<string, double> Eliminated => _eliminated;

    /// <summary>The player's end-of-match summary; null until the match has ended.</summary>
    public EconomySummary? SummaryOf(string playerKey) => _players.GetValueOrDefault(playerKey)?.Summary;

    public IReadOnlyList<EconomySample> SamplesOf(string playerKey) =>
        _players.GetValueOrDefault(playerKey)?.Samples ?? [];

    /// <summary>The player's scouts that are still out.</summary>
    public IReadOnlyList<ScoutMission> MissionsOf(string playerKey) => _missions.Where(m => m.From == playerKey).ToList();

    /// <summary>The latest delivered scout report per target, for this player only.</summary>
    public IReadOnlyList<ScoutReport> ReportsOf(string playerKey) =>
        _reports.Where(kv => kv.Key.From == playerKey).Select(kv => kv.Value).OrderBy(r => r.Target).ToList();

    /// <summary>The player's own armies (marching or returning). Nobody else's.</summary>
    public IReadOnlyList<ArmyMarch> ArmiesOf(string playerKey) => _armies.Where(a => a.From == playerKey).ToList();

    /// <summary>
    /// Armies coming at this player that their castle has seen: who sent them and when they arrive.
    /// (What they are made of the player sees on the map, through <see cref="SeenBy"/>.)
    /// </summary>
    public IReadOnlyList<(string From, double ArrivesAt)> IncomingWarningsOf(string playerKey) =>
        _armies.Where(a => a.Target == playerKey && a.State == ArmyState.Marching && a.Sighted && a.Battle is null && !a.Out.Arrived)
            .Select(a => (a.From, ArrivesAt: ElapsedSeconds + a.SecondsLeft))
            .OrderBy(a => a.ArrivesAt)
            .ToList();

    // ---- fog of war ---------------------------------------------------------------------------

    /// <summary>The castle's own sight: a circle round its gate.</summary>
    public VisionCircle CastleVisionOf(string playerKey) =>
        new(Map.RegionOf(_corners[playerKey]).Gate, Rules.Map.CastleVision);

    /// <summary>
    /// Everything this player sees right now: their castle, their armies and their scouts, each with
    /// its own radius. A fallen castle sees nothing (spectators get no extra vision).
    /// </summary>
    public IReadOnlyList<VisionCircle> VisionOf(string playerKey)
    {
        if (!_players.ContainsKey(playerKey) || _eliminated.ContainsKey(playerKey)) return [];
        var circles = new List<VisionCircle> { CastleVisionOf(playerKey) };
        circles.AddRange(_armies.Where(a => a.From == playerKey).Select(a => new VisionCircle(a.Position, Rules.Map.ArmyVision)));
        circles.AddRange(_missions.Where(m => m.From == playerKey && m.Kind != MissionKind.Envoy).Select(m => new VisionCircle(m.Position, Rules.Map.ScoutVision)));
        return circles;
    }

    /// <summary>
    /// Other players' armies and scouts inside this player's vision, and nothing else: whatever is
    /// outside it is not in the list at all. Never the player's own (they know those already).
    /// </summary>
    public IReadOnlyList<SeenMover> SeenBy(string playerKey)
    {
        var vision = VisionOf(playerKey);
        if (vision.Count == 0) return [];
        bool Visible(Vec p) => vision.Any(c => c.Contains(p)) || SeenThroughTrail(playerKey, p);
        var seen = new List<SeenMover>();
        foreach (var a in _armies.Where(a => a.From != playerKey && a.Battle is null && Visible(a.Position)))
            seen.Add(new SeenMover(a.PublicId, MoverKind.Army, a.From, a.Position, a.Velocity,
                a.Walking.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value)));
        foreach (var m in _missions.Where(m => m.From != playerKey && Visible(m.Position)))
            seen.Add(new SeenMover(m.PublicId, m.Kind == MissionKind.Envoy ? MoverKind.Envoy : MoverKind.Scout, m.Kind == MissionKind.Envoy ? "" : m.From,
                m.Position, m.Velocity, new Dictionary<UnitType, int>())); // an envoy shows who it belongs to to nobody
        return seen;
    }

    /// <summary>Battles being fought right now that this player is part of (a fallen castle keeps watching its own).</summary>
    public IReadOnlyList<ActiveBattle> ActiveBattlesOf(string playerKey) => _active.Where(b => b.Involves(playerKey)).ToList();

    /// <summary>
    /// Battles going on right now that this player can see: inside their vision, or their own. For
    /// anyone not in it, that a battle is there is all they learn (never who or how it goes).
    /// </summary>
    public IReadOnlyList<ActiveBattle> BattlesSeenBy(string playerKey)
    {
        var vision = VisionOf(playerKey);
        return _active.Where(b => b.Involves(playerKey) || vision.Any(c => c.Contains(b.Position)) || SeenThroughTrail(playerKey, b.Position)).ToList();
    }

    /// <summary>
    /// The ground this player's scouts walked over, still open to their sight. A fallen castle has none.
    /// Only the picture: <see cref="SeenBy"/> and <see cref="BattlesSeenBy"/> do the real fog.
    /// </summary>
    public IReadOnlyList<TrailCircle> TrailOf(string playerKey)
    {
        if (_eliminated.ContainsKey(playerKey)) return [];
        return _trail.Where(t => t.Owner == playerKey)
            .Select(t => new TrailCircle(t.Center, Rules.Map.ScoutVision,
                t.ExpiresAt is { } end ? Math.Clamp((end - ElapsedSeconds) / TrailFadeSeconds, 0, 1) : 1))
            .ToList();
    }

    /// <summary>
    /// True when <paramref name="p"/> is on ground this player's scouts walked over, and not inside another
    /// player's corner: what is inside a castle's region (buildings, workers, the courtyard, armies leaving)
    /// is learned from a report only, never by looking from the road.
    /// </summary>
    private bool SeenThroughTrail(string playerKey, Vec p)
    {
        if (!_trail.Any(t => t.Owner == playerKey && t.Center.DistanceTo(p) <= Rules.Map.ScoutVision + 1e-9)) return false;
        foreach (var (other, corner) in _corners)
        {
            if (other == playerKey) continue;
            var r = Map.RegionOf(corner);
            if (p.X >= r.Origin.X && p.X <= r.Origin.X + r.Width && p.Y >= r.Origin.Y && p.Y <= r.Origin.Y + r.Height) return false;
        }
        return true;
    }

    /// <summary>Every battle being fought right now.</summary>
    public IReadOnlyList<ActiveBattle> ActiveBattles => _active;

    /// <summary>Battles this player became part of since the last call; each is returned once.</summary>
    public IReadOnlyList<ActiveBattle> TakeStartedBattles(string playerKey) =>
        _startedBattles.Remove(playerKey, out var list) ? list : [];

    /// <summary>Battles that began since the last call, whoever fights them; each is returned once. Only the spectator feed uses this.</summary>
    public IReadOnlyList<ActiveBattle> TakeAllStartedBattles()
    {
        var list = _startedForSpectators.ToList();
        _startedForSpectators.Clear();
        return list;
    }

    /// <summary>
    /// Every army and scout on the map, wherever it is (armies that are fighting are left out: the battle
    /// replay draws them). Spectators only: no player ever gets this.
    /// </summary>
    public IReadOnlyList<SeenMover> AllMovers()
    {
        var all = new List<SeenMover>();
        foreach (var a in _armies.Where(a => a.Battle is null))
            all.Add(new SeenMover(a.PublicId, MoverKind.Army, a.From, a.Position, a.Velocity,
                a.Walking.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value)));
        foreach (var m in _missions)
            all.Add(new SeenMover(m.PublicId, m.Kind == MissionKind.Envoy ? MoverKind.Envoy : MoverKind.Scout, m.Kind == MissionKind.Envoy ? "" : m.From, m.Position, m.Velocity, new Dictionary<UnitType, int>()));
        return all;
    }

    /// <summary>Battles this player fought in (as attacker or defender), oldest first.</summary>
    public IReadOnlyList<BattleReport> BattlesOf(string playerKey) =>
        _battles.Where(b => b.Attacker == playerKey || b.Defender == playerKey).ToList();

    /// <summary>Notifications for this player since the last call; each is returned once.</summary>
    public IReadOnlyList<GameNotification> TakeNotifications(string playerKey) =>
        _notifications.Remove(playerKey, out var list) ? list : [];

    // ---- clock -------------------------------------------------------------------------------

    public void Tick(double dt)
    {
        if (Phase == MatchPhase.Ended) return;
        dt = Math.Min(dt, RemainingSeconds);
        double foodFactor = Famine ? Rules.War.FamineFoodMultiplier : 1;
        foreach (var (key, p) in _players)
        {
            if (_eliminated.ContainsKey(key)) continue; // a fallen castle's economy stops
            p.Castle.FoodFactor = foodFactor;
            p.Castle.Tick(dt);
        }
        ElapsedSeconds += dt;
        AdvanceScouts(dt);
        AdvanceArmies(dt);
        RefreshSight();
        if (Phase == MatchPhase.Ended) return; // the last castle standing ended it
        if (ElapsedSeconds + 1e-9 >= _nextSample) TakeSamples();
        if (RemainingSeconds <= 1e-9)
        {
            if (Phase == MatchPhase.Preparation)
            {
                Phase = MatchPhase.War;
                _trail.Clear(); // everybody starts the war in the same dark: the ground scouted in the preparation closes (scouts still out go on)
            }
            else
            {
                FinishAllBattles();
                if (Phase != MatchPhase.Ended) EndMatch(byElimination: false);
            }
        }
    }

    /// <summary>Applies a command from <paramref name="playerKey"/>; it can only change their own castle.</summary>
    public CommandResult Execute(string playerKey, GameCommand command)
    {
        if (Phase == MatchPhase.Ended) return CommandResult.Fail("Maç bitti.");
        if (!_players.TryGetValue(playerKey, out var player)) return CommandResult.Fail("Bu maçta böyle bir oyuncu yok.");
        if (_eliminated.ContainsKey(playerKey)) return CommandResult.Fail("Kalen düştü; artık izleyicisin.");
        return command switch
        {
            SendScout scout => LaunchScout(playerKey, player, scout),
            SendExplore explore => LaunchExplore(playerKey, player, explore),
            SendChestScout chest => LaunchChestScout(playerKey, player, chest),
            SendEnvoy envoy => LaunchEnvoy(playerKey, player, envoy),
            SendArmyToSite raid => LaunchRaid(playerKey, player, raid),
            SendArmy army => LaunchArmy(playerKey, player, army),
            RecallArmy recall => Recall(playerKey, recall.ArmyId),
            RedirectArmy redirect => Redirect(playerKey, redirect),
            _ => player.Castle.Execute(command),
        };
    }

    // ---- scouting ----------------------------------------------------------------------------

    /// <summary>The last stretch of the preparation (scouting.noScoutLastPrepSeconds): nobody can send a scout until the war begins.</summary>
    public bool ScoutingLocked =>
        Phase == MatchPhase.Preparation && Rules.Scouting.NoScoutLastPrepSeconds > 0 && PrepSeconds - ElapsedSeconds <= Rules.Scouting.NoScoutLastPrepSeconds + 1e-9;

    /// <summary>One scout at a time (scouting.maxScouts): a new one cannot leave until the one out is home again.</summary>
    private CommandResult ScoutsAvailable(string from, bool envoy = false)
    {
        if (ScoutingLocked && !envoy) return CommandResult.Fail($"Hazırlığın son {Rules.Scouting.NoScoutLastPrepSeconds:0} saniyesinde gözcü gönderilemez; savaş başlayınca gönderilebilir.");
        var away = _missions.Where(m => m.From == from).ToList();
        if (away.Count < Rules.Scouting.MaxScouts) return CommandResult.Success;
        return CommandResult.Fail($"Gözcün henüz dönmedi (yaklaşık {Math.Ceiling(away.Min(m => m.SecondsLeft))} sn).");
    }

    private CommandResult LaunchScout(string from, PlayerEconomy player, SendScout c)
    {
        if (c.TargetKey == from) return CommandResult.Fail("Kendi kaleni gözetleyemezsin.");
        if (!_players.ContainsKey(c.TargetKey)) return CommandResult.Fail("Böyle bir rakip yok.");
        if (_eliminated.ContainsKey(c.TargetKey)) return CommandResult.Fail("Bu oyuncu elendi.");
        if (_missions.Any(m => m.From == from && m.Kind == MissionKind.Spy && m.Target == c.TargetKey))
            return CommandResult.Fail("Bu rakibe zaten bir gözcün gidiyor.");
        if (ScoutsAvailable(from) is { Ok: false } busy) return busy;
        var sent = player.Castle.SendScout(c.From);
        if (!sent.Ok) return sent;
        _missions.Add(new ScoutMission(NewPublicId(), from, c.TargetKey, ElapsedSeconds, RouteBetween(from, c.TargetKey), Rules.Map.ScoutSpeed));
        return CommandResult.Success;
    }

    private CommandResult LaunchChestScout(string from, PlayerEconomy player, SendChestScout c)
    {
        if (!_sites.TryGetValue(c.SiteId, out var site) || !Knows(from, c.SiteId)) return CommandResult.Fail("Böyle bir sandık bilmiyorsun.");
        if (site.Site.Kind != SiteKind.Chest) return CommandResult.Fail("Bu bir sandık değil.");
        if (_knowledge[from][c.SiteId].Gone) return CommandResult.Fail("Bu sandık boşalmış görünüyor.");
        string target = $"site:{c.SiteId}";
        if (_missions.Any(m => m.From == from && m.Target == target)) return CommandResult.Fail("Bu sandığa zaten bir gözcün gidiyor.");
        if (ScoutsAvailable(from) is { Ok: false } busy) return busy;
        var sent = player.Castle.SendScout(c.From);
        if (!sent.Ok) return sent;
        _missions.Add(new ScoutMission(NewPublicId(), from, target, ElapsedSeconds, Map.RouteToSite(_corners[from], site.Site),
            Rules.Map.ScoutSpeed, MissionKind.Chest) { Site = site });
        return CommandResult.Success;
    }

    private CommandResult LaunchEnvoy(string from, PlayerEconomy player, SendEnvoy c)
    {
        if (c.TargetKey == from) return CommandResult.Fail("Kendine ulak gönderemezsin.");
        if (!_players.ContainsKey(c.TargetKey)) return CommandResult.Fail("Böyle bir rakip yok.");
        if (_eliminated.ContainsKey(c.TargetKey)) return CommandResult.Fail("Bu oyuncu elendi.");
        if (c.Food < 0 || c.Wood < 0 || c.Iron < 0 || c.Gold < 0) return CommandResult.Fail("Yük negatif olamaz.");
        long total = (long)c.Food + c.Wood + c.Iron + c.Gold;
        if (total > Rules.Envoy.MaxCargo) return CommandResult.Fail($"Ulak en fazla {Rules.Envoy.MaxCargo} yük taşır.");
        var message = EnvoyMessage.Check(c.Message, Rules.Envoy);
        if (!message.Ok) return CommandResult.Fail(message.Error!);
        if (total == 0 && message.Text is null) return CommandResult.Fail("Ulağın taşıyacak bir şeyi yok: yük ya da mesaj ekle.");
        if (ScoutsAvailable(from, envoy: true) is { Ok: false } busy) return busy;
        var castle = player.Castle;
        if (castle.Food + 1e-9 < c.Food || castle.Wood + 1e-9 < c.Wood || castle.Iron + 1e-9 < c.Iron || castle.Gold + 1e-9 < c.Gold)
            return CommandResult.Fail("Kasada bu kadar yok.");
        var sent = castle.SendScout(c.From);
        if (!sent.Ok) return sent;
        castle.TrySpendCargo(c.Food, c.Wood, c.Iron, c.Gold);
        _missions.Add(new ScoutMission(NewPublicId(), from, c.TargetKey, ElapsedSeconds, RouteBetween(from, c.TargetKey), Rules.Map.ScoutSpeed, MissionKind.Envoy)
        {
            GiftFood = c.Food, GiftWood = c.Wood, GiftIron = c.Iron, GiftGold = c.Gold, Message = message.Text,
        });
        return CommandResult.Success;
    }

    /// <summary>What envoys left at this castle (newest last). Only its owner is ever shown it.</summary>
    public IReadOnlyList<Letter> LettersOf(string playerKey) => _letters.TryGetValue(playerKey, out var l) ? l : [];

    /// <summary>The envoy reached the gate: the goods go into the receiver's stores and the message is filed; both are told.</summary>
    private void DeliverEnvoy(ScoutMission m)
    {
        if (_eliminated.ContainsKey(m.Target)) { m.Refund = true; return; } // the receiver fell on the way: the goods go home again
        var castle = _players[m.Target].Castle;
        castle.AddGoods(m.GiftFood, m.GiftWood, m.GiftIron);
        castle.AddGold(m.GiftGold);
        if (!_letters.TryGetValue(m.Target, out var list)) _letters[m.Target] = list = [];
        list.Add(new Letter(_nextLetter++, m.From, ElapsedSeconds, m.GiftFood, m.GiftWood, m.GiftIron, m.GiftGold, m.Message));
        if (list.Count > MaxLetters) list.RemoveAt(0);
        Notify(m.Target, new GameNotification(NotificationKind.EnvoyArrived, m.From, ElapsedSeconds));
        Notify(m.From, new GameNotification(NotificationKind.EnvoyDelivered, m.Target, ElapsedSeconds));
    }

    private bool Knows(string player, string siteId) => _knowledge.TryGetValue(player, out var k) && k.ContainsKey(siteId);

    private CommandResult LaunchExplore(string from, PlayerEconomy player, SendExplore c)
    {
        string target = $"quarter:{c.Quarter}";
        if (_missions.Any(m => m.From == from && m.Target == target)) return CommandResult.Fail("Bu bölgeye zaten bir gözcün gidiyor.");
        if (ScoutsAvailable(from) is { Ok: false } busy) return busy;
        var sent = player.Castle.SendScout(c.From);
        if (!sent.Ok) return sent;
        _missions.Add(new ScoutMission(NewPublicId(), from, target, ElapsedSeconds, Map.ExploreRoute(_corners[from], c.Quarter),
            Rules.Map.ScoutSpeed, MissionKind.Explore, c.Quarter));
        return CommandResult.Success;
    }

    /// <summary>Scouts walk to the target's gate, look, and walk home with the report; explorers walk their tour.</summary>
    private void AdvanceScouts(double dt)
    {
        _trail.RemoveAll(t => t.ExpiresAt is { } end && end <= ElapsedSeconds);
        foreach (var m in _missions.ToList())
        {
            if (m.Kind == MissionKind.Chest)
            {
                if (m.Back is null)
                {
                    m.Out.Advance(dt);
                    LayTrail(m);
                    if (!m.Out.Arrived) continue;
                    // At the chest: whoever gets there first takes it; a scout who finds it gone walks home empty-handed.
                    if (!m.Site!.Gone)
                    {
                        m.Site.Gone = true;
                        m.Site.Version++;
                        m.LootGold = m.Site.Site.Gold;
                        m.LootIron = m.Site.Site.Iron;
                    }
                    m.Back = new Traveller(m.Out.Route.Reversed(), m.Out.Speed);
                    continue;
                }
                m.Back.Advance(dt);
                LayTrail(m);
                if (!m.Back.Arrived) continue;
                _players[m.From].Castle.AddGold(m.LootGold);
                _players[m.From].Castle.AddGoods(0, 0, m.LootIron);
                _players[m.From].Castle.ReturnScout();
                _missions.Remove(m);
                continue;
            }
            if (m.Kind == MissionKind.Explore)
            {
                m.Out.Advance(dt);
                LayTrail(m);
                // Everything of the quarter (and the big camp in the middle) within reach of the scout is found.
                foreach (var site in ForestSites)
                    if ((site.Quadrant == m.Quarter || site.Kind == SiteKind.BigCamp)
                        && site.Position.DistanceTo(m.Position) <= Rules.Forest.DiscoverRadius + 1e-9)
                        Discover(m.From, site);
                if (!m.Out.Arrived) continue;
                if (!_explored.TryGetValue(m.From, out var done)) _explored[m.From] = done = [];
                done.Add(m.Quarter!.Value);
                _players[m.From].Castle.ReturnScout();
                _missions.Remove(m);
                continue;
            }
            if (m.Kind == MissionKind.Envoy)
            {
                // Gathers nothing: no trail, no report. At the gate it leaves its load and walks home.
                if (m.Back is null)
                {
                    m.Out.Advance(dt);
                    if (!m.Out.Arrived) continue;
                    DeliverEnvoy(m);
                    m.Back = new Traveller(m.Out.Route.Reversed(), m.Out.Speed);
                    continue;
                }
                m.Back.Advance(dt);
                if (!m.Back.Arrived) continue;
                if (m.Refund)
                {
                    _players[m.From].Castle.AddGoods(m.GiftFood, m.GiftWood, m.GiftIron);
                    _players[m.From].Castle.AddGold(m.GiftGold);
                }
                _players[m.From].Castle.ReturnScout();
                _missions.Remove(m);
                continue;
            }
            if (!m.Arrived)
            {
                m.Out.Advance(dt);
                LayTrail(m);
                if (!m.Out.Arrived) continue;
                m.Report = Observe(m.Target, ElapsedSeconds);
                Notify(m.Target, new GameNotification(NotificationKind.ScoutedBy, m.From, ElapsedSeconds));
                m.Back = new Traveller(m.Out.Route.Reversed(), m.Out.Speed);
                continue;
            }
            m.Back!.Advance(dt);
            LayTrail(m);
            if (!m.Back.Arrived) continue;
            _reports[(m.From, m.Target)] = m.Report! with { DeliveredAt = ElapsedSeconds };
            _players[m.From].Castle.ReturnScout();
            _missions.Remove(m);
        }
    }

    // ---- the forest: what each player has found ---------------------------------------------------

    /// <summary>The player finds a place: from now on they know it is there, and how it looks.</summary>
    private void Discover(string player, ForestSite site)
    {
        if (!_knowledge.TryGetValue(player, out var known)) _knowledge[player] = known = [];
        if (known.ContainsKey(site.Id)) return;
        var state = _sites[site.Id];
        known[site.Id] = new SiteKnowledge
        {
            DiscoveredAt = ElapsedSeconds, SeenAt = ElapsedSeconds, SeenVersion = state.Version, Gone = state.Gone, Bandits = ApproximateBandits(state),
        };
    }

    /// <summary>How many bandits a visitor makes out: off by up to the scouts' margin, never none when there are some.</summary>
    private IReadOnlyDictionary<UnitType, int> ApproximateBandits(SiteState state)
    {
        double error = Rules.Scouting.ReportError;
        return state.Bandits.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv =>
        {
            double spread = Math.Max(kv.Value * error, 1);
            return Math.Max(1, (int)Math.Round(kv.Value + (_rng.NextDouble() * 2 - 1) * spread, MidpointRounding.AwayFromZero));
        });
    }

    /// <summary>
    /// A place a player already knows is brought up to date whenever it is in their sight again (their castle, armies,
    /// scouts and the ground their scouts walked over). Out of sight it keeps looking as it did when they last saw it.
    /// </summary>
    private void RefreshSight()
    {
        foreach (var (player, known) in _knowledge)
        {
            if (_eliminated.ContainsKey(player) || known.Count == 0) continue;
            var circles = VisionOf(player).Concat(TrailOf(player).Select(t => new VisionCircle(t.Center, t.Radius))).ToList();
            foreach (var (id, k) in known)
            {
                var state = _sites[id];
                if (!circles.Any(c => c.Contains(state.Site.Position))) continue;
                k.SeenAt = ElapsedSeconds;
                if (k.SeenVersion == state.Version) continue;
                k.SeenVersion = state.Version;
                k.Gone = state.Gone;
                k.Bandits = ApproximateBandits(state);
            }
        }
    }

    /// <summary>The places this player has found, as they last saw them. Nobody else's.</summary>
    public IReadOnlyList<KnownSite> KnownSitesOf(string playerKey) =>
        _knowledge.TryGetValue(playerKey, out var known)
            ? known.Select(kv => new KnownSite(_sites[kv.Key].Site, kv.Value.DiscoveredAt, kv.Value.SeenAt, kv.Value.Gone, kv.Value.Bandits)).ToList()
            : [];

    /// <summary>How long a scout of this player needs for a tour of a quarter of the forest (there and back home).</summary>
    public double ExploreSeconds(string playerKey, Corner quarter) => Map.ExploreRoute(_corners[playerKey], quarter).Length / Rules.Map.ScoutSpeed;

    /// <summary>Whether one of the player's scouts is out touring this quarter right now.</summary>
    public bool IsExploring(string playerKey, Corner quarter) =>
        _missions.Any(m => m.From == playerKey && m.Kind == MissionKind.Explore && m.Quarter == quarter);

    /// <summary>The quarters of the forest this player's scouts have toured.</summary>
    public IReadOnlyCollection<Corner> ExploredBy(string playerKey) => _explored.TryGetValue(playerKey, out var s) ? s : [];

    /// <summary>The true state of every place (the match's own view: never sent to a player who is still playing).</summary>
    public IReadOnlyList<SiteState> AllSites => _sites.Values.ToList();

    /// <summary>A scout leaves open ground behind it: a point every few tiles, each seen from for as long as the trail lasts.</summary>
    private void LayTrail(ScoutMission m)
    {
        var spacing = Math.Max(1, Rules.Map.ScoutVision / 4);
        var at = m.Position;
        if (m.LastTrail is { } last && last.DistanceTo(at) < spacing && !m.Leg.Arrived) return;
        m.LastTrail = at;
        double? end = Rules.Map.ScoutTrailSeconds > 0 ? ElapsedSeconds + Rules.Map.ScoutTrailSeconds : null;
        _trail.Add(new TrailPoint(m.From, at, end));
    }

    /// <summary>
    /// What a scout sees: every soldier type with its count off by up to ±max(ReportError × count, 1),
    /// rounded. The type is always right: 0 when there are none, at least 1 when there are any.
    /// Building levels are exact. Nothing else.
    /// </summary>
    private ScoutReport Observe(string target, double now)
    {
        var castle = _players[target].Castle;
        double error = Rules.Scouting.ReportError;
        var soldiers = Rules.Units.Select(u =>
        {
            int real = castle.Soldiers[u];
            double spread = Math.Max(real * error, 1);
            int seen = real == 0 ? 0
                : Math.Max(1, (int)Math.Round(real + (_rng.NextDouble() * 2 - 1) * spread, MidpointRounding.AwayFromZero));
            return new ScoutedUnit(u.Id, u.Name, seen);
        }).ToList();
        var levels = Jobs.Buildings.ToDictionary(b => b, b => castle.Building(b).Level);
        return new ScoutReport(target, now, now, soldiers, levels);
    }

    // ---- war ---------------------------------------------------------------------------------

    private CommandResult LaunchArmy(string from, PlayerEconomy player, SendArmy c)
    {
        if (Phase != MatchPhase.War) return CommandResult.Fail("Saldırı sadece savaş fazında yapılabilir.");
        if (c.TargetKey == from) return CommandResult.Fail("Kendi kalene saldıramazsın.");
        if (!_players.ContainsKey(c.TargetKey)) return CommandResult.Fail("Böyle bir rakip yok.");
        if (_eliminated.ContainsKey(c.TargetKey)) return CommandResult.Fail("Bu oyuncu elendi.");

        var parsed = ParseArmy(c.Units, c.Rows, c.ArcherPriority, out var units, out var rows, out var priority);
        if (!parsed.Ok) return parsed;

        var sent = player.Castle.DispatchArmy(units);
        if (!sent.Ok) return sent;
        _armies.Add(new ArmyMarch(_nextId++, NewPublicId(), from, c.TargetKey, units, rows, priority, ElapsedSeconds,
            RouteBetween(from, c.TargetKey), Rules.Map.ArmySpeed, c.Mode));
        return CommandResult.Success;
    }

    private CommandResult ParseArmy(IReadOnlyDictionary<string, int> unitIds, IReadOnlyDictionary<string, Row>? rowIds, string? archerPriority,
        out Dictionary<UnitType, int> units, out Dictionary<UnitType, Row> rows, out UnitType? priority)
    {
        units = [];
        rows = [];
        priority = null;
        foreach (var (id, n) in unitIds)
        {
            if (Rules.FindUnit(id) is not { } type) return CommandResult.Fail($"Bilinmeyen birlik \"{id}\".");
            if (n > 0) units[type] = units.GetValueOrDefault(type) + n;
        }
        foreach (var (id, row) in rowIds ?? new Dictionary<string, Row>())
        {
            if (Rules.FindUnit(id) is not { } type) return CommandResult.Fail($"Bilinmeyen birlik \"{id}\".");
            rows[type] = row;
        }
        if (!string.IsNullOrEmpty(archerPriority) && (priority = Rules.FindUnit(archerPriority)) is null)
            return CommandResult.Fail($"Bilinmeyen birlik \"{archerPriority}\".");
        return CommandResult.Success;
    }

    /// <summary>Can this player send <paramref name="soldiers"/> soldiers to that place (known to them, not a chest, not used up, enough for a village)?</summary>
    private CommandResult CheckRaid(string from, string siteId, int soldiers)
    {
        if (!_sites.TryGetValue(siteId, out var state) || !Knows(from, siteId)) return CommandResult.Fail("Böyle bir yer bilmiyorsun.");
        var known = _knowledge[from][siteId];
        if (state.Site.Kind == SiteKind.Chest) return CommandResult.Fail("Sandık için gözcü gönderilir, ordu değil.");
        if (known.Gone) return CommandResult.Fail(state.Site.Kind == SiteKind.Village ? "Bu köy yağmalanmış görünüyor." : "Bu kamp temizlenmiş görünüyor.");
        if (state.Site.Kind == SiteKind.Village && soldiers < Rules.Forest.Village.MinSoldiers)
            return CommandResult.Fail($"Köyü yağmalamak için en az {Rules.Forest.Village.MinSoldiers} asker gerekir.");
        return CommandResult.Success;
    }

    /// <summary>An army to a place in the forest the player has found (any phase: the forest is not the war).</summary>
    private CommandResult LaunchRaid(string from, PlayerEconomy player, SendArmyToSite c)
    {
        var parsed = ParseArmy(c.Units, c.Rows, c.ArcherPriority, out var units, out var rows, out var priority);
        if (!parsed.Ok) return parsed;
        if (CheckRaid(from, c.SiteId, units.Values.Sum()) is { Ok: false } bad) return bad;
        var state = _sites[c.SiteId];

        var sent = player.Castle.DispatchArmy(units);
        if (!sent.Ok) return sent;
        _armies.Add(new ArmyMarch(_nextId++, NewPublicId(), from, $"site:{c.SiteId}", units, rows, priority, ElapsedSeconds,
            Map.RouteToSite(_corners[from], state.Site), Rules.Map.ArmySpeed) { Site = state });
        return CommandResult.Success;
    }

    /// <summary>A new order for an army on the road: another castle (war only) or a place in the forest, by the roads from where it is.</summary>
    private CommandResult Redirect(string from, RedirectArmy c)
    {
        var a = _armies.FirstOrDefault(x => x.Id == c.ArmyId && x.From == from);
        if (a is null) return CommandResult.Fail("Böyle bir ordun yok.");
        if (a.Battle is not null) return CommandResult.Fail("Savaştaki ordu yeni emir alamaz.");
        int soldiers = a.Walking.Values.Sum();
        string target, node;
        SiteState? site = null;
        if (c.SiteId is { } siteId)
        {
            if (CheckRaid(from, siteId, soldiers) is { Ok: false } bad) return bad;
            site = _sites[siteId];
            target = $"site:{siteId}";
            node = WorldMap.SiteNode(site.Site);
        }
        else if (c.TargetKey is { } key)
        {
            if (Phase != MatchPhase.War) return CommandResult.Fail("Saldırı sadece savaş fazında yapılabilir.");
            if (key == from) return CommandResult.Fail("Kendi kalene saldıramazsın.");
            if (!_players.ContainsKey(key)) return CommandResult.Fail("Böyle bir rakip yok.");
            if (_eliminated.ContainsKey(key)) return CommandResult.Fail("Bu oyuncu elendi.");
            target = key;
            node = WorldMap.GateNode(_corners[key]);
        }
        else return CommandResult.Fail("Yeni bir hedef seçmedin.");
        if (a.State == ArmyState.Marching && a.Target == target) return CommandResult.Fail("Ordu zaten oraya gidiyor.");

        a.Redirect(target, site, Map.RouteFrom(a.Leg.Route, a.Leg.Travelled, node));
        return CommandResult.Success;
    }

    private CommandResult Recall(string player, int armyId)
    {
        var a = _armies.FirstOrDefault(x => x.Id == armyId && x.From == player);
        if (a is null) return CommandResult.Fail("Böyle bir ordun yok.");
        if (a.Battle is not null) return CommandResult.Fail("Savaştaki ordu geri çağrılamaz.");
        if (a.State == ArmyState.Returning) return CommandResult.Fail("Bu ordu zaten eve dönüyor.");
        TurnBack(a);
        return CommandResult.Success;
    }

    /// <summary>The army turns round where it is and walks home along the same road.</summary>
    private void TurnBack(ArmyMarch a)
    {
        a.State = ArmyState.Returning;
        a.Survivors = a.Units;
        a.Back = new Traveller(a.Out.Route.Reversed(), a.Out.Speed, a.Out.Route.Length - a.Out.Travelled);
    }

    private void AdvanceArmies(double dt)
    {
        // Battles that are over: losses, damage and reports land now, and the survivors move on.
        foreach (var b in _active.Where(b => ElapsedSeconds + 1e-9 >= b.EndsAt).OrderBy(b => b.EndsAt).ThenBy(b => b.Id).ToList())
        {
            if (Phase == MatchPhase.Ended) return;
            FinishBattle(b);
        }

        MoveAndMeet(dt);

        // The sentry: the target is warned the moment an army coming for it is in sight of the castle.
        foreach (var a in _armies.Where(a => a.State == ArmyState.Marching && !a.Sighted && a.Site is null && !_eliminated.ContainsKey(a.Target)))
        {
            if (!CastleVisionOf(a.Target).Contains(a.Position)) continue;
            a.Sighted = true;
            Notify(a.Target, new GameNotification(NotificationKind.ArmyIncoming, a.From, ElapsedSeconds, ElapsedSeconds + a.SecondsLeft));
        }

        // Armies at their target's gate lay siege one at a time per castle, earliest sent first; the rest wait.
        foreach (var a in _armies.Where(a => a.State == ArmyState.Marching && a.Battle is null && a.Out.Arrived).OrderBy(a => a.Id).ToList())
        {
            if (Phase == MatchPhase.Ended) return;
            if (a.Site is not null) { ArriveAtSite(a); continue; }
            if (_eliminated.ContainsKey(a.Target)) { SendHome(a, a.Units); continue; } // nothing left to attack
            if (_active.Any(b => b.Kind == BattleKind.Siege && b.Defender == a.Target)) continue;
            StartSiege(a);
        }

        foreach (var a in _armies.Where(a => a.State == ArmyState.Returning && a.Back!.Arrived).ToList())
        {
            var castle = _players[a.From].Castle;
            castle.ArmyReturned(a.Survivors);
            castle.AddGold(a.LootGold);
            castle.AddPeople(a.LootPeople);
            castle.AddGoods(a.LootFood, a.LootWood, a.LootIron);
            if (a.FallLoot is { } fl && fl.Describe() is { Length: > 0 } text)
                Notify(a.From, new GameNotification(NotificationKind.LootHome, a.Target, ElapsedSeconds, Detail: text));
            foreach (var (id, n) in a.LootWeapons) castle.AddWeapons(Rules.FindUnit(id)!, n);
            _armies.Remove(a);
        }
    }

    /// <summary>The army is at a place in the forest. A village is plundered without a fight (once: it is gone after); the loot goes home with the army.</summary>
    private void ArriveAtSite(ArmyMarch a)
    {
        var site = a.Site!;
        if (site.Site.Kind is SiteKind.Camp or SiteKind.BigCamp)
        {
            if (site.Gone) { SendHome(a, a.Units); return; } // somebody has cleared it already
            if (_active.Any(b => b.Kind == BattleKind.Camp && b.Defender == a.Target)) return; // one fight at a camp at a time; the rest wait
            StartCampBattle(a, site);
            return;
        }
        // Soldiers lost on the road count: an army that arrives with fewer than the minimum cannot plunder, whatever it set out with.
        if (site.Site.Kind == SiteKind.Village && !site.Gone && a.Units.Values.Sum() >= Rules.Forest.Village.MinSoldiers)
        {
            site.Gone = true;
            site.Version++;
            a.LootGold += site.Site.Gold;
            a.LootPeople += site.Site.People;
            a.LootFood += site.Site.Food;
        }
        SendHome(a, a.Units);
    }

    /// <summary>Sub-steps per game second for walking and meeting.</summary>
    private const int SubSteps = 10;

    /// <summary>
    /// Armies walk in small steps (a tenth of a second each, a fraction of a tile), so two armies coming
    /// at each other always meet, even at ×20 speed where a tick is many seconds of walking. Armies of
    /// different players that come within the encounter radius stop and fight right there. An army that
    /// would walk into a battle already going on waits just outside it. Intercepting armies turn back
    /// half way if nobody came.
    /// </summary>
    private void MoveAndMeet(double dt)
    {
        int steps = Math.Max(1, (int)Math.Ceiling(dt * SubSteps - 1e-9));
        double step = dt / steps, radius = Rules.War.EncounterRadius;
        for (int i = 0; i < steps; i++)
        {
            foreach (var a in _armies.Where(a => a.Battle is null && !a.Leg.Arrived))
            {
                var next = a.Leg.Route.PointAt(a.Leg.Travelled + a.Leg.Speed * step);
                if (_active.Any(b => b.Kind == BattleKind.Field && b.Position.DistanceTo(next) < radius * 1.5)) continue;
                a.Leg.Advance(step);
                if (a.Mode == ArmyMode.Intercept && a.State == ArmyState.Marching && a.Out.Travelled >= a.Out.Route.Length / 2)
                    TurnBack(a);
            }

            // Armies meet on the road only in the war (in preparation they walk through each other: only the forest's raids go out then).
            var free = Phase == MatchPhase.War ? _armies.Where(a => a.Battle is null).OrderBy(a => a.Id).ToList() : [];
            for (int x = 0; x < free.Count; x++)
                for (int y = x + 1; y < free.Count; y++)
                {
                    var a = free[x];
                    var b = free[y];
                    if (a.Battle is not null || b.Battle is not null || a.From == b.From) continue;
                    if (a.Position.DistanceTo(b.Position) > radius + 1e-9) continue;
                    StartFieldBattle(a, b);
                }
        }
    }

    /// <summary>The army fights the bandits of a camp (whoever is left of them), in full view like any battle.</summary>
    private void StartCampBattle(ArmyMarch a, SiteState camp)
    {
        var bandits = camp.Bandits.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value);
        var battle = new ActiveBattle(_nextId++, NewPublicId(), BattleKind.Camp, camp.Site.Position, a.Out.Direction, ElapsedSeconds, a, null, a.Target);
        var setup = new ArmySetup("Haydutlar") { Targeting = TargetPriority.Front };
        foreach (var (type, n) in bandits) setup.Add(type, n);
        Fight(battle, setup, bandits);
        Begin(battle);
    }

    /// <summary>Two armies met on the road: they fight where they are.</summary>
    private void StartFieldBattle(ArmyMarch a, ArmyMarch b)
    {
        var mid = (a.Position + b.Position) * 0.5;
        var toward = b.Position - a.Position;
        var facing = toward.Length > 1e-9 ? toward * (1 / toward.Length) : a.Leg.Direction;
        var battle = new ActiveBattle(_nextId++, NewPublicId(), BattleKind.Field, mid, facing, ElapsedSeconds, a, b, b.From);

        var setup = new ArmySetup("Karşı taraf") { Targeting = b.ArcherPriority is { } p ? TargetPriority.Prefer(p) : TargetPriority.Front };
        foreach (var (type, n) in b.Walking) if (n > 0) setup.Add(type, n);
        foreach (var (type, row) in b.Rows) setup.PlaceIn(type, row);
        Fight(battle, setup, b.Walking);
        Begin(battle);
    }

    /// <summary>After a battle on the road: the survivors go on their way (an interceptor heads home).</summary>
    private void GoOn(ArmyMarch a, IReadOnlyDictionary<UnitType, int> survivors)
    {
        if (survivors.Values.Sum() == 0)
        {
            _armies.Remove(a); // its losses are already counted
            return;
        }
        if (a.State == ArmyState.Returning)
        {
            a.Survivors = survivors;
            if (_eliminated.ContainsKey(a.From)) Disband(a);
            return;
        }
        a.Units = survivors;
        if (a.Mode == ArmyMode.Intercept) TurnBack(a);
    }

    private void Disband(ArmyMarch a)
    {
        _players[a.From].Castle.ArmyLost(a.State == ArmyState.Returning ? a.Survivors : a.Walking);
        _armies.Remove(a);
    }

    /// <summary>
    /// The army fights whoever is at home in the target castle right now; they come down to the gate
    /// and are held there until it is over. If the army wins, its survivors then hammer the gate.
    /// </summary>
    private void StartSiege(ArmyMarch a)
    {
        var castle = _players[a.Target].Castle;
        var defenders = castle.Soldiers.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value);
        castle.CommitDefenders(defenders);
        var battle = new ActiveBattle(_nextId++, NewPublicId(), BattleKind.Siege, Map.RegionOf(_corners[a.Target]).Gate,
            a.Out.Direction, ElapsedSeconds, a, null, a.Target);

        var defendSetup = new ArmySetup("Savunan") { Targeting = castle.DefensePriority is { } d ? TargetPriority.Prefer(d) : TargetPriority.Front };
        foreach (var (type, n) in defenders) defendSetup.Add(type, n);
        foreach (var (type, row) in castle.DefenseRows) defendSetup.PlaceIn(type, row);
        Fight(battle, defendSetup, defenders);

        if (battle.Winner == BattleWinner.Attacker)
        {
            // A wall cannot lose more than it has left (keeps damage stats honest).
            battle.CastleDamage = Math.Min(SiegeDamage(battle.AttackerSurvivors), castle.WallHp);
            battle.SiegeSeconds = Rules.War.SiegeSeconds;
        }
        Begin(battle);
    }

    /// <summary>Simulates the battle between its attacking army (side A) and <paramref name="sideB"/>, with a record to replay.</summary>
    private void Fight(ActiveBattle battle, ArmySetup sideB, IReadOnlyDictionary<UnitType, int> sideBUnits)
    {
        var a = battle.Attacker;
        var setup = new ArmySetup("Saldıran") { Targeting = a.ArcherPriority is { } p ? TargetPriority.Prefer(p) : TargetPriority.Front };
        foreach (var (type, n) in a.Walking) if (n > 0) setup.Add(type, n);
        foreach (var (type, row) in a.Rows) setup.PlaceIn(type, row);

        var result = _simulator.Simulate(setup, sideB, _rng, recordBattle: true);
        battle.AttackerUnits = a.Walking.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value);
        battle.DefenderUnits = sideBUnits.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value);
        battle.AttackerSurvivors = result.SideA.ByType.Where(t => t.Survivors > 0).ToDictionary(t => t.Type, t => t.Survivors);
        battle.DefenderSurvivors = result.SideB.ByType.Where(t => t.Survivors > 0).ToDictionary(t => t.Type, t => t.Survivors);
        battle.Winner = sideB.TotalCount == 0 ? BattleWinner.Attacker // an empty castle does not fight back
            : result.Outcome switch
            {
                BattleOutcome.SideAWins => BattleWinner.Attacker,
                BattleOutcome.SideBWins => BattleWinner.Defender,
                _ => BattleWinner.Draw,
            };
        battle.Record = result.Record!;
        battle.FightSeconds = result.DurationSeconds / Rules.War.BattlePlayback;
    }

    private void Begin(ActiveBattle battle)
    {
        battle.Attacker.Battle = battle;
        if (battle.Opponent is { } o) o.Battle = battle;
        _active.Add(battle);
        _startedForSpectators.Add(battle);
        foreach (var p in new[] { battle.Attacker.From, battle.Defender }.Distinct().Where(_players.ContainsKey))
        {
            if (!_startedBattles.TryGetValue(p, out var list)) _startedBattles[p] = list = [];
            list.Add(battle);
        }
    }

    /// <summary>The battle is over: losses, castle damage, the report and (maybe) a fallen castle.</summary>
    private void FinishBattle(ActiveBattle b)
    {
        if (b.Kind == BattleKind.Camp) { FinishCampBattle(b); return; }
        _active.Remove(b);
        var a = b.Attacker;
        a.Battle = null;
        var attacker = _players[a.From].Castle;
        var defender = _players[b.Defender].Castle;
        var attackLost = Lost(b.AttackerUnits, b.AttackerSurvivors);
        var defendLost = Lost(b.DefenderUnits, b.DefenderSurvivors);
        attacker.ArmyLost(attackLost);
        attacker.Stats.EnemiesKilled += defendLost.Values.Sum();
        defender.Stats.EnemiesKilled += attackLost.Values.Sum();

        bool fell = false;
        if (b.Opponent is { } o)
        {
            o.Battle = null;
            defender.ArmyLost(defendLost);
        }
        if (b.Kind == BattleKind.Siege)
        {
            defender.DefendersBack(b.DefenderSurvivors, defendLost);
            if (b.CastleDamage > 0)
            {
                defender.TakeWallDamage(b.CastleDamage);
                attacker.Stats.CastleDamageDealt += b.CastleDamage;
            }
            fell = b.Winner == BattleWinner.Attacker && defender.WallHp <= 1e-9;
        }

        var loot = fell ? PlunderFallen(a, defender) : null;
        var report = new BattleReport(b.Id, ElapsedSeconds, a.From, b.Defender,
            Lines(b.AttackerUnits, attackLost), Lines(b.DefenderUnits, defendLost), b.Winner, b.CastleDamage,
            defender.WallHp, defender.MaxWallHp, fell, b.Kind, loot);
        _battles.Add(report);
        Notify(a.From, new GameNotification(NotificationKind.BattleFought, b.Defender, ElapsedSeconds, BattleId: report.Id));
        Notify(b.Defender, new GameNotification(NotificationKind.BattleFought, a.From, ElapsedSeconds, BattleId: report.Id));

        if (b.Kind == BattleKind.Siege) SendHome(a, b.AttackerSurvivors);
        else
        {
            GoOn(a, b.AttackerSurvivors);
            GoOn(b.Opponent!, b.DefenderSurvivors);
        }
        if (fell) Eliminate(b.Defender);
    }

    /// <summary>The castle fell: the army that brought it down carries a share of its stores, gold and people home.</summary>
    private FallLoot PlunderFallen(ArmyMarch a, Castle fallen)
    {
        var (food, wood, iron, gold, workers) = fallen.Plunder(Rules.War.FallLootShare, Rules.War.FallWorkerShare);
        a.LootFood += food;
        a.LootWood += wood;
        a.LootIron += iron;
        a.LootGold += gold;
        a.LootPeople += workers;
        return a.FallLoot = new FallLoot(food, wood, iron, gold, workers);
    }

    /// <summary>
    /// The fight at a camp is over: the army's losses count, the camp keeps whoever survived, and an army that cleared
    /// it carries the camp's gold and weapons home (they arrive with it).
    /// </summary>
    private void FinishCampBattle(ActiveBattle b)
    {
        _active.Remove(b);
        var a = b.Attacker;
        a.Battle = null;
        var attacker = _players[a.From].Castle;
        var camp = _sites[b.Defender["site:".Length..]];
        var attackLost = Lost(b.AttackerUnits, b.AttackerSurvivors);
        var banditsLost = Lost(b.DefenderUnits, b.DefenderSurvivors);
        attacker.ArmyLost(attackLost);
        attacker.Stats.EnemiesKilled += banditsLost.Values.Sum();

        foreach (var (type, n) in banditsLost) camp.Bandits[type] = Math.Max(0, camp.Bandits[type] - n);
        camp.Version++;
        bool cleared = camp.BanditCount == 0;
        if (cleared)
        {
            camp.Gone = true;
            a.LootGold += camp.Site.Gold;
            a.LootWeapons = a.LootWeapons.Concat(camp.Site.Weapons).GroupBy(kv => kv.Key).ToDictionary(grp => grp.Key, grp => grp.Sum(kv => kv.Value));
            a.LootWood += camp.Site.Wood;
        }

        var report = new BattleReport(b.Id, ElapsedSeconds, a.From, b.Defender,
            Lines(b.AttackerUnits, attackLost), Lines(b.DefenderUnits, banditsLost), b.Winner, 0, 0, 0, false, BattleKind.Camp);
        _battles.Add(report);
        Notify(a.From, new GameNotification(NotificationKind.BattleFought, b.Defender, ElapsedSeconds, BattleId: report.Id));
        SendHome(a, b.AttackerSurvivors);
    }

    private static Dictionary<UnitType, int> Lost(IReadOnlyDictionary<UnitType, int> before, IReadOnlyDictionary<UnitType, int> after) =>
        before.ToDictionary(kv => kv.Key, kv => kv.Value - after.GetValueOrDefault(kv.Key));

    /// <summary>When time runs out mid-battle, the battles going on end now with the outcome already fought out.</summary>
    private void FinishAllBattles()
    {
        foreach (var b in _active.OrderBy(b => b.EndsAt).ThenBy(b => b.Id).ToList())
        {
            if (Phase == MatchPhase.Ended) return;
            FinishBattle(b);
        }
    }

    /// <summary>Σ surviving attackers × DPS × siege seconds; archers count only partly against walls.</summary>
    public double SiegeDamage(IReadOnlyDictionary<UnitType, int> survivors) =>
        survivors.Sum(kv => kv.Value * kv.Key.Dps * Rules.War.SiegeSeconds
                            * (kv.Key.Range == AttackRange.Ranged ? Rules.War.ArcherSiegeMultiplier : 1));

    private void SendHome(ArmyMarch a, IReadOnlyDictionary<UnitType, int> survivors)
    {
        int count = survivors.Values.Sum();
        if (count == 0 || _eliminated.ContainsKey(a.From))
        {
            // No one left, or no castle to go back to: the army is gone.
            _players[a.From].Castle.ArmyLost(survivors);
            _armies.Remove(a);
            return;
        }
        a.State = ArmyState.Returning;
        a.Survivors = survivors;
        a.Back = new Traveller(a.Out.Route.Reversed(), a.Out.Speed);
    }

    private static List<BattleUnitLine> Lines(IReadOnlyDictionary<UnitType, int> present, IReadOnlyDictionary<UnitType, int> lost) =>
        present.Where(kv => kv.Value > 0).OrderBy(kv => kv.Key.Index)
            .Select(kv => new BattleUnitLine(kv.Key.Id, kv.Key.Name, kv.Value, lost.GetValueOrDefault(kv.Key)))
            .ToList();

    /// <summary>
    /// The player's castle has fallen. Their economy stops, their scouts never come back and their
    /// returning armies disband; armies still marching go on and fight. Everyone is told.
    /// </summary>
    private void Eliminate(string player)
    {
        if (_eliminated.ContainsKey(player)) return;
        _eliminated[player] = ElapsedSeconds;
        _missions.RemoveAll(m => m.From == player);
        _trail.RemoveAll(t => t.Owner == player);
        foreach (var a in _armies.Where(a => a.From == player && a.State == ArmyState.Returning && a.Battle is null).ToList())
        {
            _players[player].Castle.ArmyLost(a.Survivors);
            _armies.Remove(a);
        }
        foreach (var key in _players.Keys)
            Notify(key, new GameNotification(NotificationKind.Eliminated, player, ElapsedSeconds));

        if (_players.Count >= 2 && _players.Keys.Count(k => !_eliminated.ContainsKey(k)) <= 1)
            EndMatch(byElimination: true);
    }

    /// <summary>
    /// Last castle standing wins; when time runs out, the highest population among those still
    /// standing (a tie shares first place). Fallen players rank below, the latest to fall first.
    /// </summary>
    private void EndMatch(bool byElimination)
    {
        Phase = MatchPhase.Ended;
        var alive = _players.Where(kv => !_eliminated.ContainsKey(kv.Key))
            .Select(kv => (Key: kv.Key, Pop: kv.Value.Castle.Population))
            .OrderByDescending(x => x.Pop).ThenBy(x => x.Key)
            .ToList();
        var ranking = new List<RankedPlayer>();
        int place = 0, previousPop = int.MinValue;
        for (int i = 0; i < alive.Count; i++)
        {
            if (alive[i].Pop != previousPop) place = i + 1;
            previousPop = alive[i].Pop;
            ranking.Add(new RankedPlayer(alive[i].Key, place, alive[i].Pop, false, null));
        }
        foreach (var (key, at) in _eliminated.OrderByDescending(kv => kv.Value))
            ranking.Add(new RankedPlayer(key, ranking.Count + 1, _players[key].Castle.Population, true, at));

        Result = new MatchResult(ranking.Where(r => r.Place == 1 && !r.Eliminated).Select(r => r.Player).ToList(), ranking, byElimination);
        foreach (var (key, p) in _players)
        {
            if (p.Samples[^1].Seconds < ElapsedSeconds - 1e-9) p.Sample(ElapsedSeconds);
            p.Summary = p.BuildSummary(ElapsedSeconds, _eliminated.ContainsKey(key));
        }
    }

    // ---- helpers -----------------------------------------------------------------------------

    private static string NewPublicId() => Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();

    private void Notify(string player, GameNotification notification)
    {
        if (!_notifications.TryGetValue(player, out var list)) _notifications[player] = list = [];
        list.Add(notification);
    }

    private void TakeSamples()
    {
        foreach (var (key, p) in _players)
            if (!_eliminated.ContainsKey(key)) p.Sample(ElapsedSeconds);
        _nextSample = ElapsedSeconds + SampleIntervalSeconds;
    }

    private sealed class PlayerEconomy(Castle castle)
    {
        private readonly int _startPopulation = castle.Population;

        public Castle Castle { get; } = castle;
        public List<EconomySample> Samples { get; } = [];
        public EconomySummary? Summary { get; set; }

        public void Sample(double seconds) =>
            Samples.Add(new EconomySample(seconds, Castle.Population, Castle.SoldierCount + Castle.SoldiersAway,
                Castle.Food, Castle.Wood, Castle.Iron));

        public EconomySummary BuildSummary(double elapsed, bool eliminated)
        {
            var c = Castle;
            var s = c.Stats;
            return new EconomySummary(
                elapsed, _startPopulation, c.Population, s.PeakPopulation, s.PeopleBorn,
                c.Workers.ToDictionary(kv => kv.Key, kv => kv.Value),
                c.Soldiers.ToDictionary(kv => kv.Key.Id, kv => kv.Value),
                c.Weapons.ToDictionary(kv => kv.Key.Id, kv => kv.Value),
                s.WeaponsMade,
                s.ProducedFood, s.ProducedWood, s.ProducedIron,
                c.Food, c.Wood, c.Iron,
                s.StarvingSeconds, s.IdleWorkerSeconds,
                Jobs.Buildings.ToDictionary(b => b, b => c.Building(b).Level),
                Samples.ToList(),
                new WarStats(s.AttacksLaunched, s.SoldiersLost, s.EnemiesKilled, s.CastleDamageDealt, s.CastleDamageTaken,
                    c.WallHp, c.MaxWallHp, eliminated, s.GoldGained, s.GoldSpent, s.MercenariesHired));
        }
    }
}
