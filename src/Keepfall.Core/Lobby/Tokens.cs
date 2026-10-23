using System.Security.Cryptography;

namespace Keepfall.Core.Lobby;

/// <summary>Unguessable identifiers from the OS cryptographic random generator.</summary>
public static class Tokens
{
    /// <summary>Letters that cannot be mistaken for each other when read aloud or typed (no I, O, 0, 1).</summary>
    public const string RoomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    public const int RoomCodeLength = 4;

    /// <summary>A secret player token: 256 random bits, base64url.</summary>
    public static string NewPlayerToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>A short room code, e.g. "KXRM". It is public (shared in links), so it is not a secret.</summary>
    public static string NewRoomCode() =>
        string.Create(RoomCodeLength, 0, (span, _) =>
        {
            for (int i = 0; i < span.Length; i++)
                span[i] = RoomCodeAlphabet[RandomNumberGenerator.GetInt32(RoomCodeAlphabet.Length)];
        });

    /// <summary>Upper-cases and trims user input; null if it cannot be a room code.</summary>
    public static string? NormalizeRoomCode(string? input)
    {
        var code = input?.Trim().ToUpperInvariant();
        return code is { Length: RoomCodeLength } && code.All(RoomCodeAlphabet.Contains) ? code : null;
    }
}
