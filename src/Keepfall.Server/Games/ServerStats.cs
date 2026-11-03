using System.Diagnostics;

namespace Keepfall.Server.Games;

/// <summary>
/// What the tick loop measures about itself, written to the log once a minute: how many rooms there are (and how many are in a match), how long
/// one pass over all rooms took, how late passes started, and the process memory. For finding out how many matches a small host can carry.
/// </summary>
public sealed class ServerStats
{
    private readonly List<double> _pass = [];
    private readonly List<double> _gap = [];
    private long _lastStart;
    private long _lastLog = Stopwatch.GetTimestamp();

    /// <summary>One pass of the tick loop began; <paramref name="tickSeconds"/> is the period it is meant to keep.</summary>
    public void PassStarted(double tickSeconds)
    {
        long now = Stopwatch.GetTimestamp();
        if (_lastStart != 0) _gap.Add(Stopwatch.GetElapsedTime(_lastStart, now).TotalMilliseconds - tickSeconds * 1000);
        _lastStart = now;
    }

    public void PassEnded(long startedAt) => _pass.Add(Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds);

    /// <summary>The line for the log if <paramref name="everySeconds"/> have passed since the last one (and the lists start over), else null.</summary>
    public string? Report(double everySeconds, int rooms, int inMatch, int players)
    {
        if (everySeconds <= 0 || Stopwatch.GetElapsedTime(_lastLog).TotalSeconds < everySeconds) return null;
        _lastLog = Stopwatch.GetTimestamp();
        string line = $"Load: {rooms} rooms ({inMatch} in a match), {players} players connected; tick work avg {Avg(_pass):0.0} / p95 {P95(_pass):0.0} / max {Max(_pass):0.0} ms; " +
                      $"tick lateness p95 {P95(_gap):0.0} / max {Max(_gap):0.0} ms; memory {Process.GetCurrentProcess().WorkingSet64 / 1048576} MB (heap {GC.GetTotalMemory(false) / 1048576} MB)";
        _pass.Clear();
        _gap.Clear();
        return line;
    }

    private static double Avg(List<double> v) => v.Count == 0 ? 0 : v.Average();
    private static double Max(List<double> v) => v.Count == 0 ? 0 : v.Max();
    private static double P95(List<double> v)
    {
        if (v.Count == 0) return 0;
        var s = v.Order().ToArray();
        return s[Math.Min(s.Length - 1, (int)(s.Length * 0.95))];
    }
}
