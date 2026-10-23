using Keepfall.Core;
using Keepfall.Core.Combat;
using Keepfall.Core.Units;

namespace Keepfall.BattleSim;

public enum BudgetMode
{
    /// <summary>Both armies have the same number of soldiers (people are the real cost).</summary>
    People,
    /// <summary>Both armies cost about the same in resources (wood equivalent).</summary>
    Resources,
}

public sealed class ArmyGenerator(GameRules rules)
{
    private const double MonoArmyChance = 0.15;

    private readonly double _averageValue = rules.Units.Average(rules.ResourceValueInWood);

    /// <summary>
    /// A random army. <paramref name="size"/> is the headcount in People mode, or the budget expressed
    /// as "size × average unit value" in Resources mode. Archer target priority is random too
    /// (front row or one preferred type), so back-row shooting shows up in the statistics.
    /// </summary>
    public ArmySetup Random(Random rng, int size, BudgetMode mode, string name)
    {
        var weights = RandomWeights(rng);
        int pick = rng.Next(rules.Units.Count + 1);
        var army = new ArmySetup(name)
        {
            Targeting = pick == rules.Units.Count ? TargetPriority.Front : TargetPriority.Prefer(rules.Units[pick]),
        };
        if (mode == BudgetMode.People)
        {
            for (int i = 0; i < size; i++) army.Add(Sample(rng, weights, _ => true)!, 1);
            return army;
        }

        double remaining = size * _averageValue;
        while (true)
        {
            var type = Sample(rng, weights, t => rules.ResourceValueInWood(t) <= remaining + 1e-9);
            if (type is null) break;
            army.Add(type, 1);
            remaining -= rules.ResourceValueInWood(type);
        }
        return army;
    }

    /// <summary>An army with exactly these proportions (weights need not sum to 1).</summary>
    public ArmySetup FromWeights(double[] weights, int size, BudgetMode mode, string name)
    {
        var army = new ArmySetup(name);
        double total = weights.Sum();
        if (mode == BudgetMode.People)
        {
            // Largest-remainder rounding so the headcount is exact.
            var exact = weights.Select(w => w / total * size).ToArray();
            var counts = exact.Select(x => (int)Math.Floor(x)).ToArray();
            int left = size - counts.Sum();
            foreach (int i in Enumerable.Range(0, weights.Length).OrderByDescending(i => exact[i] - counts[i]).Take(left))
                counts[i]++;
            for (int i = 0; i < counts.Length; i++) army.Add(rules.Units[i], counts[i]);
            return army;
        }

        double budget = size * _averageValue;
        for (int i = 0; i < weights.Length; i++)
            army.Add(rules.Units[i], (int)Math.Round(budget * weights[i] / total / rules.ResourceValueInWood(rules.Units[i])));
        return army;
    }

    private double[] RandomWeights(Random rng)
    {
        var w = new double[rules.Units.Count];
        if (rng.NextDouble() < MonoArmyChance)
        {
            w[rng.Next(w.Length)] = 1;
            return w;
        }
        // Squaring skews the mix so lopsided armies are common, not just even blends.
        for (int i = 0; i < w.Length; i++) { double u = rng.NextDouble(); w[i] = u * u; }
        return w;
    }

    private UnitType? Sample(Random rng, double[] weights, Func<UnitType, bool> allowed)
    {
        double total = 0;
        for (int i = 0; i < weights.Length; i++) if (allowed(rules.Units[i])) total += weights[i];
        if (total <= 0)
        {
            // The preferred types no longer fit the budget; fall back to anything that does.
            var fits = rules.Units.Where(allowed).ToList();
            return fits.Count == 0 ? null : fits[rng.Next(fits.Count)];
        }
        double r = rng.NextDouble() * total;
        for (int i = 0; i < weights.Length; i++)
        {
            if (!allowed(rules.Units[i])) continue;
            r -= weights[i];
            if (r <= 0) return rules.Units[i];
        }
        return rules.Units.Last(allowed);
    }
}
