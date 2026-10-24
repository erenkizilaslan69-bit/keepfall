using Keepfall.Core.Economy;
using Keepfall.Core.Match;

namespace Keepfall.Core.Lobby;

public enum RoomPhase { Lobby, Preparation, Ended }

/// <summary>Player colours in seat order; Tiny Swords also has Black, kept spare.</summary>
public enum PlayerColor { Blue, Red, Yellow, Purple }

public sealed record RoomOptions
{
    public int MinPlayers { get; init; } = 2;
    public int MaxPlayers { get; init; } = 4;
    public int MaxNameLength { get; init; } = 16;
    /// <summary>A player who drops out of the lobby keeps their seat this long.</summary>
    public TimeSpan LobbyGrace { get; init; } = TimeSpan.FromMinutes(2);
    /// <summary>A host who drops (e.g. refreshes the page) stays host this long before it passes on.</summary>
    public TimeSpan HostGrace { get; init; } = TimeSpan.FromSeconds(30);
    /// <summary>Dev-only ×N game speed, settable by the host.</summary>
    public bool AllowSpeedControl { get; init; }
    public double? PrepSeconds { get; init; }
}

/// <summary>
/// A seat in a room. <see cref="Token"/> is the player's secret: it proves who they are when they
/// reconnect and must never be sent to anyone else. Other players only see the public fields.
/// </summary>
public sealed class RoomPlayer
{
    internal RoomPlayer(int seat, string token, string name)
    {
        Seat = seat;
        Token = token;
        Name = name;
    }

    /// <summary>Public number 1–4; also decides the colour.</summary>
    public int Seat { get; }
    public string Token { get; }
    public string Name { get; internal set; }
    public PlayerColor Color => (PlayerColor)(Seat - 1);
    public bool Ready { get; internal set; }
    public int Connections { get; internal set; }
    public bool Connected => Connections > 0;
    public DateTime? DisconnectedAtUtc { get; internal set; }
    /// <summary>The player's key in <see cref="GameState"/>.</summary>
    public string CastleKey => Room.CastleKeyOf(Seat);
}

public sealed record JoinResult(RoomPlayer? Player, bool Rejoined, string? Error)
{
    public bool Ok => Player is not null;
}

/// <summary>
/// Lobby and match for 2–4 players. Every operation is checked here, independent of the network:
/// the caller must be in the room, the room must be in the right phase, and economy commands only
/// ever reach the caller's own castle.
/// </summary>
public sealed class Room
{
    private readonly List<RoomPlayer> _players = [];
    private readonly GameRules _rules;

    public Room(string code, GameRules rules, RoomOptions? options = null)
    {
        Code = code;
        _rules = rules;
        Options = options ?? new RoomOptions();
    }

    public string Code { get; }
    public RoomOptions Options { get; }
    public RoomPhase Phase { get; private set; } = RoomPhase.Lobby;
    public IReadOnlyList<RoomPlayer> Players => _players;
    public int HostSeat { get; private set; }
    public RoomPlayer? Host => _players.FirstOrDefault(p => p.Seat == HostSeat);
    public GameState? Game { get; private set; }
    public int Speed { get; private set; } = 1;

    public RoomPlayer? Find(string? token) =>
        token is null ? null : _players.FirstOrDefault(p => FixedTimeEquals(p.Token, token));

    public Castle? CastleOf(RoomPlayer player) => Game?.CastleOf(player.CastleKey);

    public RoomPlayer? PlayerOfCastle(string castleKey) => _players.FirstOrDefault(p => p.CastleKey == castleKey);

    /// <summary>Castle key of the player in <paramref name="seat"/> (for commands that name another player).</summary>
    public static string CastleKeyOf(int seat) => $"o{seat}";

    /// <summary>The player's new notifications as text, e.g. "Kırmızı'nın gözcüsü kaleni gözetledi."</summary>
    public IReadOnlyList<string> TakeNotifications(RoomPlayer player)
    {
        if (Game is null) return [];
        return Game.TakeNotifications(player.CastleKey).Select(n => n.Kind switch
        {
            NotificationKind.ScoutedBy => $"{ColorGenitive(PlayerOfCastle(n.OtherPlayer)?.Color)} gözcüsü kaleni gözetledi.",
            _ => n.Kind.ToString(),
        }).ToList();
    }

    /// <summary>"Mavi'nin", "Kırmızı'nın", "Sarı'nın", "Mor'un".</summary>
    public static string ColorGenitive(PlayerColor? color) => color switch
    {
        PlayerColor.Blue => "Mavi'nin",
        PlayerColor.Red => "Kırmızı'nın",
        PlayerColor.Yellow => "Sarı'nın",
        PlayerColor.Purple => "Mor'un",
        _ => "Bir rakibin",
    };

    /// <summary>All players ready (and connected), enough of them, still in the lobby.</summary>
    public bool CanStart =>
        Phase == RoomPhase.Lobby && _players.Count >= Options.MinPlayers && _players.All(p => p.Ready && p.Connected);

    // ---- joining and leaving -----------------------------------------------------------------

    /// <summary>
    /// Join or rejoin. A token from the same browser tab (<paramref name="remembered"/> false) always
    /// rejoins its seat. A token remembered from an earlier tab only does so while nobody is using that
    /// seat, so a second tab never takes over the first one's castle.
    /// </summary>
    public JoinResult Join(string? name, string? token, bool remembered, DateTime nowUtc)
    {
        if (Find(token) is { } existing && !(remembered && existing.Connected))
        {
            existing.Connections++;
            existing.DisconnectedAtUtc = null;
            if (Host is null) HostSeat = existing.Seat;
            return new JoinResult(existing, true, null);
        }

        if (Phase != RoomPhase.Lobby) return new JoinResult(null, false, "Maç başladı, yeni oyuncu katılamaz.");
        if (_players.Count >= Options.MaxPlayers) return new JoinResult(null, false, "Oda dolu.");

        int seat = Enumerable.Range(1, Options.MaxPlayers).First(s => _players.All(p => p.Seat != s));
        var player = new RoomPlayer(seat, Tokens.NewPlayerToken(), CleanName(name, seat)) { Connections = 1 };
        _players.Add(player);
        _players.Sort((a, b) => a.Seat.CompareTo(b.Seat));
        // A host who only refreshed keeps the room; Maintain hands it on after the grace period.
        if (Host is null) HostSeat = seat;
        return new JoinResult(player, false, null);
    }

    /// <summary>One of the player's connections closed.</summary>
    public void Disconnect(string token, DateTime nowUtc)
    {
        if (Find(token) is not { } player) return;
        player.Connections = Math.Max(0, player.Connections - 1);
        if (!player.Connected) player.DisconnectedAtUtc = nowUtc;
    }

    /// <summary>
    /// Periodic housekeeping; returns true if anything visible changed. In the lobby, seats of players
    /// gone longer than <see cref="RoomOptions.LobbyGrace"/> are freed. A host gone longer than
    /// <see cref="RoomOptions.HostGrace"/> hands the room to the next connected player.
    /// </summary>
    public bool Maintain(DateTime nowUtc)
    {
        bool changed = false;
        if (Phase == RoomPhase.Lobby)
            changed = _players.RemoveAll(p => !p.Connected && nowUtc - p.DisconnectedAtUtc > Options.LobbyGrace) > 0;
        if (Host is null || (!Host.Connected && nowUtc - Host.DisconnectedAtUtc > Options.HostGrace))
        {
            int before = HostSeat;
            PassHost();
            changed |= HostSeat != before;
        }
        return changed;
    }

    /// <summary>Nobody has been connected for <paramref name="after"/>.</summary>
    public bool IsAbandoned(DateTime nowUtc, TimeSpan after) =>
        _players.All(p => !p.Connected && nowUtc - p.DisconnectedAtUtc > after);

    // ---- lobby commands ----------------------------------------------------------------------

    public CommandResult SetName(string token, string? name) => InLobby(token, p =>
    {
        p.Name = CleanName(name, p.Seat);
        return CommandResult.Success;
    });

    public CommandResult SetReady(string token, bool ready) => InLobby(token, p =>
    {
        p.Ready = ready;
        return CommandResult.Success;
    });

    public CommandResult Start(string token) => InLobby(token, p =>
    {
        if (p.Seat != HostSeat) return CommandResult.Fail("Maçı sadece odayı kuran başlatabilir.");
        if (_players.Count < Options.MinPlayers) return CommandResult.Fail($"En az {Options.MinPlayers} oyuncu gerekiyor.");
        if (!_players.All(x => x.Ready && x.Connected)) return CommandResult.Fail("Herkes hazır değil.");
        Game = new GameState(_rules, _players.Select(x => x.CastleKey), Options.PrepSeconds);
        Phase = RoomPhase.Preparation;
        return CommandResult.Success;
    });

    // ---- match commands ----------------------------------------------------------------------

    /// <summary>An economy command from <paramref name="token"/>; it can only reach their own castle.</summary>
    public CommandResult Execute(string token, GameCommand command)
    {
        if (Find(token) is not { } player) return NotInRoom;
        if (Phase != RoomPhase.Preparation) return CommandResult.Fail("Bu komut sadece hazırlık sırasında kullanılabilir.");
        return Game!.Execute(player.CastleKey, command);
    }

    public CommandResult SetSpeed(string token, int speed)
    {
        if (Find(token) is not { } player) return NotInRoom;
        if (!Options.AllowSpeedControl) return CommandResult.Fail("Hız ayarı kapalı.");
        if (player.Seat != HostSeat) return CommandResult.Fail("Hızı sadece odayı kuran değiştirebilir.");
        if (Phase != RoomPhase.Preparation) return CommandResult.Fail("Hız sadece hazırlık sırasında değiştirilebilir.");
        if (speed is not (1 or 5 or 20)) return CommandResult.Fail("Geçersiz hız.");
        Speed = speed;
        return CommandResult.Success;
    }

    public CommandResult BackToLobby(string token)
    {
        if (Find(token) is not { } player) return NotInRoom;
        if (Phase != RoomPhase.Ended) return CommandResult.Fail("Lobiye ancak maç bitince dönülebilir.");
        if (player.Seat != HostSeat) return CommandResult.Fail("Lobiye dönüşü sadece odayı kuran başlatabilir.");
        Phase = RoomPhase.Lobby;
        Game = null;
        Speed = 1;
        foreach (var p in _players) p.Ready = false;
        return CommandResult.Success;
    }

    /// <summary>Advances the shared clock; returns true on the tick the preparation ends.</summary>
    public bool Tick(double dt)
    {
        if (Phase != RoomPhase.Preparation) return false;
        for (int i = 0; i < Speed && Game!.Phase == MatchPhase.Preparation; i++) Game.Tick(dt);
        if (Game!.Phase != MatchPhase.Ended) return false;
        Phase = RoomPhase.Ended;
        return true;
    }

    // ---- helpers -----------------------------------------------------------------------------

    private static readonly CommandResult NotInRoom = CommandResult.Fail("Bu odada değilsin.");

    private CommandResult InLobby(string token, Func<RoomPlayer, CommandResult> action)
    {
        if (Find(token) is not { } player) return NotInRoom;
        if (Phase != RoomPhase.Lobby) return CommandResult.Fail("Bu komut sadece lobide kullanılabilir.");
        return action(player);
    }

    /// <summary>To the first connected player; if nobody is connected, the host stays.</summary>
    private void PassHost()
    {
        var next = _players.FirstOrDefault(p => p.Connected && p.Seat != HostSeat)
                   ?? _players.FirstOrDefault(p => p.Seat == HostSeat)
                   ?? _players.FirstOrDefault();
        HostSeat = next?.Seat ?? 0;
    }

    private string CleanName(string? name, int seat)
    {
        var clean = new string((name ?? "").Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (clean.Length > Options.MaxNameLength) clean = clean[..Options.MaxNameLength].TrimEnd();
        return clean.Length == 0 ? $"Oyuncu {seat}" : clean;
    }

    private static bool FixedTimeEquals(string a, string b) =>
        System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(a), System.Text.Encoding.UTF8.GetBytes(b));
}
