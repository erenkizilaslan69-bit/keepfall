using Keepfall.Core.Economy;
using Keepfall.Core.Match;

namespace Keepfall.Core.Lobby;

public enum RoomPhase { Lobby, Preparation, War, Ended }

/// <summary>Player colours in seat order; Tiny Swords also has Black, kept spare.</summary>
/// <summary>The four player colours (a seat's colour is its number − 1) and black, which belongs to the bandits of the forest.</summary>
public enum PlayerColor { Blue, Red, Yellow, Purple, Black }

/// <summary>How well a bot plays (it also decides how fast it reacts).</summary>
public enum BotDifficulty { Easy, Medium }

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
    public double? WarSeconds { get; init; }
}

/// <summary>
/// A seat in a room. <see cref="Token"/> is the player's secret: it proves who they are when they
/// reconnect and must never be sent to anyone else. Other players only see the public fields.
/// </summary>
public sealed class RoomPlayer
{
    internal RoomPlayer(int seat, string token, string name, BotDifficulty? bot = null)
    {
        Seat = seat;
        Token = token;
        Name = name;
        Bot = bot;
        if (bot is not null)
        {
            // A bot is always at its seat and always ready; nobody holds its token but the server.
            Ready = true;
            Connections = 1;
        }
    }

    /// <summary>The bot's difficulty; null for a human.</summary>
    public BotDifficulty? Bot { get; }
    public bool IsBot => Bot is not null;

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
        return Game.TakeNotifications(player.CastleKey).Select(n =>
        {
            var other = PlayerOfCastle(n.OtherPlayer);
            return n.Kind switch
            {
                NotificationKind.ScoutedBy => $"{ColorGenitive(other?.Color)} gözcüsü kaleni gözetledi.",
                // Who, and nothing else: no size, no unit types.
                NotificationKind.ArmyIncoming => $"{ColorAblative(other?.Color)} bir ordu yaklaşıyor!",
                NotificationKind.BattleFought => BattleText(player, n.BattleId),
                NotificationKind.Eliminated => other == player
                    ? "Kalen düştü, elendin. Artık izleyicisin."
                    : $"{other?.Name ?? "Bir oyuncu"} ({ColorName(other?.Color)}) elendi.",
                _ => n.Kind.ToString(),
            };
        }).ToList();
    }

    private string BattleText(RoomPlayer player, int? battleId)
    {
        var report = Game!.BattlesOf(player.CastleKey).FirstOrDefault(b => b.Id == battleId);
        if (report is null) return "Savaş oldu.";
        if (report.Kind == BattleKind.Camp)
            return report.Winner == BattleWinner.Attacker ? "Haydut kampını temizledin! Ödül ordun eve dönünce gelir."
                : report.Winner == BattleWinner.Draw ? "Haydut kampıyla savaş berabere bitti." : "Haydut kampına yenildin.";
        bool attacking = report.Attacker == player.CastleKey;
        var other = PlayerOfCastle(attacking ? report.Defender : report.Attacker);
        string them = ColorName(other?.Color);
        if (report.Kind == BattleKind.Field)
        {
            bool won = report.Winner == (attacking ? BattleWinner.Attacker : BattleWinner.Defender);
            return report.Winner == BattleWinner.Draw ? $"Yolda {them} ordusuyla çarpıştın: berabere."
                : won ? $"Yolda {them} ordusunu yendin!" : $"Yolda {them} ordusuna yenildin.";
        }
        int damage = (int)Math.Floor(report.CastleDamage + 1e-9); // same rounding as the panel
        return (attacking, report.Winner) switch
        {
            (true, BattleWinner.Attacker) => $"{them} kalesine saldırın kazandı: {damage} kale hasarı.",
            (true, BattleWinner.Defender) => $"{them} kalesine saldırın püskürtüldü.",
            (true, _) => $"{them} kalesine saldırı berabere bitti.",
            (false, BattleWinner.Attacker) => $"{them} saldırısı savunmanı yendi: kalen {damage} hasar aldı.",
            (false, BattleWinner.Defender) => $"{them} saldırısını püskürttün!",
            _ => $"{them} saldırısı berabere bitti.",
        };
    }

    public static string ColorName(PlayerColor? color) => color switch
    {
        PlayerColor.Blue => "Mavi",
        PlayerColor.Red => "Kırmızı",
        PlayerColor.Yellow => "Sarı",
        PlayerColor.Purple => "Mor",
        PlayerColor.Black => "Siyah",
        _ => "?",
    };

    /// <summary>"Mavi'den", "Kırmızı'dan", "Sarı'dan", "Mor'dan".</summary>
    public static string ColorAblative(PlayerColor? color) => color switch
    {
        PlayerColor.Blue => "Mavi'den",
        PlayerColor.Red => "Kırmızı'dan",
        PlayerColor.Yellow => "Sarı'dan",
        PlayerColor.Purple => "Mor'dan",
        PlayerColor.Black => "Siyah'tan",
        _ => "Bir rakipten",
    };

    /// <summary>"Mavi'nin", "Kırmızı'nın", "Sarı'nın", "Mor'un".</summary>
    public static string ColorGenitive(PlayerColor? color) => color switch
    {
        PlayerColor.Blue => "Mavi'nin",
        PlayerColor.Red => "Kırmızı'nın",
        PlayerColor.Yellow => "Sarı'nın",
        PlayerColor.Purple => "Mor'un",
        PlayerColor.Black => "Siyah'ın",
        _ => "Bir rakibin",
    };

    /// <summary>All players ready (and connected), enough of them, still in the lobby.</summary>
    public bool CanStart =>
        Phase == RoomPhase.Lobby && _players.Count >= Options.MinPlayers && _players.All(p => p.Ready && p.Connected)
        && _players.Any(p => !p.IsBot);

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
            changed = _players.RemoveAll(p => !p.IsBot && !p.Connected && nowUtc - p.DisconnectedAtUtc > Options.LobbyGrace) > 0;
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
        _players.Where(p => !p.IsBot).All(p => !p.Connected && nowUtc - p.DisconnectedAtUtc > after);

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
        if (_players.Count < Options.MinPlayers) return CommandResult.Fail($"En az {Options.MinPlayers} oyuncu gerekiyor (botlar da sayılır).");
        if (!_players.All(x => x.Ready && x.Connected)) return CommandResult.Fail("Herkes hazır değil.");
        Game = new GameState(_rules, _players.Select(x => x.CastleKey), Options.PrepSeconds, Options.WarSeconds);
        Phase = RoomPhase.Preparation;
        return CommandResult.Success;
    });

    /// <summary>The host seats a bot in the first empty seat. It gets its colour's name ("Bot Kırmızı") and is ready at once.</summary>
    public CommandResult AddBot(string token, BotDifficulty difficulty) => InLobby(token, p =>
    {
        if (p.Seat != HostSeat) return CommandResult.Fail("Bot eklemek sadece odayı kuran için.");
        if (_players.Count >= Options.MaxPlayers) return CommandResult.Fail("Boş koltuk yok.");
        int seat = Enumerable.Range(1, Options.MaxPlayers).First(s => _players.All(x => x.Seat != s));
        var bot = new RoomPlayer(seat, Tokens.NewPlayerToken(), $"Bot {ColorName((PlayerColor)(seat - 1))}", difficulty);
        _players.Add(bot);
        _players.Sort((a, b) => a.Seat.CompareTo(b.Seat));
        return CommandResult.Success;
    });

    public CommandResult RemoveBot(string token, int seat) => InLobby(token, p =>
    {
        if (p.Seat != HostSeat) return CommandResult.Fail("Botu sadece odayı kuran çıkarabilir.");
        if (_players.FirstOrDefault(x => x.Seat == seat && x.IsBot) is not { } bot) return CommandResult.Fail("O koltukta bot yok.");
        _players.Remove(bot);
        return CommandResult.Success;
    });

    // ---- match commands ----------------------------------------------------------------------

    /// <summary>An economy command from <paramref name="token"/>; it can only reach their own castle.</summary>
    public CommandResult Execute(string token, GameCommand command)
    {
        if (Find(token) is not { } player) return NotInRoom;
        if (Phase is not (RoomPhase.Preparation or RoomPhase.War)) return CommandResult.Fail("Bu komut sadece maç sırasında kullanılabilir.");
        return Game!.Execute(player.CastleKey, command);
    }

    public CommandResult SetSpeed(string token, int speed)
    {
        if (Find(token) is not { } player) return NotInRoom;
        if (!Options.AllowSpeedControl) return CommandResult.Fail("Hız ayarı kapalı.");
        if (player.Seat != HostSeat) return CommandResult.Fail("Hızı sadece odayı kuran değiştirebilir.");
        if (Phase is not (RoomPhase.Preparation or RoomPhase.War)) return CommandResult.Fail("Hız sadece maç sırasında değiştirilebilir.");
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

    /// <summary>Advances the shared clock; returns true on the tick the match ends.</summary>
    public bool Tick(double dt)
    {
        if (Phase is not (RoomPhase.Preparation or RoomPhase.War)) return false;
        for (int i = 0; i < Speed && Game!.Phase != MatchPhase.Ended; i++) Game.Tick(dt);
        Phase = Game!.Phase switch
        {
            MatchPhase.Preparation => RoomPhase.Preparation,
            MatchPhase.War => RoomPhase.War,
            _ => RoomPhase.Ended,
        };
        return Phase == RoomPhase.Ended;
    }

    public bool IsEliminated(RoomPlayer player) => Game?.IsEliminated(player.CastleKey) ?? false;

    /// <summary>The match is on, bots are still in it, and every human has fallen: the host may then end it early.</summary>
    public bool AllHumansOut =>
        Phase is RoomPhase.Preparation or RoomPhase.War && Game is not null
        && _players.Any(p => p.IsBot) && _players.Where(p => !p.IsBot).All(IsEliminated);

    /// <summary>
    /// The host ends a match nobody human is still playing: the rest of the time is simulated at once
    /// (<paramref name="beforeTick"/> runs before every step, so the bots keep playing by the same rules).
    /// Returns once the match is over.
    /// </summary>
    public CommandResult FinishMatch(string token, double dt, Action<double> beforeTick)
    {
        if (Find(token) is not { } player) return NotInRoom;
        if (player.Seat != HostSeat) return CommandResult.Fail("Maçı sadece odayı kuran bitirebilir.");
        if (!AllHumansOut) return CommandResult.Fail("Maç, sadece tüm insan oyuncular elendikten sonra bitirilebilir.");
        while (Game!.Phase != MatchPhase.Ended)
        {
            beforeTick(dt);
            Game.Tick(dt);
        }
        Phase = RoomPhase.Ended;
        return CommandResult.Success;
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
        // The host is always a human.
        var next = _players.FirstOrDefault(p => !p.IsBot && p.Connected && p.Seat != HostSeat)
                   ?? _players.FirstOrDefault(p => !p.IsBot && p.Seat == HostSeat)
                   ?? _players.FirstOrDefault(p => !p.IsBot);
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
