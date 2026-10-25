using System.Diagnostics;
using Keepfall.Core;
using Keepfall.Core.Combat;
using Keepfall.Core.Units;

namespace Keepfall.BattleSim;

public sealed record BalanceOptions
{
    public int Matches { get; init; } = 5000;
    public int MinSize { get; init; } = 10;
    public int MaxSize { get; init; } = 30;
    public BudgetMode Budget { get; init; } = BudgetMode.People;
    public int Seed { get; init; } = 12345;
    public int DuelSize { get; init; } = 10;
    public int DuelRuns { get; init; } = 200;
    public int PoolSize { get; init; } = 60;
    public int PoolArmySize { get; init; } = 20;
    public int PoolRepeats { get; init; } = 4;
    /// <summary>Soldier win rate at or above this is flagged as too strong (and 1 - this as too weak).</summary>
    public double StrongThreshold { get; init; } = 0.55;
    /// <summary>Target band for how many disadvantaged units it takes to beat DuelSize advantaged ones.</summary>
    public int CounterBreakEvenMin { get; init; } = 13;
    public int CounterBreakEvenMax { get; init; } = 15;
    /// <summary>Back-row test: this unit holds the front, the tested unit stands behind it.</summary>
    public string BackRowFrontUnit { get; init; } = "kalkanli";
    public int BackRowCount { get; init; } = 5;
    /// <summary>Back-row test variant: how many of the opponent's X are swapped for archers.</summary>
    public int BackRowEnemyArchers { get; init; } = 2;
    /// <summary>A target priority beating another above this rate is flagged.</summary>
    public double TargetDominanceThreshold { get; init; } = 0.65;
}

/// <summary>Runs thousands of battles and prints which units over- or under-perform.</summary>
public sealed class BalanceReport(GameRules rules, BalanceOptions options)
{
    private readonly BattleSimulator _simulator = new(rules);
    private readonly ArmyGenerator _generator = new(rules);
    private IReadOnlyList<UnitType> Units => rules.Units;

    // Out-of-target results collected by the sections, printed in the summary.
    private readonly List<string> _findings = [];

    public void Run()
    {
        var clock = Stopwatch.StartNew();
        string budgetText = options.Budget == BudgetMode.People ? "eşit kişi sayısı" : "eşit kaynak değeri";
        Console.WriteLine($"Bütçe: {budgetText} · tohum: {options.Seed}");
        Console.WriteLine();

        PrintUnitTable();
        PrintDuels();
        var stats = PrintTournament();
        PrintPool();
        PrintBackRow();
        PrintTargeting();
        PrintCamps();
        PrintSummary(stats);

        Console.WriteLine($"Süre: {clock.Elapsed.TotalSeconds:0.0} sn");
    }

    // ---- 1. Static numbers -------------------------------------------------------------------

    private void PrintUnitTable()
    {
        Heading("1. Birlikler (ayar dosyasından)");
        var t = new Table("Birlik", "Can", "Hasar", "Aralık", "DPS", "Sıra", "Menzil", "Kaynak*", "Can×DPS");
        foreach (var u in Units)
        {
            t.Add(u.Name, F(u.Hp, "0"), F(u.Damage, "0.#"), F(u.AttackInterval, "0.0#") + "s", F(u.Dps, "0.00"),
                u.DefaultRow == Row.Front ? "ön" : "arka", u.Range == AttackRange.Melee ? "yakın" : "uzak",
                F(rules.ResourceValueInWood(u), "0.00"), F(u.Hp * u.Dps, "0"));
        }
        t.Print();
        Console.WriteLine("  * Kaynak = odun karşılığı (demir ve yemek, üretim hızına göre oduna çevrilir).");
        Console.WriteLine();
    }

    // ---- 2. Pure duels -----------------------------------------------------------------------

    private void PrintDuels()
    {
        int n = options.DuelSize;
        Heading($"2. Düello: {n} satır birliği vs {n} sütun birliği — satırın kazanma oranı");
        var header = new[] { "" }.Concat(Units.Select(u => u.Name)).ToArray();
        var winTable = new Table(header);
        var breakEven = new Table(header);
        var breakEvens = new int?[Units.Count, Units.Count];

        foreach (var row in Units)
        {
            var wins = new List<string> { row.Name };
            var needed = new List<string> { row.Name };
            foreach (var col in Units)
            {
                double rate = DuelWinRate(row, n, col, n, salt: row.Index * 31 + col.Index);
                wins.Add(row == col ? "—" : Pct(rate));
                if (row == col) { needed.Add("—"); continue; }
                var be = breakEvens[row.Index, col.Index] = BreakEven(row, col);
                needed.Add(be?.ToString() ?? $">{BreakEvenLimit}");
            }
            winTable.Add(wins.ToArray());
            breakEven.Add(needed.ToArray());
        }
        winTable.Print();
        Console.WriteLine();
        Console.WriteLine($"   {n} satır birliğini yenmek (≥%50) için gereken sütun birliği sayısı:");
        breakEven.Print();
        Console.WriteLine($"   ({n}'dan küçük = sütun birliği daha güçlü; {n}'dan büyük = satır birliği daha güçlü.)");
        Console.WriteLine();
        PrintCounterCheck(breakEvens);
    }

    /// <summary>
    /// For every advantaged pairing in the counter matrix: how many of the disadvantaged unit it takes
    /// to beat <see cref="BalanceOptions.DuelSize"/> of the advantaged one, checked against the target band.
    /// </summary>
    private void PrintCounterCheck(int?[,] breakEvens)
    {
        int n = options.DuelSize;
        string band = $"{options.CounterBreakEvenMin}–{options.CounterBreakEvenMax}";
        Console.WriteLine($"   Karşılık kontrolü: {n} avantajlı birliği yenmek için gereken dezavantajlı birlik (hedef {band})");
        var t = new Table("Avantajlı", "Karşısındaki", "Çarpan", "Başabaş", "Durum") { LeftAlignedFrom = 1 };
        foreach (var a in Units)
            foreach (var d in Units)
            {
                // "Advantaged" = deals more to them than they deal back.
                double mine = rules.Counters.Get(a, d), theirs = rules.Counters.Get(d, a);
                if (a == d || mine <= theirs) continue;
                int? be = breakEvens[a.Index, d.Index];
                bool ok = be >= options.CounterBreakEvenMin && be <= options.CounterBreakEvenMax;
                string text = be?.ToString() ?? $">{BreakEvenLimit}";
                t.Add(a.Name, d.Name, $"×{mine:0.##} / ×{theirs:0.##}", $"{n} : {text}", ok ? "hedefte" : "HEDEF DIŞI");
                if (!ok)
                    _findings.Add($"Karşılık: {a.Name} → {d.Name} başabaş {n} : {text} (hedef {band}).");
            }
        t.Print();
        Console.WriteLine();
    }

    private int BreakEvenLimit => options.DuelSize * 4;

    /// <summary>Smallest number of <paramref name="attacker"/> that beats DuelSize <paramref name="defender"/> at least half the time; null if above the search limit.</summary>
    private int? BreakEven(UnitType defender, UnitType attacker)
    {
        int n = options.DuelSize, lo = 1, hi = BreakEvenLimit;
        int salt = 1000 + defender.Index * 31 + attacker.Index;
        if (1 - DuelWinRate(defender, n, attacker, hi, salt) < 0.5) return null;
        while (lo < hi)
        {
            int mid = (lo + hi) / 2;
            if (1 - DuelWinRate(defender, n, attacker, mid, salt) >= 0.5) hi = mid; else lo = mid + 1;
        }
        return lo;
    }

    /// <summary>Win rate of <paramref name="a"/>×countA against <paramref name="b"/>×countB, draws count half.</summary>
    private double DuelWinRate(UnitType a, int countA, UnitType b, int countB, int salt)
    {
        var armyA = new ArmySetup("A").Add(a, countA);
        var armyB = new ArmySetup("B").Add(b, countB);
        var scores = RunParallel(options.DuelRuns, salt, rng => Score(_simulator.Simulate(armyA, armyB, rng)));
        return scores.Average();
    }

    // ---- 3. Random tournament ----------------------------------------------------------------

    private sealed class TypeStats
    {
        public double SoldierScore, SoldierCount;
        public double DominantScore; public int DominantCount;
        public int Initial, Survivors;
        public double Damage;
        public double ShareSum; public int ArmyCount;
        // Armies with at least one melee unit in the front row ("screened").
        public double ScreenedSoldierScore, ScreenedSoldierCount, ScreenedArmyScore; public int ScreenedArmyCount;
        // For Pearson correlation of (share A − share B) with A's result.
        public double SumX, SumY, SumXX, SumYY, SumXY; public int N;

        public double SoldierWinRate => SoldierCount == 0 ? double.NaN : SoldierScore / SoldierCount;
        public double DominantWinRate => DominantCount == 0 ? double.NaN : DominantScore / DominantCount;
        public double Correlation
        {
            get
            {
                double cov = SumXY / N - SumX / N * (SumY / N);
                double vx = SumXX / N - Math.Pow(SumX / N, 2), vy = SumYY / N - Math.Pow(SumY / N, 2);
                return vx <= 0 || vy <= 0 ? double.NaN : cov / Math.Sqrt(vx * vy);
            }
        }
    }

    private TypeStats[] PrintTournament()
    {
        Heading($"3. Rastgele turnuva: {options.Matches} maç, ordu büyüklüğü {options.MinSize}–{options.MaxSize}");
        var matches = RunParallel(options.Matches, 2_000_000, rng =>
        {
            int size = rng.Next(options.MinSize, options.MaxSize + 1);
            var a = _generator.Random(rng, size, options.Budget, "A");
            var b = _generator.Random(rng, size, options.Budget, "B");
            return (a, b, result: _simulator.Simulate(a, b, rng));
        });

        var stats = Units.Select(_ => new TypeStats()).ToArray();
        int draws = 0;
        double totalSeconds = 0;
        foreach (var (a, b, result) in matches)
        {
            double scoreA = Score(result);
            if (result.Outcome == BattleOutcome.Draw) draws++;
            totalSeconds += result.DurationSeconds;
            foreach (var u in Units)
            {
                var s = stats[u.Index];
                double shareA = (double)a.CountOf(u) / a.TotalCount, shareB = (double)b.CountOf(u) / b.TotalCount;
                Accumulate(s, a.CountOf(u), shareA, scoreA, HasMeleeFront(a));
                Accumulate(s, b.CountOf(u), shareB, 1 - scoreA, HasMeleeFront(b));
                foreach (var side in new[] { result.SideA, result.SideB })
                {
                    var ts = side.ByType.FirstOrDefault(x => x.Type == u);
                    if (ts is null) continue;
                    s.Initial += ts.Initial; s.Survivors += ts.Survivors; s.Damage += ts.DamageDealt;
                }
                double x = shareA - shareB, y = scoreA * 2 - 1;
                s.SumX += x; s.SumY += y; s.SumXX += x * x; s.SumYY += y * y; s.SumXY += x * y; s.N++;
            }
        }

        var t = new Table("Birlik", "Ort. pay", "Asker başı kazanma", "Baskın ordu kazanma", "Korelasyon", "Hayatta kalma", "Hasar/asker", "Hasar/kaynak", "Karar");
        foreach (var u in Units)
        {
            var s = stats[u.Index];
            t.Add(u.Name,
                Pct(s.ShareSum / s.ArmyCount),
                Pct(s.SoldierWinRate),
                double.IsNaN(s.DominantWinRate) ? "—" : $"{Pct(s.DominantWinRate)} ({s.DominantCount})",
                F(s.Correlation, "+0.00;-0.00;0.00"),
                Pct(s.Initial == 0 ? 0 : (double)s.Survivors / s.Initial),
                F(s.Initial == 0 ? 0 : s.Damage / s.Initial, "0"),
                F(s.Initial == 0 ? 0 : s.Damage / s.Initial / rules.ResourceValueInWood(u), "0.0"),
                Verdict(s.SoldierWinRate));
        }
        t.Print();
        foreach (var u in Units.Where(u => u.Range == AttackRange.Ranged))
        {
            var s = stats[u.Index];
            if (s.ScreenedArmyCount == 0) continue;
            Console.WriteLine($"   {u.Name}, önünde en az 1 yakın dövüşçü olan ordularda: asker başı {Pct(s.ScreenedSoldierScore / s.ScreenedSoldierCount)}, " +
                $"ordu kazanma {Pct(s.ScreenedArmyScore / s.ScreenedArmyCount)} ({s.ScreenedArmyCount} ordu)");
        }
        Console.WriteLine($"   Beraberlik: {draws} · ortalama savaş süresi: {totalSeconds / matches.Length:0.0} sn");
        Console.WriteLine("   Asker başı kazanma: rastgele seçilen bir askerin ordusunun kazanma oranı. Dengede ≈%50.");
        Console.WriteLine("   Baskın ordu: o birliğin en az %50 olduğu ordular (parantezde ordu sayısı).");
        Console.WriteLine("   Korelasyon: o birlikten rakipten fazla almanın sonuca etkisi (+ = iyi, − = kötü).");
        Console.WriteLine();
        return stats;
    }

    private static bool HasMeleeFront(ArmySetup army) =>
        army.Counts.Any(kv => kv.Value > 0 && kv.Key.Range == AttackRange.Melee && army.RowOf(kv.Key) == Row.Front);

    private static void Accumulate(TypeStats s, int count, double share, double score, bool screened)
    {
        if (screened && count > 0)
        {
            s.ScreenedSoldierScore += count * score;
            s.ScreenedSoldierCount += count;
            s.ScreenedArmyScore += score;
            s.ScreenedArmyCount++;
        }
        s.SoldierScore += count * score;
        s.SoldierCount += count;
        s.ShareSum += share;
        s.ArmyCount++;
        if (share >= 0.5) { s.DominantScore += score; s.DominantCount++; }
    }

    private string Verdict(double soldierWinRate) =>
        soldierWinRate >= options.StrongThreshold ? "FAZLA GÜÇLÜ"
        : soldierWinRate <= 1 - options.StrongThreshold ? "ZAYIF"
        : "dengeli";

    // ---- 4. Composition pool -----------------------------------------------------------------

    private void PrintPool()
    {
        int size = options.PoolArmySize;
        Heading($"4. Kompozisyon ligi: {options.PoolSize} ordu ({size} birlik), herkes herkesle {options.PoolRepeats} kez");

        // Seed the pool with the obvious picks (each mono army, an even mix) then fill randomly.
        var pool = new List<ArmySetup>();
        foreach (var u in Units)
        {
            var w = new double[Units.Count]; w[u.Index] = 1;
            pool.Add(_generator.FromWeights(w, size, options.Budget, $"Sadece {u.Name}"));
        }
        pool.Add(_generator.FromWeights(Enumerable.Repeat(1.0, Units.Count).ToArray(), size, options.Budget, "Eşit karışım"));
        var poolRng = new Random(options.Seed + 3_000_000);
        while (pool.Count < options.PoolSize)
            pool.Add(_generator.Random(poolRng, size, options.Budget, $"Rastgele #{pool.Count - Units.Count}"));

        var pairs = new List<(int i, int j)>();
        for (int i = 0; i < pool.Count; i++)
            for (int j = i + 1; j < pool.Count; j++)
                for (int r = 0; r < options.PoolRepeats; r++)
                    pairs.Add(r % 2 == 0 ? (i, j) : (j, i)); // alternate sides
        var results = RunParallel(pairs.Count, 4_000_000, (rng, k) =>
        {
            var (i, j) = pairs[k];
            return (i, j, score: Score(_simulator.Simulate(pool[i], pool[j], rng)));
        });

        var points = new double[pool.Count];
        var played = new int[pool.Count];
        foreach (var (i, j, score) in results)
        {
            points[i] += score; points[j] += 1 - score;
            played[i]++; played[j]++;
        }
        var ranking = Enumerable.Range(0, pool.Count).OrderByDescending(i => points[i] / played[i]).ToList();

        var t = new Table("Sıra", "Kazanma", "Ordu", "Kompozisyon") { LeftAlignedFrom = 2 };
        void AddRow(int rank)
        {
            int i = ranking[rank];
            t.Add((rank + 1).ToString(), Pct(points[i] / played[i]), pool[i].Name, pool[i].ToString());
        }
        for (int r = 0; r < Math.Min(8, ranking.Count); r++) AddRow(r);
        t.Add("…", "", "", "");
        for (int r = Math.Max(8, ranking.Count - 5); r < ranking.Count; r++) AddRow(r);
        t.Print();

        Console.WriteLine("   Sabit ordular:");
        foreach (var i in Enumerable.Range(0, Units.Count + 1))
            Console.WriteLine($"     {pool[i].Name,-16} {Pct(points[i] / played[i]),6}  ({ranking.IndexOf(i) + 1}. sırada)");
        Console.WriteLine();
    }

    // ---- 5. Back row -------------------------------------------------------------------------

    private void PrintBackRow()
    {
        var front = rules.FindUnit(options.BackRowFrontUnit);
        int n = options.BackRowCount;
        if (front is null)
        {
            Heading("5. Arka sıra testi");
            Console.WriteLine($"   Atlandı: \"{options.BackRowFrontUnit}\" birliği ayar dosyasında yok.");
            Console.WriteLine();
            return;
        }
        var xs = Units.Where(u => u != front).ToList();
        var archer = Units.FirstOrDefault(u => u.Range == AttackRange.Ranged);

        // X stands in its default row: melee next to the shields in front, ranged behind them.
        ArmySetup Build(UnitType x, string name) => new ArmySetup(name).Add(front, n).Add(x, n);

        Heading($"5. Sıra testi: {n} {front.Name} + {n} X (yakın X önde, okçu arkada) — satırın kazanma oranı ({options.DuelRuns} tekrar)");
        PrintBackRowTable(xs, xs.Select(y => (y.Name, Build(y, "B"))).ToList(), Build, salt: 6_000_000);

        int k = options.BackRowEnemyArchers;
        if (archer is null || k <= 0 || k >= n) return;
        // Variant: every opponent swaps k of its X for archers that aim at our archers (back row included).
        var opponents = xs.Where(y => y != archer).Select(y =>
        {
            var b = new ArmySetup("B") { Targeting = TargetPriority.Prefer(archer) }.Add(front, n).Add(y, n - k).Add(archer, k);
            return ($"{n - k} {y.Name}+{k} {archer.Name}", b);
        }).ToList();
        Console.WriteLine($"   Varyant: rakipte {k} okçu var (rakip: {n} {front.Name} + {n - k} Y + {k} {archer.Name}, rakip okçuları önce {archer.Name} vurur)");
        PrintBackRowTable(xs, opponents, Build, salt: 6_500_000);
    }

    private void PrintBackRowTable(List<UnitType> xs, List<(string Label, ArmySetup Army)> opponents,
        Func<UnitType, string, ArmySetup> build, int salt)
    {
        int n = options.BackRowCount;
        var header = new[] { "X" }.Concat(opponents.Select(o => o.Label)).Concat(["Ort. kazanma", "X hasarı", "X hayatta"]).ToArray();
        var t = new Table(header);
        foreach (var x in xs)
        {
            var cells = new List<string> { x.Name };
            double winSum = 0, damage = 0, survivors = 0;
            int games = 0;
            for (int j = 0; j < opponents.Count; j++)
            {
                var a = build(x, "A");
                var b = opponents[j].Army;
                var results = RunParallel(options.DuelRuns, salt + x.Index * 31 + j, rng => _simulator.Simulate(a, b, rng));
                double rate = results.Average(Score);
                // The mirror match (same army on both sides) says nothing about X's value.
                bool mirror = b.Counts.Count == a.Counts.Count && b.Counts.All(kv => a.CountOf(kv.Key) == kv.Value);
                cells.Add(mirror ? $"({Pct(rate)})" : Pct(rate));
                if (!mirror) { winSum += rate; games++; }
                foreach (var r in results)
                {
                    var xs2 = r.SideA.ByType.First(s => s.Type == x);
                    damage += xs2.DamageDealt;
                    survivors += xs2.Survivors;
                }
            }
            int battles = opponents.Count * options.DuelRuns;
            cells.Add(games == 0 ? "—" : Pct(winSum / games));
            cells.Add(F(damage / battles, "0"));
            cells.Add($"{survivors / battles:0.0}/{n}");
            t.Add(cells.ToArray());
        }
        t.Print();
        Console.WriteLine("   Ort. kazanma: ayna maç (parantezli) hariç. X hasarı/hayatta: X birliklerinin savaş başına ortalaması.");
        Console.WriteLine();
    }

    // ---- 6. Target priority ------------------------------------------------------------------

    private void PrintTargeting()
    {
        var priorities = new List<TargetPriority> { TargetPriority.Front };
        priorities.AddRange(Units.Select(TargetPriority.Prefer));
        int n = Math.Max(500, options.Matches / 10);
        Heading($"6. Okçu hedefi: her ayar birbirine karşı, rastgele ordular ({n} ordu çifti × 2 taraf) — satırın kazanma oranı");

        var rates = new double[priorities.Count, priorities.Count];
        for (int i = 0; i < priorities.Count; i++)
            for (int j = i + 1; j < priorities.Count; j++)
            {
                var (p, q) = (priorities[i], priorities[j]);
                // Each army pair is played twice with sides swapped, so only the targeting differs.
                var scores = RunParallel(n, 7_000_000 + i * 31 + j, rng =>
                {
                    int size = rng.Next(options.MinSize, options.MaxSize + 1);
                    var x = _generator.Random(rng, size, options.Budget, "X");
                    var y = _generator.Random(rng, size, options.Budget, "Y");
                    double first = Score(_simulator.Simulate(x.Clone("A", p), y.Clone("B", q), rng));
                    double second = Score(_simulator.Simulate(y.Clone("A", p), x.Clone("B", q), rng));
                    return (first + second) / 2;
                });
                rates[i, j] = scores.Average();
                rates[j, i] = 1 - rates[i, j];
            }

        var names = priorities.Select(ArmyParser.Describe).ToList();
        var t = new Table(new[] { "" }.Concat(names).Concat(["Ortalama"]).ToArray());
        for (int i = 0; i < priorities.Count; i++)
        {
            var cells = new List<string> { names[i] };
            for (int j = 0; j < priorities.Count; j++)
            {
                if (i == j) { cells.Add("—"); continue; }
                cells.Add(Pct(rates[i, j]) + (rates[i, j] > options.TargetDominanceThreshold ? "!" : ""));
            }
            cells.Add(Pct(Enumerable.Range(0, priorities.Count).Where(j => j != i).Average(j => rates[i, j])));
            t.Add(cells.ToArray());
        }
        t.Print();
        Console.WriteLine($"   ! = satırdaki ayar sütundakini %{options.TargetDominanceThreshold * 100:0}'in üstünde yeniyor.");

        for (int i = 0; i < priorities.Count; i++)
        {
            var beaten = Enumerable.Range(0, priorities.Count).Where(j => j != i && rates[i, j] > options.TargetDominanceThreshold).ToList();
            if (beaten.Count == 0) continue;
            string list = string.Join(", ", beaten.Select(j => $"{names[j]} {Pct(rates[i, j])}"));
            Console.WriteLine($"   ! '{names[i]}' şunları yeniyor: {list}");
            _findings.Add($"Hedef: '{names[i]}' baskın ({list}).");
        }
        Console.WriteLine();
    }

    // ---- 7. Bandit camps ---------------------------------------------------------------------

    /// <summary>The army size band (people) the camps are meant to be beaten with, and the target share of it lost on a win.</summary>
    private const int SmallCampMin = 7, SmallCampMax = 9, BigCampMin = 18, BigCampMax = 22;
    private const double CampLossTarget = 1.0 / 3, CampLossTolerance = 0.10;
    private const int CampRuns = 400;

    private void PrintCamps()
    {
        var forest = rules.Forest;
        Heading("7. Haydut kampları: kampı yenmek için kaç asker gerekir?");
        var camps = new[] { ("Küçük kamp", forest.Camp, SmallCampMin, SmallCampMax), ("Büyük kamp", forest.BigCamp, BigCampMin, BigCampMax) };
        if (camps.All(c => c.Item2.Bandits.Count == 0)) { Console.WriteLine("   (ayar dosyasında kamp yok)"); Console.WriteLine(); return; }

        int salt = 9_000_000;
        foreach (var (name, camp, min, max) in camps)
        {
            var bandits = camp.Bandits.Select(kv => (Type: rules.FindUnit(kv.Key)!, Count: kv.Value)).ToList();
            string who = string.Join(", ", bandits.Select(b => $"{b.Count} {b.Type.Name}"));
            Console.WriteLine($"   {name}: {who} ({bandits.Sum(b => b.Count)} haydut)");

            var defenders = new ArmySetup("Haydutlar");
            foreach (var (type, count) in bandits) defenders.Add(type, count);

            var kinds = new (string Label, Func<int, ArmySetup> Build)[]
            {
                ("sadece kılıçlı", n => new ArmySetup("Saldıran").Add(rules.FindUnit("kilicli")!, n)),
                ("karma (eşit; okçu arkada)", n => MixedArmy(n)),
            };

            var summary = new Table("Ordu", "Başabaş (≥%50)", "≥%90 için", "Kayıp @başabaş", "Kayıp @%90");
            var band = new Table("Ordu", "Asker", "Kazanma", "Ort. kayıp", "Kayıp oranı");
            foreach (var (label, build) in kinds)
            {
                var even = FirstSize(build, defenders, 0.5, salt);
                var safe = FirstSize(build, defenders, 0.9, salt);
                string Loss(int? n) => n is null ? "—" : CampOutcome(build(n.Value), defenders, salt + n.Value) is { Wins: > 0 } o ? $"{o.Lost:0.0} (%{100 * o.Lost / n.Value:0})" : "—";
                summary.Add(label, even?.ToString() ?? $">{CampSearchLimit}", safe?.ToString() ?? $">{CampSearchLimit}", Loss(even), Loss(safe));

                for (int n = min; n <= max; n += Math.Max(1, (max - min) / 2))
                {
                    var o = CampOutcome(build(n), defenders, salt + n);
                    band.Add(label, n.ToString(), Pct(o.WinRate), o.Wins == 0 ? "—" : F(o.Lost, "0.0"), o.Wins == 0 ? "—" : Pct(o.Lost / n));
                }

                // Judge the mixed army against the target: the safe size lies in the band and a win at its middle costs about a third.
                if (label.StartsWith("karma", StringComparison.Ordinal))
                {
                    var mid = (min + max) / 2;
                    var o = CampOutcome(build(mid), defenders, salt + mid);
                    string tag = $"{name} / {label}";
                    if (safe is null || safe < min || safe > max)
                        _findings.Add($"Kamp: {tag} güvenle (≥%90) yenmek için {safe?.ToString() ?? "çok"} asker gerekiyor (hedef {min}–{max}).");
                    if (o.Wins > 0 && Math.Abs(o.Lost / mid - CampLossTarget) > CampLossTolerance)
                        _findings.Add($"Kamp: {tag} {mid} askerle kazanınca kayıp %{100 * o.Lost / mid:0} (hedef ≈%33).");
                }
                salt += 1000;
            }
            summary.Print();
            Console.WriteLine();
            Console.WriteLine($"   {name} — hedef bandında ({min}–{max} asker):");
            band.Print();
            Console.WriteLine();
        }
        Console.WriteLine("   Başabaş = kampı en az yarı savaşta yenen en küçük ordu. Kayıp = kazanılan savaşlarda ölen asker (kiralık/ham fark yok).");
        Console.WriteLine($"   Hedef: küçük kamp {SmallCampMin}–{SmallCampMax} karma askerle, büyük kamp {BigCampMin}–{BigCampMax} iyi dizilmiş askerle; kazanınca kayıp ≈ üçte bir.");
        Console.WriteLine();
    }

    private const int CampSearchLimit = 80;

    private readonly record struct CampResult(double WinRate, int Wins, double Lost);

    private CampResult CampOutcome(ArmySetup attacker, ArmySetup defenders, int salt)
    {
        var results = RunParallel(CampRuns, salt, rng => _simulator.Simulate(attacker, defenders, rng));
        var wins = results.Where(r => r.Outcome == BattleOutcome.SideAWins).ToList();
        double lost = wins.Count == 0 ? 0 : wins.Average(r => r.SideA.Initial - r.SideA.Survivors);
        return new CampResult(results.Average(Score), wins.Count, lost);
    }

    /// <summary>Smallest army size that beats the camp in at least <paramref name="rate"/> of the fights (null: none up to the limit).</summary>
    private int? FirstSize(Func<int, ArmySetup> build, ArmySetup defenders, double rate, int salt)
    {
        for (int n = 1; n <= CampSearchLimit; n++)
        {
            var results = RunParallel(CampRuns, salt + n, rng => _simulator.Simulate(build(n), defenders, rng));
            if (results.Count(r => r.Outcome == BattleOutcome.SideAWins) >= rate * CampRuns) return n;
        }
        return null;
    }

    /// <summary>An equal mix of every unit type (the remainder goes to the sturdier front-row types first); archers stand behind.</summary>
    private ArmySetup MixedArmy(int n)
    {
        var order = new[] { "kilicli", "kalkanli", "mizrakci", "okcu" }.Select(id => rules.FindUnit(id)!).ToList();
        var army = new ArmySetup("Saldıran");
        for (int i = 0; i < order.Count; i++) army.Add(order[i], n / order.Count + (i < n % order.Count ? 1 : 0));
        return army;
    }

    // ---- Summary -----------------------------------------------------------------------------

    private void PrintSummary(TypeStats[] stats)
    {
        Heading("Özet");
        var ordered = Units.OrderByDescending(u => stats[u.Index].SoldierWinRate).ToList();
        var strong = ordered.Where(u => stats[u.Index].SoldierWinRate >= options.StrongThreshold).ToList();
        var weak = ordered.Where(u => stats[u.Index].SoldierWinRate <= 1 - options.StrongThreshold).ToList();

        Console.WriteLine($"  Güç sırası (asker başı kazanma): {string.Join(" > ", ordered.Select(u => $"{u.Name} {Pct(stats[u.Index].SoldierWinRate).Trim()}"))}");
        if (strong.Count == 0 && weak.Count == 0)
            Console.WriteLine($"  Eşik (%{options.StrongThreshold * 100:0} / %{(1 - options.StrongThreshold) * 100:0}) dışında kalan birlik yok.");
        foreach (var u in strong)
            Console.WriteLine($"  ! {u.Name} fazla güçlü görünüyor.");
        foreach (var u in weak)
            Console.WriteLine($"  ! {u.Name} zayıf görünüyor.");
        foreach (var f in _findings)
            Console.WriteLine($"  ! {f}");
        Console.WriteLine();
    }

    // ---- Helpers -----------------------------------------------------------------------------

    private static double Score(BattleResult r) => r.Outcome switch
    {
        BattleOutcome.SideAWins => 1,
        BattleOutcome.SideBWins => 0,
        _ => 0.5,
    };

    private T[] RunParallel<T>(int count, int salt, Func<Random, T> work) => RunParallel(count, salt, (rng, _) => work(rng));

    /// <summary>Runs <paramref name="count"/> jobs in parallel; each gets its own seeded RNG so results are reproducible.</summary>
    private T[] RunParallel<T>(int count, int salt, Func<Random, int, T> work)
    {
        var results = new T[count];
        Parallel.For(0, count, i => results[i] = work(new Random(MixSeed(options.Seed, salt, i)), i));
        return results;
    }

    // HashCode.Combine is randomized per process, so mix the seed by hand to keep runs reproducible.
    private static int MixSeed(int seed, int salt, int index)
    {
        unchecked
        {
            uint h = (uint)seed * 0x9E3779B1u;
            h ^= (uint)salt + 0x7F4A7C15u + (h << 6) + (h >> 2);
            h ^= (uint)index + 0x165667B1u + (h << 6) + (h >> 2);
            return (int)h;
        }
    }

    private static void Heading(string title)
    {
        Console.WriteLine(title);
        Console.WriteLine(new string('─', Math.Min(title.Length, 100)));
    }

    private static string Pct(double x) => double.IsNaN(x) ? "—" : $"%{x * 100:0.0}";
    private static string F(double x, string format) => double.IsNaN(x) ? "—" : x.ToString(format);
}
