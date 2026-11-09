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
        for (int i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (char.IsHighSurrogate(ch) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1])) { i++; continue; }
            var category = char.GetUnicodeCategory(ch);
            if (char.IsSurrogate(ch)) return new(false, null, "Mesajda geçersiz karakter var.");
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

    /// <summary>
    /// The other languages: one list per language in Profanity/*.txt (embedded; curated from the CC BY 4.0 LDNOOBW lists, see LICENSE-LDNOOBW.md). `word` is a whole word, `stem*` a word
    /// that begins with it; Chinese, Japanese and Korean have no spaces between words, so their entries match anywhere (2 characters or more).
    /// </summary>
    private static readonly Regex OtherLanguages = BuildOtherLanguages();

    private static Regex BuildOtherLanguages()
    {
        var wholes = new List<string>(); var stems = new List<string>(); var cjk = new List<string>();
        var asm = typeof(EnvoyMessage).Assembly;
        foreach (var resource in asm.GetManifestResourceNames().Where(n => n.Contains(".Profanity.") && n.EndsWith(".txt", StringComparison.Ordinal)).OrderBy(n => n, StringComparer.Ordinal))
        {
            var lang = resource[..^4].Split('.')[^1];
            using var reader = new StreamReader(asm.GetManifestResourceStream(resource)!);
            for (string? line = reader.ReadLine(); line is not null; line = reader.ReadLine())
            {
                line = line.Trim();
                if (line.Length == 0 || line[0] == '#') continue;
                if (lang is "zh" or "ja" or "ko") { if (line.Length >= 2) cjk.Add(Regex.Escape(line)); continue; }
                bool stem = line.EndsWith('*');
                var word = stem ? line[..^1] : line;
                if (word.Length < 3) continue; // two letters are too often a word of another language
                var pattern = Letters(word.ToLowerInvariant()).Replace(" ", @"\s+").Replace("е", "[её]").Replace("ё", "[её]");
                (stem ? stems : wholes).Add(pattern);
            }
        }
        string ByLength(IEnumerable<string> list) => string.Join("|", list.Distinct().OrderByDescending(p => p.Length));
        var parts = new List<string>();
        if (stems.Count > 0 || wholes.Count > 0)
            parts.Add(@"(?<![\p{L}\p{N}])(?:(?:" + ByLength(stems.Count > 0 ? stems : ["(?!)"]) + @")\p{L}*|(?:" + ByLength(wholes.Count > 0 ? wholes : ["(?!)"]) + @")(?![\p{L}\p{N}]))");
        if (cjk.Count > 0) parts.Add("(?:" + ByLength(cjk) + ")");
        return new Regex(string.Join("|", parts), RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    }

    /// <summary>Every swear word of the lists (Turkish, English, and the other languages) becomes stars (same length).</summary>
    public static string Mask(string text) => OtherLanguages.Replace(Profanity.Replace(text, m => new string('*', m.Length)), m => new string('*', m.Length));
}
