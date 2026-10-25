namespace Keepfall.Bots;

/// <summary>One part of the bot's mind: looks at the pictures and wishes for commands.</summary>
public interface IBotModule
{
    void Think(BotContext ctx);
}
