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
        // Two tiers (docs/kufur-filtresi.md). Hate speech is masked here, always, for everybody: no setting of the config or of a player switches it
        // off. Ordinary swearing is left in the text: the RECEIVER's game masks it by the receiver's own setting (on by default), so each player sees
        // what they chose to see. (envoy.profanityFilter of the config no longer decides anything here: the hate tier cannot be switched off.)
        return new(true, MaskHate(text), null);
    }

    // A short list, on purpose: words that begin with these (Turkish is agglutinative: "siktirgit"), and words that must stand alone because they are
    // also the start of harmless ones ("ass" / "class", "aq" / "aquarium"). Two tiers: slurs (always masked) and swearing (the receiver's choice).
    private static readonly string[] HateStems = ["ibne", "puşt", "pust", "nigg", "faggot"];
    private static readonly string[] MildStems =
    [
        "orospu", "orosbu", "siktir", "sikeyim", "sikerim", "sikik", "sikici", "yarrak", "yarak", "amcık", "amcik", "amına", "amina", "amını", "aminı",
        "piç", "gavat", "kahpe", "pezevenk", "şerefsiz", "serefsiz", "götveren", "gotveren",
        "fuck", "shit", "bitch", "asshole", "cunt", "whore", "bastard", "slut", "wanker", "twat", "dickhead",
    ];
    private static readonly string[] MildWhole = ["amk", "aq", "oç", "dick", "cock", "pussy", "ass", "götü"];

    private static readonly Regex Profanity = new(
        @"(?<![\p{L}\p{N}])(?:(?:" + string.Join("|", MildStems.Select(Letters)) + @")\p{L}*|(?:" + string.Join("|", MildWhole.Select(Letters)) + @")(?![\p{L}\p{N}]))",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex HateInline = new(
        @"(?<![\p{L}\p{N}])(?:" + string.Join("|", HateStems.Select(Letters)) + @")\p{L}*",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>A word as a pattern that takes the Turkish dotted and dotless i for either.</summary>
    private static string Letters(string word) => string.Concat(word.Select(c => c is 'i' or 'ı' ? "[iıİI]" : Regex.Escape(c.ToString())));

    /// <summary>
    /// The other languages: one list per language in Profanity/*.txt (embedded; curated from the CC BY 4.0 LDNOOBW lists, see LICENSE-LDNOOBW.md). `word` is a whole word, `stem*` a word
    /// that begins with it; Chinese, Japanese and Korean have no spaces between words, so their entries match anywhere (2 characters or more).
    /// </summary>
    private static readonly Regex OtherLanguages = BuildOtherLanguages(hate: false);
    /// <summary>The same for the hate tier (Profanity/hate/*.txt).</summary>
    private static readonly Regex HateOther = BuildOtherLanguages(hate: true);

    private static Regex BuildOtherLanguages(bool hate)
    {
        var wholes = new List<string>(); var stems = new List<string>(); var cjk = new List<string>();
        var asm = typeof(EnvoyMessage).Assembly;
        foreach (var resource in asm.GetManifestResourceNames().Where(n => n.Contains(".Profanity.") && n.EndsWith(".txt", StringComparison.Ordinal)).OrderBy(n => n, StringComparer.Ordinal))
        {
            if (resource.Contains(".Profanity.hate.", StringComparison.Ordinal) != hate) continue;
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
        if (parts.Count == 0) parts.Add("(?!)");
        return new Regex(string.Join("|", parts), RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    }

    private static string Stars(System.Text.RegularExpressions.Match m) => new('*', m.Length);

    /// <summary>The hate tier only (slurs, death wishes; every language): becomes stars of the same length. Applied to every envoy message, always.</summary>
    public static string MaskHate(string text) => HateOther.Replace(HateInline.Replace(text, Stars), Stars);

    /// <summary>The swearing tier only: what a receiver's game masks by their own setting (the client has its own copy; this one is for tests and tools).</summary>
    public static string MaskMild(string text) => OtherLanguages.Replace(Profanity.Replace(text, Stars), Stars);

    /// <summary>Both tiers: every word of the lists becomes stars (same length). Player names (everybody sees them, nobody chose to).</summary>
    public static string Mask(string text) => MaskMild(MaskHate(text));
}
