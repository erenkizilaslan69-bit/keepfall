using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Views;

// What the client receives, built under the room lock.
// CastleView/SummaryView only ever go to the castle's owner. RoomView goes to the whole room and
// carries nothing but public facts about players (seat, name, colour, ready, connected, host, bot).

public sealed record ResourcesView(double Food, double Wood, double Iron, double Gold = 0);

public sealed record RatesView(double FoodIn, double FoodOut, double Wood, double Iron, double ForgeSpeed);

public sealed record JobView(Job Job, string Name, int Count, int? Capacity);

public sealed record CostView(double Wood, double Iron, double Seconds, double Multiplier);

/// <param name="Product">What the workers gather (null for the forge).</param>
/// <param name="UpgradeGain">Extra per minute (or forge speed) the next level gives with today's workers.</param>
public sealed record BuildingView(
    BuildingType Type, string Name, Job Worker, Resource? Product, int Level, int MaxLevel, int Capacity, double Multiplier,
    double? UpgradeRemaining, double UpgradeTotal, CostView? NextUpgrade, double? UpgradeGain);

/// <param name="Price">Gold to hire one soldier (0 = cannot be hired).</param>
/// <param name="Hired">How many of the soldiers were hired (they cannot become workers).</param>
public sealed record UnitView(string Id, string Name, double Wood, double Iron, double BuildSeconds, int Weapons, int Soldiers,
    double Price = 0, int Hired = 0, int Arming = 0);

public sealed record OrderView(string UnitId, string Name, int Remaining, double Progress, double BuildSeconds);

public sealed record SummaryView(
    double DurationSeconds, int StartPopulation, int FinalPopulation, int PeakPopulation, int PeopleBorn,
    IReadOnlyList<JobView> Workers, IReadOnlyList<UnitView> Units, int WeaponsMade,
    ResourcesView Produced, ResourcesView Final, double StarvingSeconds, double IdleWorkerSeconds,
    IReadOnlyList<BuildingView> Buildings, IReadOnlyList<EconomySample> Samples, WarStats War);

// War. A player sees their own armies, the warnings about armies coming at them (who and when,
// nothing more) and the reports of battles they fought in. Never another player's army on the road.
public sealed record ArmyUnitView(string UnitId, string Name, int Count);
/// <param name="Fighting">In a battle right now (then it cannot be recalled).</param>
public sealed record ArmyView(
    int Id, int TargetSeat, string TargetName, PlayerColor TargetColor, ArmyState State,
    IReadOnlyList<ArmyUnitView> Units, double Distance, double RemainingSeconds, ArmyMode Mode, bool Fighting,
    string? SiteId = null, SiteKind? SiteKind = null);
public sealed record IncomingView(int FromSeat, string FromName, PlayerColor FromColor, double ArrivesInSeconds);
public sealed record BattleLineView(string UnitId, string Name, int Count, int Lost);
public sealed record BattleReportView(
    int Id, double At, bool Attacking, int OpponentSeat, string OpponentName, PlayerColor OpponentColor,
    IReadOnlyList<BattleLineView> AttackerUnits, IReadOnlyList<BattleLineView> DefenderUnits,
    BattleWinner Winner, bool YouWon, bool DefenderEliminated,
    BattleKind Kind, LootView? Loot = null);
/// <summary>What the army that brought a castle down took from it.</summary>
public sealed record LootView(int Food, int Wood, int Iron, int Gold, int People, int Prisoners = 0);
public sealed record DefenseView(IReadOnlyDictionary<string, Row> Rows, string? ArcherPriority);
public sealed record WarView(
    bool Famine, double FamineStartsIn,
    int SoldiersAway, IReadOnlyList<ArmyView> Armies, IReadOnlyList<IncomingView> Incoming,
    IReadOnlyList<BattleReportView> Battles, DefenseView Defense);

/// <summary>The wall upgrade: the one under way (seconds left, of how many) and what the next level costs (null Next* at the top level).</summary>

// Scouting. A report is all the client ever learns about another castle: approximate soldier
// counts and building levels. Targets carry only public facts (seat, name, colour) and how far
// away they are (the map is the same for everyone).
public sealed record ScoutTargetView(int Seat, string Name, PlayerColor Color, bool Busy, double ScoutSeconds, double MarchSeconds);
/// <param name="Quarter">For a forest tour: which quarter (named by its corner).</param>
public sealed record ScoutMissionView(int TargetSeat, double Progress, bool Arrived, double RemainingSeconds,
    MissionKind Kind = MissionKind.Spy, Corner? Quarter = null, string? SiteId = null);
/// <summary>One quarter of the forest as a place to send a scout: whose corner it belongs to, whether it has been toured, how long a tour takes.</summary>
public sealed record QuarterView(Corner Corner, int? Seat, string? Name, PlayerColor? Color, bool Explored, bool Busy, double Seconds);
public sealed record ScoutedUnitView(string UnitId, string Name, int Count);
public sealed record ScoutBuildingView(BuildingType Type, string Name, int Level);
public sealed record ScoutReportView(
    int TargetSeat, string TargetName, PlayerColor TargetColor, double ObservedAt, double DeliveredAt,
    IReadOnlyList<ScoutedUnitView> Soldiers, IReadOnlyList<ScoutBuildingView> Buildings);
public sealed record ScoutingView(
    int ScoutsAway, IReadOnlyList<ScoutTargetView> Targets,
    IReadOnlyList<ScoutMissionView> Missions, IReadOnlyList<ScoutReportView> Reports, IReadOnlyList<QuarterView> Quarters, int MaxScouts = 1, bool Locked = false);

public sealed record CastleView(
    MatchPhase Phase, PlayerColor Color, double ElapsedSeconds, double RemainingSeconds, double PrepSeconds,
    int Speed, bool SpeedControl,
    ResourcesView Resources, RatesView Rates,
    int Population, int Soldiers, double NextPersonCost, double FoodReserve, bool GrowthEnabled, bool Starving,
    IReadOnlyList<JobView> Jobs, IReadOnlyList<BuildingView> Buildings,
    IReadOnlyList<UnitView> Units, IReadOnlyList<OrderView> Queue,
    ScoutingView Scouting,
    WarView War,
    bool Eliminated,
    SummaryView? Summary,
    double ArmSeconds = 0,
    IReadOnlyList<LetterView>? Letters = null,
    EnvoyRulesView? Envoy = null);

/// <summary>What an envoy left at our castle: who from, the goods and the message (plain text, shown as plain text). Only ever sent to the receiver.</summary>
public sealed record LetterView(int Id, int FromSeat, string FromName, PlayerColor FromColor, double At, int Food, int Wood, int Iron, int Gold, string? Message);

/// <summary>The envoy limits the client shows in its form.</summary>
public sealed record EnvoyRulesView(int MaxCargo, int MaxMessageLength);

public sealed record CommandResultView(bool Ok, string? Error);

/// <summary>Public facts about a player. Never the token.</summary>
public sealed record PlayerView(int Seat, string Name, PlayerColor Color, bool Ready, bool Connected, bool IsHost, bool Eliminated,
    bool IsBot = false, BotDifficulty? BotLevel = null);

/// <summary>Sent to everyone once the match is over: the hidden-information rule ends with the match.</summary>
public sealed record RankView(int Seat, string Name, PlayerColor Color, int Place, int Population, bool Eliminated);
public sealed record PlayerSummaryView(int Seat, string Name, PlayerColor Color, SummaryView Summary);
public sealed record ResultView(
    IReadOnlyList<int> Winners, bool ByElimination, IReadOnlyList<RankView> Ranking, IReadOnlyList<PlayerSummaryView> Summaries);

public sealed record RoomView(
    string Code, RoomPhase Phase, IReadOnlyList<PlayerView> Players, int MinPlayers, int MaxPlayers,
    bool CanStart, double? RemainingSeconds, ResultView? Result, bool AllHumansOut = false);

/// <summary>Answer to CreateRoom/JoinRoom: the caller's own secret token and seat.</summary>
public sealed record JoinView(bool Ok, string? Error, string? Code, string? Token, int Seat, RoomView? Room);

public static class ViewMapper
{
    public static RoomView ToView(Room room) => new(
        room.Code, room.Phase,
        room.Players.Select(p => new PlayerView(p.Seat, p.Name, p.Color, p.Ready, p.Connected, p.Seat == room.HostSeat, room.IsEliminated(p), p.IsBot, p.Bot)).ToList(),
        room.Options.MinPlayers, room.Options.MaxPlayers, room.CanStart, room.Game?.RemainingSeconds,
        room.Phase == RoomPhase.Ended ? ResultOf(room) : null, room.AllHumansOut);

    private static ResultView? ResultOf(Room room)
    {
        if (room.Game is not { Result: { } result } game) return null;
        int SeatOf(string key) => room.PlayerOfCastle(key)?.Seat ?? 0;
        return new ResultView(
            result.Winners.Select(SeatOf).ToList(),
            result.ByElimination,
            result.Ranking.Select(r =>
            {
                var p = room.PlayerOfCastle(r.Player);
                return new RankView(p?.Seat ?? 0, p?.Name ?? "?", p?.Color ?? PlayerColor.Blue, r.Place, r.Population, r.Eliminated);
            }).ToList(),
            room.Players
                .Where(p => game.SummaryOf(p.CastleKey) is not null)
                .Select(p => new PlayerSummaryView(p.Seat, p.Name, p.Color, ToView(game.SummaryOf(p.CastleKey)!, game.CastleOf(p.CastleKey)!)))
                .ToList());
    }

    /// <summary>The castle of <paramref name="player"/>; null while the room has no match.</summary>
    public static CastleView? CastleOf(Room room, RoomPlayer player)
    {
        if (room.Game is not { } game || game.CastleOf(player.CastleKey) is not { } c) return null;
        bool speedControl = room.Options.AllowSpeedControl && player.Seat == room.HostSeat;
        return new CastleView(
            game.Phase, player.Color, game.ElapsedSeconds, game.RemainingSeconds, game.PrepSeconds, room.Speed, speedControl,
            new ResourcesView(c.Food, c.Wood, c.Iron, c.Gold),
            new RatesView(c.ProductionPerMinute(Resource.Food), c.FoodConsumptionPerMinute,
                c.ProductionPerMinute(Resource.Wood), c.ProductionPerMinute(Resource.Iron), c.ForgeSpeed),
            c.Population, c.SoldierCount, c.NextPersonCost, c.GrowthReserve, c.GrowthEnabled, c.Starving,
            JobsOf(c), BuildingsOf(c), UnitsOf(c),
            c.Queue.Select(o => new OrderView(o.Type.Id, o.Type.Name, o.Remaining, o.Progress, o.Type.BuildSeconds)).ToList(),
            ScoutingOf(room, game, player, c),
            WarOf(room, game, player, c),
            game.IsEliminated(player.CastleKey),
            game.SummaryOf(player.CastleKey) is { } s ? ToView(s, c) : null,
            game.Rules.Match.ArmSeconds,
            game.LettersOf(player.CastleKey).Select(l =>
            {
                var from = room.PlayerOfCastle(l.From);
                return new LetterView(l.Id, from?.Seat ?? 0, from?.Name ?? "?", from?.Color ?? PlayerColor.Blue, l.At, l.Food, l.Wood, l.Iron, l.Gold, l.Message);
            }).ToList(),
            new EnvoyRulesView(game.Rules.Envoy.MaxCargo, game.Rules.Envoy.MaxMessageLength));
    }

    private static WarView WarOf(Room room, GameState game, RoomPlayer player, Castle c)
    {
        var rules = game.Rules.War;
        var now = game.ElapsedSeconds;
        RoomPlayer? Other(string key) => room.PlayerOfCastle(key);
        List<ArmyUnitView> Units(IReadOnlyDictionary<UnitType, int> units) =>
            units.Where(kv => kv.Value > 0).OrderBy(kv => kv.Key.Index).Select(kv => new ArmyUnitView(kv.Key.Id, kv.Key.Name, kv.Value)).ToList();
        List<BattleLineView> Lines(IReadOnlyList<BattleUnitLine> lines) =>
            lines.Select(l => new BattleLineView(l.UnitId, l.Name, l.Count, l.Lost)).ToList();

        return new WarView(
            game.Famine, game.FamineStartsIn, c.SoldiersAway,
            game.ArmiesOf(player.CastleKey).Select(a =>
            {
                var target = Other(a.Target);
                string name = a.Site is { } site ? SiteName(site.Site.Kind) : target?.Name ?? "?";
                return new ArmyView(a.Id, target?.Seat ?? 0, name, target?.Color ?? PlayerColor.Blue, a.State,
                    Units(a.State == ArmyState.Marching ? a.Units : a.Survivors), a.Distance, RemainingOf(a), a.Mode, a.Battle is not null,
                    a.Site?.Site.Id, a.Site?.Site.Kind);
            }).ToList(),
            // Only who and when: an incoming army's size and units are never part of this.
            game.IncomingWarningsOf(player.CastleKey).Select(w =>
            {
                var from = Other(w.From);
                return new IncomingView(from?.Seat ?? 0, from?.Name ?? "?", from?.Color ?? PlayerColor.Blue, Math.Max(0, w.ArrivesAt - now));
            }).ToList(),
            game.BattlesOf(player.CastleKey).TakeLast(10).Reverse().Select(b =>
            {
                bool attacking = b.Attacker == player.CastleKey;
                var opponent = Other(attacking ? b.Defender : b.Attacker);
                bool bandits = b.Kind == BattleKind.Camp;
                bool youWon = attacking ? b.Winner == BattleWinner.Attacker : b.Winner == BattleWinner.Defender;
                return new BattleReportView(b.Id, b.At, attacking, opponent?.Seat ?? 0, bandits ? "Haydutlar" : opponent?.Name ?? "?",
                    bandits ? PlayerColor.Black : opponent?.Color ?? PlayerColor.Blue, Lines(b.AttackerUnits), Lines(b.DefenderUnits), b.Winner, youWon,
                    b.DefenderEliminated, b.Kind,
                    b.Loot is { } l ? new LootView(l.Food, l.Wood, l.Iron, l.Gold, l.People, l.Prisoners) : null);
            }).ToList(),
            new DefenseView(c.DefenseRows.ToDictionary(kv => kv.Key.Id, kv => kv.Value), c.DefensePriority?.Id));
    }

    public static string SiteName(SiteKind kind) => kind switch
    {
        SiteKind.Chest => "Sandık", SiteKind.Village => "Köy", SiteKind.Camp => "Haydut kampı", _ => "Büyük haydut kampı",
    };

    /// <summary>Seconds until the army arrives (or is home); an interceptor that met nobody turns back half way.</summary>
    private static double RemainingOf(ArmyMarch a) =>
        a.Mode == ArmyMode.Intercept && a.State == ArmyState.Marching
            ? Math.Max(0, a.Out.Route.Length / 2 - a.Out.Travelled) / a.Out.Speed
            : a.SecondsLeft;

    private static ScoutingView ScoutingOf(Room room, GameState game, RoomPlayer player, Castle c)
    {
        var missions = game.MissionsOf(player.CastleKey);
        int SeatOf(string key) => room.PlayerOfCastle(key)?.Seat ?? 0;
        return new ScoutingView(
            c.ScoutsAway,
            room.Players.Where(p => p.Seat != player.Seat)
                .Select(p => new ScoutTargetView(p.Seat, p.Name, p.Color, missions.Any(m => m.Kind == MissionKind.Spy && m.Target == p.CastleKey),
                    game.ScoutSeconds(player.CastleKey, p.CastleKey), game.MarchSeconds(player.CastleKey, p.CastleKey)))
                .ToList(),
            missions.Select(m => new ScoutMissionView(SeatOf(m.Target), m.Progress, m.Arrived, m.SecondsLeft, m.Kind, m.Quarter, m.Site?.Site.Id)).ToList(),
            game.ReportsOf(player.CastleKey).Select(r =>
            {
                var target = room.PlayerOfCastle(r.Target);
                return new ScoutReportView(
                    target?.Seat ?? 0, target?.Name ?? "?", target?.Color ?? PlayerColor.Blue, r.ObservedAt, r.DeliveredAt,
                    r.Soldiers.Select(u => new ScoutedUnitView(u.UnitId, u.Name, u.Count)).ToList(),
                    r.BuildingLevels.Select(kv => new ScoutBuildingView(kv.Key, Jobs.Name(kv.Key), kv.Value)).ToList());
            }).ToList(),
            Enum.GetValues<Corner>().Select(q =>
            {
                var owner = room.Players.FirstOrDefault(p => game.Corners.TryGetValue(p.CastleKey, out var corner) && corner == q);
                return new QuarterView(q, owner?.Seat, owner?.Name, owner?.Color, game.ExploredBy(player.CastleKey).Contains(q),
                    game.IsExploring(player.CastleKey, q), game.ExploreSeconds(player.CastleKey, q));
            }).ToList(),
            game.Rules.Scouting.MaxScouts, game.ScoutingLocked);
    }

    public static List<JobView> JobsOf(Castle c) =>
        Jobs.All.Select(j => new JobView(j, Jobs.Name(j), c.Workers[j],
            Jobs.BuildingOf(j) is { } b ? c.Capacity(b) : null)).ToList();

    public static List<BuildingView> BuildingsOf(Castle c) =>
        Jobs.Buildings.Select(type =>
        {
            var b = c.Building(type);
            var max = c.Economy.MaxBuildingLevel;
            var next = b.Level < max ? c.Economy.Level(b.Level + 1) : null;
            return new BuildingView(type, Jobs.Name(type), Jobs.WorkerOf(type), Jobs.ProductOf(Jobs.WorkerOf(type)),
                b.Level, max, c.Capacity(type), c.Multiplier(type), b.UpgradeRemaining, b.UpgradeTotal,
                next is null ? null : new CostView(next.UpgradeWood, next.UpgradeIron, next.UpgradeSeconds, next.Multiplier),
                c.UpgradeGain(type));
        }).ToList();

    public static List<UnitView> UnitsOf(Castle c) =>
        c.UnitTypes.Select(u => new UnitView(u.Id, u.Name, u.Cost.Wood, u.Cost.Iron, u.BuildSeconds,
            c.Weapons[u], c.Soldiers[u], c.MercenaryPrice(u), c.Mercenaries[u], c.ArmingOf(u))).ToList();

    private static SummaryView ToView(EconomySummary s, Castle c) => new(
        s.DurationSeconds, s.StartPopulation, s.FinalPopulation, s.PeakPopulation, s.PeopleBorn,
        JobsOf(c), UnitsOf(c), s.WeaponsMade,
        new ResourcesView(s.ProducedFood, s.ProducedWood, s.ProducedIron),
        new ResourcesView(s.FinalFood, s.FinalWood, s.FinalIron),
        s.StarvingSeconds, s.IdleWorkerSeconds, BuildingsOf(c), s.Samples, s.War);
}
