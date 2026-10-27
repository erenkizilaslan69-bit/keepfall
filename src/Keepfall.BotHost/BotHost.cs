using Keepfall.Bots;
using Keepfall.Core;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Views;

namespace Keepfall.BotHost;

/// <summary>
/// Seats the bots of one room. Each time a bot is due, it is given exactly what a human in its seat is sent (the same
/// view mappers), and the commands it answers with go through <see cref="Room.Execute"/> like a human's. The bots never
/// get at the match itself. Call <see cref="Step"/> under the room's lock, before every simulated step.
/// </summary>
public sealed class BotHost(GameRules rules, int seed)
{
    private readonly Dictionary<int, Bot> _bots = [];
    private GameState? _game;
    private MapLayoutView? _layout;

    /// <summary>What each bot did, by seat (for the bot-vs-bot report).</summary>
    public IReadOnlyDictionary<int, BotStats> Stats => _bots.ToDictionary(kv => kv.Key, kv => kv.Value.Stats);

    public IReadOnlyDictionary<int, Bot> Bots => _bots;

    /// <summary>Experiment only: seats whose bot just waits (economy and defence, no attacks).</summary>
    public ISet<int> PassiveSeats { get; } = new HashSet<int>();

    public void Step(Room room, double dt)
    {
        if (room.Game is not { } game || game.Phase == MatchPhase.Ended) return;
        if (!ReferenceEquals(game, _game))
        {
            // A new match: new bots (nothing carries over).
            _game = game;
            _bots.Clear();
            _layout = null;
        }
        foreach (var player in room.Players)
        {
            if (player.Bot is not { } level) continue;
            // Nobody reads a bot's notifications: it works from its pictures.
            room.TakeNotifications(player);
            if (room.IsEliminated(player)) continue;
            if (!_bots.TryGetValue(player.Seat, out var bot))
                _bots[player.Seat] = bot = new Bot(rules, level, player.Seat, MixSeed(seed, player.Seat), PassiveSeats.Contains(player.Seat));
            if (!bot.IsDue(game.ElapsedSeconds)) continue;

            _layout ??= MapViewMapper.LayoutOf(room);
            var castle = ViewMapper.CastleOf(room, player);
            if (castle is null) continue;
            var input = new BotInput(castle, MapViewMapper.StateOf(room, player), _layout, ViewMapper.ToView(room), player.Seat);
            foreach (var command in bot.Think(input))
            {
                var result = room.Execute(player.Token, command);
                if (!result.Ok) bot.Refused(command, game.ElapsedSeconds);
            }
        }
    }

    private static int MixSeed(int seed, int seat)
    {
        unchecked { return (int)((uint)seed * 0x9E3779B1u ^ ((uint)seat + 0x7F4A7C15u)); }
    }
}
