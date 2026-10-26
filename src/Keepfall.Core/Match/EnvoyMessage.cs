using System.Globalization;
using System.Text.RegularExpressions;
using Keepfall.Core.Economy;

namespace Keepfall.Core.Match;

/// <summary>What an envoy's message may be: plain text of limited length, without control characters (the server checks this, whatever the client sends).</summary>
public static class EnvoyMessage
{
    public readonly record struct Checked(bool Ok, string? Text, string? Error);

    /// <summary>Trims the message and checks it; <see cref="Checked.Text"/> is null for no message at all.</summary>
    public static Checked Check(string? message, EnvoyRules rules)
    {
        string text = (message ?? "").Trim();
        if (text.Length == 0) return new(true, null, null);
        if (text.Length > rules.MaxMessageLength) return new(false, null, $"Mesaj en fazla {rules.MaxMessageLength} karakter olabilir.");
        foreach (var ch in text)
        {
            var category = char.GetUnicodeCategory(ch);
            if (char.IsControl(ch) || category is UnicodeCategory.Format or UnicodeCategory.LineSeparator or UnicodeCategory.ParagraphSeparator
                or UnicodeCategory.PrivateUse or UnicodeCategory.OtherNotAssigned)
                return new(false, null, "Mesajda satır sonu, denetim ya da görünmez karakter olamaz.");
        }
        return new(true, rules.ProfanityFilter ? Mask(text) : text, null);
    }

    // A short list, on purpose: words that begin with these (Turkish is agglutinative: "siktirgit"), and words that must stand alone because they are
    // also the start of harmless ones ("ass" / "class", "aq" / "aquarium").
    private static readonly string[] Stems =
    [
        "orospu", "orosbu", "siktir", "sikeyim", "sikerim", "sikik", "sikici", "yarrak", "yarak", "amcık", "amcik", "amına", "amina", "amını", "aminı",
        "piç", "gavat", "ibne", "puşt", "pust", "kahpe", "pezevenk", "şerefsiz", "serefsiz", "götveren", "gotveren",
        "fuck", "shit", "bitch", "asshole", "cunt", "whore", "bastard", "slut", "nigg", "faggot", "wanker", "twat", "dickhead",
    ];
    private static readonly string[] Whole = ["amk", "aq", "oç", "dick", "cock", "pussy", "ass", "götü"];

    private static readonly Regex Profanity = new(
        @"(?<![\p{L}\p{N}])(?:(?:" + string.Join("|", Stems.Select(Letters)) + @")\p{L}*|(?:" + string.Join("|", Whole.Select(Letters)) + @")(?![\p{L}\p{N}]))",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>A word as a pattern that takes the Turkish dotted and dotless i for either.</summary>
    private static string Letters(string word) => string.Concat(word.Select(c => c is 'i' or 'ı' ? "[iıİI]" : Regex.Escape(c.ToString())));

    /// <summary>Every swear word of the list becomes stars (same length).</summary>
    public static string Mask(string text) => Profanity.Replace(text, m => new string('*', m.Length));
}
