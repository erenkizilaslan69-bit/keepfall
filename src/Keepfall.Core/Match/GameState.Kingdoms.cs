using Keepfall.Core.Combat;
using Keepfall.Core.Economy;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Match;

/// <summary>What a kingdom's player can see about their own abilities: waiting times, phantoms out, the lie they set.</summary>
public sealed record KingdomStatus(
    string Faction, double DecoyReadyIn, int DecoysOut, double BribeReadyIn, double DisguiseReadyIn, IReadOnlyDictionary<string, int>? FakeReport);

/// <summary>A rival's chance of losing to our soldiers at home, as the Oracle sees it (a range: the soldiers they count are only a scout's guess).</summary>
public sealed record OddsEstimate(string Target, bool Known, double Low, double High);

/// <summary>
/// The kingdoms' abilities (Match/Factions.cs lists them). All of it happens here, on the server: a phantom army is a real
/// <see cref="ArmyMarch"/> that is marked and costs no soldiers, a disguise is a name another army walks under, and what the players are
/// shown (<see cref="SeenBy"/>, warnings, reports) is decided by <see cref="ShownOwner"/> and friends. Nothing marks a lie as a lie
/// except for the Oracle's own view.
/// </summary>
public sealed partial class GameState
{
    private readonly Dictionary<string, string> _factions = [];
    private readonly Dictionary<string, KingdomState> _kingdoms = [];
    private readonly Dictionary<int, DisguiseRecord> _disguises = [];
    private readonly Dictionary<(string Viewer, string Target), (double At, OddsEstimate Estimate)> _odds = [];

    private sealed class KingdomState
    {
        public double DecoyReadyAt, BribeReadyAt, DisguiseReadyAt;
        public Dictionary<UnitType, int>? FakeReport;
    }

    /// <summary>A disguised army that fought: what the defender was told and when the truth comes out.</summary>
    private sealed class DisguiseRecord(string real, string shown, double revealAt, string victim)
    {
        public string Real { get; } = real;
        public string Shown { get; } = shown;
        public double RevealAt { get; } = revealAt;
        public string Victim { get; } = victim;
        public bool Told;
        public HashSet<string> RevealedTo { get; } = [];
    }

    private KingdomState KingdomOf(string player)
    {
        if (!_kingdoms.TryGetValue(player, out var k)) _kingdoms[player] = k = new KingdomState();
        return k;
    }

    /// <summary>The kingdom's id (see <see cref="Factions"/>), or null when the match has no kingdoms.</summary>
    public string? FactionOf(string player) => _factions.GetValueOrDefault(player);
    public bool IsFaction(string player, string faction) => _factions.TryGetValue(player, out var f) && f == faction;
    public bool HasKingdoms => _factions.Count > 0;

    // ---- who an army looks like ----------------------------------------------------------------

    /// <summary>
    /// The player an army belongs to as <paramref name="viewer"/> is told: its own owner, unless it is disguised (a Schemer army under another
    /// player's name) and the viewer is neither the owner nor an Oracle, nor has the truth come out for them.
    /// </summary>
    internal string ShownOwner(ArmyMarch a, string viewer)
    {
        if (a.ShownAs is not { } shown || viewer == a.From || IsFaction(viewer, Factions.Oracle)) return a.From;
        if (a.RevealedTo.Contains(viewer) || (a.RevealAt is { } at && ElapsedSeconds >= at)) return a.From;
        return shown;
    }

    /// <summary>The attacker of a battle as <paramref name="viewer"/> is told (null viewer: the truth).</summary>
    public string AttackerShownTo(ActiveBattle b, string? viewer) => viewer is null ? b.Attacker.From : ShownOwner(b.Attacker, viewer);

    /// <summary>The attacker named in a battle report as <paramref name="viewer"/> is told.</summary>
    public string AttackerSeenBy(BattleReport r, string viewer)
    {
        if (!_disguises.TryGetValue(r.Id, out var d) || viewer == r.Attacker || IsFaction(viewer, Factions.Oracle)) return r.Attacker;
        return ElapsedSeconds >= d.RevealAt || d.RevealedTo.Contains(viewer) ? r.Attacker : d.Shown;
    }

    private void RecordDisguise(BattleReport report, ArmyMarch a)
    {
        if (a.ShownAs is not { } shown || report.Kind == BattleKind.Camp) return;
        a.RevealAt ??= ElapsedSeconds + Rules.Kingdoms.DisguiseRevealSeconds;
        _disguises[report.Id] = new DisguiseRecord(a.From, shown, a.RevealAt.Value, report.Defender);
    }

    /// <summary>A scout that reached <paramref name="target"/>'s castle learns who the disguised armies of that castle really are.</summary>
    private void UnmaskFor(string target, string observer)
    {
        foreach (var a in _armies.Where(a => a.From == target && a.ShownAs is not null)) a.RevealedTo.Add(observer);
        foreach (var d in _disguises.Values.Where(d => d.Real == target)) d.RevealedTo.Add(observer);
    }

    private void AdvanceKingdoms()
    {
        foreach (var d in _disguises.Values.Where(d => !d.Told && ElapsedSeconds >= d.RevealAt))
        {
            d.Told = true;
            if (!_eliminated.ContainsKey(d.Victim)) Notify(d.Victim, new GameNotification(NotificationKind.Unmasked, d.Real, ElapsedSeconds, Detail: d.Shown));
        }
    }

    /// <summary>"Pretend to be": checks the name a Schemer's envoy or army goes under, and the army's waiting time.</summary>
    private CommandResult CheckAs(string from, string? asKey, string targetKey, bool disguise = false)
    {
        if (asKey is null) return CommandResult.Success;
        if (!IsFaction(from, Factions.Schemer)) return CommandResult.Fail("Başkasının adıyla yalnız Entrikacılar gönderebilir.");
        if (asKey == from || asKey == targetKey) return CommandResult.Fail("Kendi adınla ya da alıcının adıyla gönderilmez.");
        if (!_players.ContainsKey(asKey) || _eliminated.ContainsKey(asKey)) return CommandResult.Fail("Bu oyuncunun adıyla gönderemezsin.");
        if (disguise && KingdomOf(from).DisguiseReadyAt > ElapsedSeconds + 1e-9)
            return CommandResult.Fail($"Kılık değiştirme için {Math.Ceiling(KingdomOf(from).DisguiseReadyAt - ElapsedSeconds)} sn beklemelisin.");
        return CommandResult.Success;
    }

    private void StartDisguiseCooldown(string player) => KingdomOf(player).DisguiseReadyAt = ElapsedSeconds + Rules.Kingdoms.DisguiseCooldownSeconds;

    // ---- the Shadow ----------------------------------------------------------------------------

    private IReadOnlyDictionary<UnitType, int>? FakeReportOf(string target) =>
        IsFaction(target, Factions.Shadow) ? KingdomOf(target).FakeReport : null;

    /// <summary>The army table a scout of <paramref name="observer"/> reads at <paramref name="target"/>: the Shadow's lie, unless the observer is an Oracle (null: the real one).</summary>
    private IReadOnlyDictionary<UnitType, int>? ShownSoldiers(string target, string observer) =>
        IsFaction(observer, Factions.Oracle) ? null : FakeReportOf(target);

    private CommandResult SetFakeTable(string from, SetFakeReport c)
    {
        if (!IsFaction(from, Factions.Shadow)) return CommandResult.Fail("Sahte rapor yalnız Gölge Krallığı'nın.");
        var table = new Dictionary<UnitType, int>();
        foreach (var (id, n) in c.Units)
        {
            if (Rules.FindUnit(id) is not { } type) return CommandResult.Fail($"Bilinmeyen birlik \"{id}\".");
            if (n < 0 || n > 999) return CommandResult.Fail("Sayı 0 ile 999 arasında olmalı.");
            if (n > 0) table[type] = n;
        }
        KingdomOf(from).FakeReport = table.Count == 0 ? null : table;
        return CommandResult.Success;
    }

    private CommandResult LaunchDecoy(string from, PlayerEconomy player, SendDecoy c)
    {
        if (!IsFaction(from, Factions.Shadow)) return CommandResult.Fail("Hayalet ordu yalnız Gölge Krallığı'nın.");
        if (Phase != MatchPhase.War) return CommandResult.Fail("Hayalet ordu savaş fazında yürür.");
        if (c.TargetKey == from) return CommandResult.Fail("Kendi kalene gönderilmez.");
        if (!_players.ContainsKey(c.TargetKey)) return CommandResult.Fail("Böyle bir rakip yok.");
        if (_eliminated.ContainsKey(c.TargetKey)) return CommandResult.Fail("Bu oyuncu elendi.");
        var parsed = ParseArmy(c.Units, null, null, out var units, out var rows, out var priority);
        if (!parsed.Ok) return parsed;
        int total = units.Values.Sum();
        var k = Rules.Kingdoms;
        if (total < 1) return CommandResult.Fail("Hayalet ordunda kimse yok.");
        if (total > k.DecoyMaxSoldiers) return CommandResult.Fail($"Hayalet ordu en fazla {k.DecoyMaxSoldiers} kişilik olabilir.");
        var state = KingdomOf(from);
        if (state.DecoyReadyAt > ElapsedSeconds + 1e-9) return CommandResult.Fail($"Gölgeler dinleniyor: {Math.Ceiling(state.DecoyReadyAt - ElapsedSeconds)} sn.");
        if (_armies.Count(a => a.Decoy && a.From == from) >= k.DecoyMax) return CommandResult.Fail($"Aynı anda en fazla {k.DecoyMax} hayalet ordu yürüyebilir.");
        int cost = (int)Math.Ceiling(total * k.DecoyGoldPerSoldier - 1e-9);
        if (!player.Castle.TrySpendCargo(0, 0, 0, cost)) return CommandResult.Fail($"Hayalet ordu için {cost} altın gerekiyor.");
        state.DecoyReadyAt = ElapsedSeconds + k.DecoyCooldownSeconds;
        _armies.Add(new ArmyMarch(_nextId++, NewPublicId(), from, c.TargetKey, units, rows, priority, ElapsedSeconds,
            RouteBetween(from, c.TargetKey), SpeedOf(units)) { Decoy = true });
        return CommandResult.Success;
    }

    /// <summary>A phantom fades away the moment it comes within reach of an army of anybody else's (it never fights).</summary>
    private void DissolveDecoysThatMet(double radius)
    {
        foreach (var d in _armies.Where(a => a.Decoy && a.Battle is null).ToList())
            if (_armies.Any(r => !r.Decoy && r.From != d.From && r.Position.DistanceTo(d.Position) <= radius + 1e-9))
                _armies.Remove(d);
    }

    // ---- the Merchants -------------------------------------------------------------------------

    private CommandResult Bribe(string from, PlayerEconomy player, BribeArmy c)
    {
        if (!IsFaction(from, Factions.Merchant)) return CommandResult.Fail("Rüşvet yalnız Tüccar Cumhuriyeti'nin.");
        var k = Rules.Kingdoms;
        var state = KingdomOf(from);
        if (state.BribeReadyAt > ElapsedSeconds + 1e-9) return CommandResult.Fail($"Keseni yeniden doldurman gerek: {Math.Ceiling(state.BribeReadyAt - ElapsedSeconds)} sn.");
        var a = _armies.FirstOrDefault(x => x.PublicId == c.ArmyId);
        if (a is null || a.From == from || a.Target != from || a.State != ArmyState.Marching || a.Battle is not null || !SeenBy(from).Any(s => s.Id == c.ArmyId))
            return CommandResult.Fail("Rüşvet verebileceğin, sana yaklaşan bir ordu görmüyorsun.");
        int size = a.Units.Values.Sum();
        int max = (int)Math.Floor(size * k.BribeMaxShare + 1e-9);
        if (max < 1) return CommandResult.Fail("Bu ordu rüşvet için çok küçük.");
        int n = Math.Clamp(c.Count, 1, max);
        int cost = (int)Math.Ceiling(n * k.BribeGoldPerSoldier - 1e-9);
        if (!player.Castle.TrySpendCargo(0, 0, 0, cost)) return CommandResult.Fail($"{n} asker için {cost} altın gerekiyor.");
        state.BribeReadyAt = ElapsedSeconds + k.BribeCooldownSeconds;

        var turned = TakeProportional(a.Units, n);
        a.Units = a.Units.ToDictionary(kv => kv.Key, kv => kv.Value - turned.GetValueOrDefault(kv.Key));
        if (a.Decoy) return CommandResult.Success; // a phantom just thins out
        var home = new ArmyMarch(_nextId++, NewPublicId(), a.From, a.Target, turned, a.Rows, a.ArcherPriority, a.DepartedAt, a.Out.Route, a.Out.Speed, a.Mode)
        {
            ShownAs = a.ShownAs, RevealAt = a.RevealAt,
        };
        home.State = ArmyState.Returning;
        home.Survivors = turned;
        home.Back = new Traveller(Map.RouteFrom(a.Out.Route, a.Out.Travelled, WorldMap.GateNode(_corners[a.From])), a.Out.Speed);
        _armies.Add(home);
        Notify(a.From, new GameNotification(NotificationKind.Bribed, from, ElapsedSeconds, Detail: $"{n}"));
        return CommandResult.Success;
    }

    /// <summary>n soldiers out of the army, spread over its types in proportion.</summary>
    private static Dictionary<UnitType, int> TakeProportional(IReadOnlyDictionary<UnitType, int> units, int n)
    {
        int size = units.Values.Sum();
        var taken = new Dictionary<UnitType, int>();
        int left = n;
        foreach (var (type, count) in units.OrderByDescending(kv => kv.Value))
        {
            int k = Math.Min(Math.Min(count, left), (int)Math.Round(count * (double)n / size, MidpointRounding.AwayFromZero));
            if (k > 0) { taken[type] = k; left -= k; }
        }
        foreach (var (type, count) in units.OrderByDescending(kv => kv.Value))
        {
            if (left <= 0) break;
            int k = Math.Min(left, count - taken.GetValueOrDefault(type));
            if (k > 0) { taken[type] = taken.GetValueOrDefault(type) + k; left -= k; }
        }
        return taken;
    }

    private CommandResult RentCamp(string from, PlayerEconomy player, HireCamp c)
    {
        if (!IsFaction(from, Factions.Merchant)) return CommandResult.Fail("Kamp kiralamak yalnız Tüccar Cumhuriyeti'nin.");
        if (Phase != MatchPhase.War) return CommandResult.Fail("Kiralanan haydutlar savaş fazında saldırır.");
        if (c.TargetKey == from) return CommandResult.Fail("Kendi kalene saldırtılmaz.");
        if (!_players.ContainsKey(c.TargetKey)) return CommandResult.Fail("Böyle bir rakip yok.");
        if (_eliminated.ContainsKey(c.TargetKey)) return CommandResult.Fail("Bu oyuncu elendi.");
        if (!_sites.TryGetValue(c.SiteId, out var site) || !Knows(from, c.SiteId)) return CommandResult.Fail("Böyle bir yer bilmiyorsun.");
        if (site.Site.Kind is not (SiteKind.Camp or SiteKind.BigCamp)) return CommandResult.Fail("Bu bir haydut kampı değil.");
        if (_knowledge[from][c.SiteId].Gone || site.Gone || site.BanditCount == 0) return CommandResult.Fail("Bu kamp boşalmış görünüyor.");
        int cost = (int)Math.Ceiling((site.Site.Kind == SiteKind.BigCamp ? Rules.Kingdoms.CampPriceBig : Rules.Kingdoms.CampPriceSmall) - 1e-9);
        if (!player.Castle.TrySpendCargo(0, 0, 0, cost)) return CommandResult.Fail($"Kampı kiralamak için {cost} altın gerekiyor.");
        var units = site.Bandits.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value);
        foreach (var type in site.Bandits.Keys.ToList()) site.Bandits[type] = 0;
        site.Gone = true;
        site.Version++;
        _armies.Add(new ArmyMarch(_nextId++, NewPublicId(), from, c.TargetKey, units, new Dictionary<UnitType, Row>(), null, ElapsedSeconds,
            Map.RouteToSite(_corners[c.TargetKey], site.Site).Reversed(), SpeedOf(units)) { Rented = true });
        return CommandResult.Success;
    }

    /// <summary>The hired bandits are done at the gate: a share of the loot goes to whoever hired them, and they disperse.</summary>
    private void FinishRented(ArmyMarch a)
    {
        var castle = _players[a.From].Castle;
        double share = Rules.Kingdoms.CampLootShare;
        int food = (int)(a.LootFood * share), wood = (int)(a.LootWood * share), iron = (int)(a.LootIron * share), gold = (int)(a.LootGold * share);
        castle.AddGoods(food, wood, iron);
        castle.AddGold(gold);
        if (a.FallLoot is not null)
            Notify(a.From, new GameNotification(NotificationKind.LootHome, a.Target, ElapsedSeconds,
                Detail: new FallLoot(food, wood, iron, gold, 0).Describe()));
        _armies.Remove(a);
    }

    // ---- the Oracle ----------------------------------------------------------------------------

    /// <summary>Every rival's kingdom and deck, as the Oracle knows them from the first moment (empty for everyone else).</summary>
    public IReadOnlyList<(string Player, string Faction, IReadOnlyList<string> Deck)> OracleKnowledgeOf(string viewer)
    {
        if (!IsFaction(viewer, Factions.Oracle)) return [];
        return _players.Where(kv => kv.Key != viewer && _factions.ContainsKey(kv.Key))
            .Select(kv => (kv.Key, _factions[kv.Key], (IReadOnlyList<string>)kv.Value.Castle.UnitTypes.Select(u => u.Id).ToList()))
            .ToList();
    }

    /// <summary>
    /// For each rival: the chance (a range) that all the soldiers the Oracle has at home would win against what their latest scout report
    /// says is there. Without a report there is nothing to estimate. Worked out by playing a few battles, at most every few seconds.
    /// </summary>
    public IReadOnlyList<OddsEstimate> OddsOf(string viewer)
    {
        if (!IsFaction(viewer, Factions.Oracle) || !_players.TryGetValue(viewer, out var me)) return [];
        var list = new List<OddsEstimate>();
        foreach (var (target, other) in _players)
        {
            if (target == viewer || _eliminated.ContainsKey(target)) continue;
            if (_odds.TryGetValue((viewer, target), out var cached) && ElapsedSeconds - cached.At < 6) { list.Add(cached.Estimate); continue; }
            var estimate = Estimate(viewer, target, me.Castle);
            _odds[(viewer, target)] = (ElapsedSeconds, estimate);
            list.Add(estimate);
        }
        return list;
    }

    private OddsEstimate Estimate(string viewer, string target, Castle mine)
    {
        var report = _reports.GetValueOrDefault((viewer, target));
        var attackers = mine.Soldiers.Where(kv => kv.Value > 0).ToList();
        if (report is null || attackers.Count == 0) return new OddsEstimate(target, false, 0, 0);
        var k = Rules.Kingdoms;
        var rng = new Random(HashCode.Combine(viewer, target, (int)(ElapsedSeconds / 6)));
        int wins = 0, runs = Math.Max(4, k.OddsSimulations);
        for (int i = 0; i < runs; i++)
        {
            var a = new ArmySetup("Saldıran") { Targeting = TargetPriority.Front };
            foreach (var (type, n) in attackers) a.Add(type, n);
            var d = new ArmySetup("Savunan") { Targeting = TargetPriority.Front, RangedDamageFactor = 1 + Rules.Walls.ArcherDefenseBonus };
            int defenders = 0;
            foreach (var u in report.Soldiers)
            {
                if (Rules.FindUnit(u.UnitId) is not { } type || u.Count <= 0) continue;
                double jitter = 1 + (rng.NextDouble() * 2 - 1) * Rules.Scouting.ReportError;
                int n = Math.Max(1, (int)Math.Round(u.Count * jitter));
                d.Add(type, n);
                defenders += n;
            }
            if (defenders == 0) { wins++; continue; }
            if (_simulator.Simulate(a, d, rng, recordBattle: false).Outcome == BattleOutcome.SideAWins) wins++;
        }
        double p = wins / (double)runs;
        double margin = k.OddsMargin + (ElapsedSeconds - report.DeliveredAt > 120 ? 0.05 : 0);
        return new OddsEstimate(target, true, Math.Max(0, p - margin), Math.Min(1, p + margin));
    }

    // ---- what the player may see ---------------------------------------------------------------

    public KingdomStatus? KingdomStatusOf(string viewer)
    {
        if (FactionOf(viewer) is not { } faction) return null;
        var s = KingdomOf(viewer);
        double In(double at) => Math.Max(0, at - ElapsedSeconds);
        return new KingdomStatus(faction, In(s.DecoyReadyAt), _armies.Count(a => a.Decoy && a.From == viewer), In(s.BribeReadyAt), In(s.DisguiseReadyAt),
            s.FakeReport?.ToDictionary(kv => kv.Key.Id, kv => kv.Value));
    }

    /// <summary>
    /// The rivals whose castle is in live sight of this player right now, with their kingdom: only for these does the client draw the
    /// kingdom's ornaments (under the fog, and where the castle was seen once but is not any more, a castle looks plain).
    /// </summary>
    public IReadOnlyList<(string Player, string Faction)> FactionsInSightOf(string viewer)
    {
        if (!_factions.ContainsKey(viewer)) return [];
        var vision = VisionOf(viewer);
        return _players.Keys.Where(p => p != viewer && _factions.ContainsKey(p) && vision.Any(c => c.Contains(CastleVisionOf(p).Center)))
            .Select(p => (p, _factions[p])).ToList();
    }

    /// <summary>What a rival's castle plainly shows to this player's scout: its kingdom. Only reports carry it.</summary>
    public int ActiveDecoysOf(string player) => _armies.Count(a => a.Decoy && a.From == player);
}
