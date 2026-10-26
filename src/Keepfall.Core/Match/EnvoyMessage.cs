using System.Globalization;
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
        return new(true, text, null);
    }
}
