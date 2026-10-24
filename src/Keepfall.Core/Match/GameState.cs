using System.Security.Cryptography;
using Keepfall.Core.Combat;
using Keepfall.Core.Economy;
using Keepfall.Core.Units;

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
    private readonly List<ScoutMission> _missions = [];
    private readonly Dictionary<(string From, string Target), ScoutReport> _reports = [];
    private readonly List<ArmyMarch> _armies = [];
    private readonly List<BattleReport> _battles = [];
    private readonly Dictionary<string, double> _eliminated = [];
    private readonly Dictionary<string, List<GameNotification>> _notifications = [];
    private readonly BattleSimulator _simulator;
    private readonly Random _rng;
    private double _nextSample;
    private int _nextId = 1;

    /// <param name="prepSeconds">Preparation length; default: the short mode's.</param>
    /// <param name="warSeconds">War length; default: the short mode's.</param>
    /// <param name="rng">Randomness for scout errors and battles; tests pass a seeded one.</param>
    public GameState(GameRules rules, IEnumerable<string> playerKeys, double? prepSeconds = null,
        double? warSeconds = null, Random? rng = null)
    {
        Rules = rules;
        _rng = rng ?? new Random(RandomNumberGenerator.GetInt32(int.MaxValue));
        _simulator = new BattleSimulator(rules);
        PrepSeconds = prepSeconds ?? rules.Match.ShortModePrepSeconds;
        WarSeconds = warSeconds ?? rules.Match.ShortModeWarSeconds;
        _players = playerKeys.Distinct().ToDictionary(k => k, _ => new PlayerEconomy(new Castle(rules)));
        if (_players.Count == 0) throw new ArgumentException("A match needs at least one player.", nameof(playerKeys));
        TakeSamples();
    }

    public GameRules Rules { get; }
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

    private double PhaseEndsAt => Phase == MatchPhase.Preparation ? PrepSeconds : PrepSeconds + WarSeconds;

    public Castle? CastleOf(string playerKey) => _players.GetValueOrDefault(playerKey)?.Castle;
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
    /// Armies coming at this player that they have been warned about: who sent them and when they
    /// arrive. Nothing about size or composition leaves this method.
    /// </summary>
    public IReadOnlyList<(string From, double ArrivesAt)> IncomingWarningsOf(string playerKey) =>
        _armies.Where(a => a.Target == playerKey && a.State == ArmyState.Marching && a.Warned)
            .OrderBy(a => a.ArrivesAt)
            .Select(a => (a.From, a.ArrivesAt))
            .ToList();

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
        AdvanceScouts();
        AdvanceArmies();
        if (Phase == MatchPhase.Ended) return; // the last castle standing ended it
        if (ElapsedSeconds + 1e-9 >= _nextSample) TakeSamples();
        if (RemainingSeconds <= 1e-9)
        {
            if (Phase == MatchPhase.Preparation) Phase = MatchPhase.War;
            else EndMatch(byElimination: false);
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
            SendArmy army => LaunchArmy(playerKey, player, army),
            _ => player.Castle.Execute(command),
        };
    }

    // ---- scouting ----------------------------------------------------------------------------

    private CommandResult LaunchScout(string from, PlayerEconomy player, SendScout c)
    {
        if (c.TargetKey == from) return CommandResult.Fail("Kendi kaleni gözetleyemezsin.");
        if (!_players.ContainsKey(c.TargetKey)) return CommandResult.Fail("Böyle bir rakip yok.");
        if (_eliminated.ContainsKey(c.TargetKey)) return CommandResult.Fail("Bu oyuncu elendi.");
        if (_missions.Any(m => m.From == from && m.Target == c.TargetKey))
            return CommandResult.Fail("Bu rakibe zaten bir gözcün gidiyor.");
        var sent = player.Castle.SendScout(c.From);
        if (!sent.Ok) return sent;
        _missions.Add(new ScoutMission(from, c.TargetKey, ElapsedSeconds, Rules.Scouting));
        return CommandResult.Success;
    }

    private void AdvanceScouts()
    {
        foreach (var m in _missions.ToList())
        {
            if (!m.Arrived && ElapsedSeconds + 1e-9 >= m.ArrivesAt)
            {
                m.Report = Observe(m.Target, ElapsedSeconds);
                Notify(m.Target, new GameNotification(NotificationKind.ScoutedBy, m.From, ElapsedSeconds));
            }
            if (ElapsedSeconds + 1e-9 >= m.ReturnsAt)
            {
                _reports[(m.From, m.Target)] = m.Report! with { DeliveredAt = ElapsedSeconds };
                _players[m.From].Castle.ReturnScout();
                _missions.Remove(m);
            }
        }
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

        var units = new Dictionary<UnitType, int>();
        foreach (var (id, n) in c.Units)
        {
            if (Rules.FindUnit(id) is not { } type) return CommandResult.Fail($"Bilinmeyen birlik \"{id}\".");
            if (n > 0) units[type] = units.GetValueOrDefault(type) + n;
        }
        var rows = new Dictionary<UnitType, Row>();
        foreach (var (id, row) in c.Rows ?? new Dictionary<string, Row>())
        {
            if (Rules.FindUnit(id) is not { } type) return CommandResult.Fail($"Bilinmeyen birlik \"{id}\".");
            rows[type] = row;
        }
        UnitType? priority = null;
        if (!string.IsNullOrEmpty(c.ArcherPriority) && (priority = Rules.FindUnit(c.ArcherPriority)) is null)
            return CommandResult.Fail($"Bilinmeyen birlik \"{c.ArcherPriority}\".");

        var sent = player.Castle.DispatchArmy(units);
        if (!sent.Ok) return sent;
        _armies.Add(new ArmyMarch(_nextId++, from, c.TargetKey, units, rows, priority, ElapsedSeconds, Rules.War));
        return CommandResult.Success;
    }

    private void AdvanceArmies()
    {
        // The target hears about an army a little before it arrives: only who sent it.
        foreach (var a in _armies.Where(a => a.State == ArmyState.Marching && !a.Warned && ElapsedSeconds + 1e-9 >= a.WarnAt))
        {
            a.Warned = true;
            if (!_eliminated.ContainsKey(a.Target))
                Notify(a.Target, new GameNotification(NotificationKind.ArmyIncoming, a.From, ElapsedSeconds, a.ArrivesAt));
        }

        // Arrivals in order; armies arriving together fight one after the other, earliest sent first.
        var arriving = _armies
            .Where(a => a.State == ArmyState.Marching && ElapsedSeconds + 1e-9 >= a.ArrivesAt)
            .OrderBy(a => a.ArrivesAt).ThenBy(a => a.Id)
            .ToList();
        foreach (var a in arriving)
        {
            if (Phase == MatchPhase.Ended) return;
            Arrive(a);
        }

        foreach (var a in _armies.Where(a => a.State == ArmyState.Returning && ElapsedSeconds + 1e-9 >= a.ReturnsAt).ToList())
        {
            _players[a.From].Castle.ArmyReturned(a.Survivors);
            _armies.Remove(a);
        }
    }

    /// <summary>
    /// The army fights whoever is at home in the target castle right now. If it wins, its survivors
    /// damage the castle; at 0 HP the defender is out. Survivors walk home (or disband if their own
    /// castle has fallen in the meantime).
    /// </summary>
    private void Arrive(ArmyMarch a)
    {
        var attacker = _players[a.From].Castle;
        if (_eliminated.ContainsKey(a.Target))
        {
            SendHome(a, a.Units); // nothing left to attack
            return;
        }
        var defender = _players[a.Target].Castle;

        var attackSetup = new ArmySetup("Saldıran") { Targeting = a.ArcherPriority is { } p ? TargetPriority.Prefer(p) : TargetPriority.Front };
        foreach (var (type, n) in a.Units) attackSetup.Add(type, n);
        foreach (var (type, row) in a.Rows) attackSetup.PlaceIn(type, row);

        var defenders = defender.Soldiers.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value);
        var defendSetup = new ArmySetup("Savunan") { Targeting = defender.DefensePriority is { } d ? TargetPriority.Prefer(d) : TargetPriority.Front };
        foreach (var (type, n) in defenders) defendSetup.Add(type, n);
        foreach (var (type, row) in defender.DefenseRows) defendSetup.PlaceIn(type, row);

        Dictionary<UnitType, int> attackSurvivors, defendSurvivors;
        BattleWinner winner;
        if (defendSetup.TotalCount == 0)
        {
            winner = BattleWinner.Attacker; // an empty castle does not fight back
            attackSurvivors = a.Units.ToDictionary(kv => kv.Key, kv => kv.Value);
            defendSurvivors = [];
        }
        else
        {
            var result = _simulator.Simulate(attackSetup, defendSetup, _rng);
            winner = result.Outcome switch
            {
                BattleOutcome.SideAWins => BattleWinner.Attacker,
                BattleOutcome.SideBWins => BattleWinner.Defender,
                _ => BattleWinner.Draw,
            };
            attackSurvivors = result.SideA.ByType.ToDictionary(t => t.Type, t => t.Survivors);
            defendSurvivors = result.SideB.ByType.ToDictionary(t => t.Type, t => t.Survivors);
        }

        var attackLost = a.Units.ToDictionary(kv => kv.Key, kv => kv.Value - attackSurvivors.GetValueOrDefault(kv.Key));
        var defendLost = defenders.ToDictionary(kv => kv.Key, kv => kv.Value - defendSurvivors.GetValueOrDefault(kv.Key));
        attacker.ArmyLost(attackLost.Values.Sum());
        defender.LoseDefenders(defendLost);
        attacker.Stats.EnemiesKilled += defendLost.Values.Sum();
        defender.Stats.EnemiesKilled += attackLost.Values.Sum();

        double damage = 0;
        if (winner == BattleWinner.Attacker)
        {
            // A wall cannot lose more than it has left (keeps damage stats honest).
            damage = Math.Min(SiegeDamage(attackSurvivors), defender.WallHp);
            defender.TakeWallDamage(damage);
            attacker.Stats.CastleDamageDealt += damage;
        }
        bool fell = winner == BattleWinner.Attacker && defender.WallHp <= 1e-9;

        var report = new BattleReport(_nextId++, ElapsedSeconds, a.From, a.Target,
            Lines(a.Units, attackLost), Lines(defenders, defendLost), winner, damage, defender.WallHp, defender.MaxWallHp, fell);
        _battles.Add(report);
        Notify(a.From, new GameNotification(NotificationKind.BattleFought, a.Target, ElapsedSeconds, BattleId: report.Id));
        Notify(a.Target, new GameNotification(NotificationKind.BattleFought, a.From, ElapsedSeconds, BattleId: report.Id));

        SendHome(a, attackSurvivors.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value));
        if (fell) Eliminate(a.Target);
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
            _players[a.From].Castle.ArmyLost(count);
            _armies.Remove(a);
            return;
        }
        a.State = ArmyState.Returning;
        a.Survivors = survivors;
        a.ReturnsAt = ElapsedSeconds + Rules.War.MarchSeconds;
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
        foreach (var a in _armies.Where(a => a.From == player && a.State == ArmyState.Returning).ToList())
        {
            _players[player].Castle.ArmyLost(a.Survivors.Values.Sum());
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
                    c.WallHp, c.MaxWallHp, eliminated));
        }
    }
}
