using Keepfall.Core.Config;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>The "how to play" page's numbers: they come from the rules, so they change when the balance config does.</summary>
public class GuideViewTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    [Fact]
    public void The_guide_repeats_the_rules_it_was_made_from()
    {
        var g = GuideMapper.Of(Rules);

        Assert.Equal(Rules.Match.ShortModePrepSeconds, g.ShortPrepSeconds);
        Assert.Equal(Rules.Match.LongModeWarSeconds, g.LongWarSeconds);
        Assert.Equal(Rules.Scouting.MaxScouts, g.MaxScouts);
        Assert.Equal(Rules.Forest.Village.MinSoldiers, g.Village.MinSoldiers);
        Assert.Equal((Rules.Forest.Chest.IronMin, Rules.Forest.Chest.IronMax), (g.Chest.Iron.Min, g.Chest.Iron.Max));
        Assert.Equal(Rules.War.FallLootShare, g.FallLootShare);
        Assert.Equal(Rules.Economy.BuildingLevels.Count, g.Levels.Count);
        Assert.Equal(Rules.Units.Count, g.Units.Count);
        Assert.All(g.Units, u => Assert.Equal(Rules.MercenaryPrices.GetValueOrDefault(u.Id), u.Price ?? 0));
    }

    [Fact]
    public void Who_beats_whom_follows_the_counter_table()
    {
        var g = GuideMapper.Of(Rules);
        var sword = g.Units.Single(u => u.Id == "kilicli");
        var archer = g.Units.Single(u => u.Id == "okcu");

        Assert.Contains("Mızrakçı", sword.Strong); // swords beat spears …
        Assert.Contains("Okçu", sword.Weak);       // … and are weak against archers
        Assert.Contains("Kalkanlı", archer.Weak);  // archers do little against shields
        Assert.DoesNotContain(sword.Name, sword.Strong);
    }
}
