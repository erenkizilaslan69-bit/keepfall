namespace Keepfall.Bots;

/// <summary>What a bot did, counted by itself (the bot-vs-bot report reads these to tell strategies apart).</summary>
public sealed class BotStats
{
    private readonly Dictionary<string, int> _counts = [];

    public IReadOnlyDictionary<string, int> Counts => _counts;
    public int this[string name] => _counts.GetValueOrDefault(name);
    public void Count(string name, int by = 1) => _counts[name] = _counts.GetValueOrDefault(name) + by;
    public void Max(string name, int value) => _counts[name] = Math.Max(_counts.GetValueOrDefault(name), value);
}
