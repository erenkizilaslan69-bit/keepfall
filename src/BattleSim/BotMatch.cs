using Keepfall.Core;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Views;

namespace Keepfall.BattleSim;

/// <summary>Plays matches between bots with no screen: the same BotHost the server uses, driven second by second.</summary>
public static class BotMatch
{
    public static Room Create(GameRules rules, IReadOnlyList<BotDifficulty> levels, double prepSeconds, double warSeconds, int seed) =>
        Room.StartBotMatch("SIM", rules, new RoomOptions { MinPlayers = 1, PrepSeconds = prepSeconds, WarSeconds = warSeconds, Seed = seed }, levels);

    /// <summary>Plays until the match ends; <paramref name="every"/> is called after each simulated second (for tracing).</summary>
    public static void Play(GameRules rules, Room room, int seed, Action<Room, BotHost.BotHost>? every = null)
    {
        var host = new BotHost.BotHost(rules, seed);
        while (room.Phase is RoomPhase.Preparation or RoomPhase.War)
        {
            room.Tick(rules.Match.ServerTickSeconds, dt => host.Step(room, dt));
            every?.Invoke(room, host);
        }
    }

    /// <summary>One line per bot: how its castle looks now.</summary>
    public static string Describe(Room room, BotHost.BotHost host)
    {
        var lines = new List<string>();
        foreach (var p in room.Players)
        {
            var c = ViewMapper.CastleOf(room, p);
            if (c is null) continue;
            string jobs = string.Join("/", c.Jobs.Select(j => j.Count));
            string levels = string.Join("", c.Buildings.Select(b => b.Level));
            string weapons = string.Join(",", c.Units.Select(u => $"{u.Soldiers}+{u.Weapons}"));
            lines.Add($"  {p.Name,-12} nüfus {c.Population,3}  iş(boş/çift/odun/maden/demir) {jobs}  bina {levels}  yemek {c.Resources.Food,5:0} odun {c.Resources.Wood,4:0} demir {c.Resources.Iron,4:0}"
                + $"  asker+silah(okçu,kılıçlı,mızrak,kalkan) {weapons}  kuyruk {c.Queue.Sum(o => o.Remaining)}"
                + $"  altın {c.Resources.Gold:0}  ordu {c.War.Armies.Count}  gözcü {c.Scouting.Missions.Count}  yer {MapViewMapper.StateOf(room, p)?.Sites.Count ?? 0}"
                + (host.Stats.TryGetValue(p.Seat, out var st) ? $"  [köy {st["villageRaids"]} kamp {st["campAttacks"]} red {string.Join(",", st.Counts.Where(k => k.Key.StartsWith("refused:")).Select(k => $"{k.Key[8..]}={k.Value}"))}]" : ""));
        }
        return string.Join("\n", lines);
    }
}
