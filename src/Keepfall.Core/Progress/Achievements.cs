using Keepfall.Core.Challenges;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.Core.Progress;

/// <summary>
/// What one player did in one finished match, as plain numbers: the only input of the achievement rules (so they can be tested
/// without a room, and a later Steam hookup reads the same ids).
/// </summary>
public sealed record MatchFacts(
    bool Won, bool Shared, bool ByElimination, bool Eliminated, string? Kingdom, int Opponents, bool HardBotPlayed,
    double WarElapsed, double FamineAfter, int Population,
    int SoldiersLost, int EnemiesKilled, int BattlesWon, int BattlesLost, int CastlesFelled,
    int Villages, int Camps, int Chests, int Scouts, int Reports, int Envoys,
    int Decoys, int FakeReports, int Bribed, int CampsRented, int Disguises,
    bool IsChallenge, bool IsDaily, int ChallengeStars, bool Starter,
    // what the deception log and the battles say about this player (for the XP moments; nothing here is known to anyone before the match ends)
    int DecoysSeen = 0, int FakeReportsRead = 0, bool EnvoyLieHeld = false, bool DisguiseHeld = false, int FelledTriple = 0, int GoalsPassed = 0)
{
    /// <summary>A challenge or a starter match is a lesson, not a record: only the achievements marked <see cref="Def.InLessons"/> count there.</summary>
    public bool Plain => !IsChallenge && !Starter;
}

/// <summary>One achievement: a stable id (the later Steam achievement API name), and a rule over <see cref="MatchFacts"/>.</summary>
public sealed record Def(string Id, Func<MatchFacts, bool> Rule, bool InLessons = true);

public static class Achievements
{
    private static bool WonSolo(MatchFacts f) => f.Won && !f.Shared;

    /// <summary>
    /// The achievements decided by a single match. The ones that need the history (ten wins, every kingdom, all challenges …) are
    /// the meta list in the client's progress store; the ids of both lists are in docs/basarimlar.md.
    /// </summary>
    public static readonly IReadOnlyList<Def> All =
    [
        new("first_win", f => WonSolo(f)),
        new("challenge_win", f => f.IsChallenge && WonSolo(f)),
        new("challenge_3star", f => f.IsChallenge && f.ChallengeStars >= 3),
        new("daily_win", f => f.IsDaily && WonSolo(f)),
        new("ghost_win", f => WonSolo(f) && f.Decoys >= 1),
        new("village_raid", f => f.Villages >= 1),
        new("village_x3", f => f.Villages >= 3),
        new("camp_clear", f => f.Camps >= 1),
        new("early_win", f => WonSolo(f) && f.WarElapsed < f.FamineAfter - 1e-6),
        new("castle_felled", f => f.CastlesFelled >= 1),
        new("flawless", f => WonSolo(f) && f.SoldiersLost == 0 && f.BattlesWon >= 1),
        new("comeback", f => WonSolo(f) && f.BattlesLost >= 2),
        new("last_standing", f => WonSolo(f) && f.ByElimination && f.Opponents >= 2),
        new("full_table", f => WonSolo(f) && f.Opponents >= 3),
        new("hard_bot_win", f => WonSolo(f) && f.HardBotPlayed),
        new("scout_report", f => f.Scouts >= 1 && f.Reports >= 1),
        new("envoy", f => f.Envoys >= 1),
        new("fake_report", f => f.FakeReports >= 1),
        new("bribe", f => f.Bribed >= 1),
        new("camp_rent", f => f.CampsRented >= 1),
        new("disguise", f => f.Disguises >= 1),
        new("brave_fall", f => f.Eliminated && f.Opponents >= 2 && f.BattlesWon >= 3, InLessons: false),
    ];

    public static IReadOnlyList<string> Ids { get; } = All.Select(d => d.Id).ToList();

    /// <summary>Ids earned in this match (a lesson — challenge or starter match — only earns the ones that allow it).</summary>
    public static IReadOnlyList<string> Evaluate(MatchFacts f) =>
        All.Where(d => (d.InLessons || f.Plain) && d.Rule(f)).Select(d => d.Id).ToList();

    /// <summary>The facts about <paramref name="player"/> in a finished room; null while there is no result.</summary>
    public static MatchFacts? FactsOf(Room room, RoomPlayer player)
    {
        if (room.Game is not { Phase: MatchPhase.Ended, Result: { } result } game || game.CastleOf(player.CastleKey) is not { } castle) return null;
        var key = player.CastleKey;
        var stats = castle.Stats;
        var battles = game.BattlesOf(key);
        bool Won(BattleReport b) => b.Winner switch
        {
            BattleWinner.Attacker => b.Attacker == key,
            BattleWinner.Defender => b.Defender == key,
            _ => false,
        };
        bool Lost(BattleReport b) => b.Winner switch
        {
            BattleWinner.Attacker => b.Defender == key,
            BattleWinner.Defender => b.Attacker == key,
            _ => false,
        };
        bool isWinner = result.Winners.Contains(key);
        var outcome = room.Challenge is null ? null : ChallengeEvaluator.Evaluate(room, player);
        var log = game.DeceptionLog.Where(e => e.Actor == key).ToList();
        bool unmasked = log.Any(e => e.Kind == DeceptionKind.Unmasked);
        return new MatchFacts(
            isWinner, isWinner && result.Winners.Count > 1, result.ByElimination, game.IsEliminated(key), game.KingdomStatusOf(key)?.Faction,
            Opponents: room.Players.Count - 1, HardBotPlayed: room.Players.Any(p => p.Bot == BotDifficulty.Hard),
            WarElapsed: game.WarElapsedSeconds, FamineAfter: game.FamineAfterSeconds,
            Population: result.Ranking.FirstOrDefault(r => r.Player == key)?.Population ?? 0,
            SoldiersLost: stats.SoldiersLost, EnemiesKilled: stats.EnemiesKilled, BattlesWon: battles.Count(Won), BattlesLost: battles.Count(Lost),
            CastlesFelled: battles.Count(b => b.Attacker == key && b.DefenderEliminated),
            Villages: stats.VillagesPlundered, Camps: stats.CampsCleared, Chests: stats.ChestsLooted, Scouts: stats.ScoutsSent, Reports: stats.ReportsRead,
            Envoys: stats.EnvoysDelivered, Decoys: stats.DecoysSent, FakeReports: stats.FakeReportsSet, Bribed: stats.SoldiersBribed,
            CampsRented: stats.CampsRented, Disguises: stats.Disguises,
            IsChallenge: room.Challenge is not null, IsDaily: room.Challenge?.Daily == true, ChallengeStars: outcome?.Stars ?? 0, Starter: room.StarterActive,
            DecoysSeen: log.Count(e => e.Kind is DeceptionKind.DecoySighted or DeceptionKind.DecoyFaded),
            FakeReportsRead: log.Count(e => e.Kind == DeceptionKind.FakeReportRead),
            EnvoyLieHeld: !unmasked && log.Any(e => e.Kind == DeceptionKind.EnvoyAsDelivered),
            DisguiseHeld: !unmasked && log.Any(e => e.Kind == DeceptionKind.ArmyAsSent),
            FelledTriple: battles.Count(b => b.Attacker == key && b.DefenderEliminated && b.Rival is not null),
            GoalsPassed: outcome?.Goals.Count(g => g.Passed) ?? 0);
    }
}
