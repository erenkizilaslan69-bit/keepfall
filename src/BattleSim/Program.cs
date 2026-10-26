using System.Globalization;
using System.Text;
using Keepfall.BattleSim;
using Keepfall.Core;
using Keepfall.Core.Combat;
using Keepfall.Core.Config;
using Keepfall.Core.Lobby;

Console.OutputEncoding = Encoding.UTF8;

const string Usage = """
    Kullanım:
      BattleSim denge  [--mac 5000] [--min 10] [--max 30] [--butce kisi|kaynak] [--duello 10]
                       [--havuz 60] [--esik 0.55] [--seed 12345]
      BattleSim savas  <ordu A> <ordu B> [--hedef-a X] [--hedef-b X] [--tekrar N] [--seed N]
      BattleSim bot    [--mac 200] [--oyuncu 2|3|4] [--mod 15|30] [--zorluk orta|kolay|zor|zor-orta|karisik] [--seed 1] [--puan evet] [--agirlik 150,0.2,2,1] [--ozet 1]
                       (bot vs bot istatistikleri; --puan: süre bitince kazanan zafer puanına göre sayılır (deney); --ozet: karşılaştırma satırı)
      BattleSim bot --izle [--oyuncu 2] [--zorluk orta|kolay] [--mod 15|30] [--seed 1] [--aralik 60]   (tek maçı dakika dakika göster)
      BattleSim kontrol

    Ortak:   --config <yol>   (varsayılan: yukarı klasörlerde config/balance.json)
    Ordu:    "okcu:6,kilicli:8,kalkanli:4"   ·   sıra değiştir: "kilicli:4@arka" (yedek)
    Hedef:   okçuların hedefi: on (varsayılan) | <birlik id>  (ör. --hedef-a okcu). Yakın dövüşçüler hep en öndekine vurur.

    Örnekler:
      BattleSim denge --mac 10000
      BattleSim savas "okcu:10,kalkanli:10" "kilicli:20" --hedef-b okcu
    """;

try
{
    var (command, positional, flags) = ParseArgs(args);
    if (command is "yardim" or "help" or "-h" or "--help")
    {
        Console.WriteLine(Usage);
        return 0;
    }

    string configPath = flags.GetValueOrDefault("config") ?? FindConfig()
        ?? throw new BalanceConfigException("config/balance.json bulunamadı. --config ile yol ver.");
    var rules = BalanceConfigLoader.LoadFromFile(configPath);
    Console.WriteLine($"Ayar dosyası: {Path.GetFullPath(configPath)}");

    switch (command)
    {
        case "denge":
        {
            var options = new BalanceOptions
            {
                Matches = Int(flags, "mac", 5000),
                MinSize = Int(flags, "min", 10),
                MaxSize = Int(flags, "max", 30),
                DuelSize = Int(flags, "duello", 10),
                PoolSize = Int(flags, "havuz", 60),
                Seed = Int(flags, "seed", 12345),
                StrongThreshold = Dbl(flags, "esik", 0.55),
                Budget = flags.GetValueOrDefault("butce", "kisi") switch
                {
                    "kisi" or "kişi" => BudgetMode.People,
                    "kaynak" => BudgetMode.Resources,
                    var b => throw new FormatException($"Geçersiz bütçe \"{b}\" (kisi | kaynak)."),
                },
            };
            if (options.MinSize < 1 || options.MaxSize < options.MinSize)
                throw new FormatException("--min en az 1, --max en az --min olmalı.");
            new BalanceReport(rules, options).Run();
            return 0;
        }

        case "savas":
        {
            if (positional.Count != 2) throw new FormatException("savas iki ordu ister.\n\n" + Usage);
            var a = ArmyParser.ParseArmy(rules, positional[0], "A");
            var b = ArmyParser.ParseArmy(rules, positional[1], "B");
            if (flags.TryGetValue("hedef-a", out var ta)) a.Targeting = ArmyParser.ParseTargeting(rules, ta);
            if (flags.TryGetValue("hedef-b", out var tb)) b.Targeting = ArmyParser.ParseTargeting(rules, tb);
            RunBattle(rules, a, b, Int(flags, "seed", 1), Int(flags, "tekrar", 1));
            return 0;
        }

        case "bot" when !flags.ContainsKey("izle"):
        {
            int players = Int(flags, "oyuncu", 2);
            if (players is < 2 or > 4) throw new FormatException("--oyuncu 2, 3 ya da 4 olmalı.");
            int minutes = Int(flags, "mod", 15);
            if (minutes is not (15 or 30)) throw new FormatException("--mod 15 ya da 30 olmalı.");
            string level = flags.GetValueOrDefault("zorluk", "karisik").ToLowerInvariant();
            if (level is not ("orta" or "kolay" or "zor" or "zor-orta" or "karisik" or "karışık")) throw new FormatException($"Geçersiz zorluk \"{level}\" (kolay | orta | zor | zor-orta | karisik).");
            new BotReport(rules, new BotReportOptions
            {
                Matches = Int(flags, "mac", 200), Players = players, Minutes = minutes,
                Difficulty = level.Replace("karışık", "karisik"), Seed = Int(flags, "seed", 1),
                ScoreRule = flags.GetValueOrDefault("puan", "hayir") is "evet" or "1" or "true", Summary = flags.ContainsKey("ozet"),
                PointsPerElimination = Weights(flags)[0], PointsPerDamage = Weights(flags)[1], PointsPerKill = Weights(flags)[2], PointsPerPerson = Weights(flags)[3],
            }).Run();
            return 0;
        }

        case "bot":
        {
            int players = Int(flags, "oyuncu", 2);
            int minutes = Int(flags, "mod", 15);
            var level = (flags.GetValueOrDefault("zorluk", "orta").ToLowerInvariant()) switch
            {
                "kolay" => BotDifficulty.Easy, "orta" => BotDifficulty.Medium, "zor" => BotDifficulty.Hard,
                var z => throw new FormatException($"Geçersiz zorluk \"{z}\" (kolay | orta | zor)."),
            };
            int seed = Int(flags, "seed", 1);
            int every = Int(flags, "aralik", 60);
            double prep = minutes == 30 ? rules.Match.LongModePrepSeconds : rules.Match.ShortModePrepSeconds;
            double war = (minutes == 30 ? rules.Match.LongModeWarSeconds : rules.Match.ShortModeWarSeconds);
            var room = BotMatch.Create(rules, Enumerable.Repeat(level, players).ToList(), prep, war, seed);
            BotMatch.Play(rules, room, seed, (r, host) =>
            {
                double t = r.Game!.ElapsedSeconds;
                if (t % every < 1e-6 || r.Phase == RoomPhase.Ended)
                {
                    Console.WriteLine($"{(int)t / 60}:{(int)t % 60:00}  ({r.Game.Phase})");
                    Console.WriteLine(BotMatch.Describe(r, host));
                }
            });
            var result = room.Game!.Result!;
            Console.WriteLine($"Sonuç: kazanan {string.Join(", ", result.Winners.Select(w => room.PlayerOfCastle(w)?.Name))} ({(result.ByElimination ? "eleme" : "süre sonu")})");
            return 0;
        }

        case "kontrol":
            Console.WriteLine($"Ayar dosyası geçerli: {rules.Units.Count} birlik ({string.Join(", ", rules.Units.Select(u => u.Name))}).");
            return 0;

        default:
            Console.Error.WriteLine($"Bilinmeyen komut \"{command}\".\n");
            Console.WriteLine(Usage);
            return 1;
    }
}
catch (Exception ex) when (ex is FormatException or BalanceConfigException)
{
    Console.Error.WriteLine(ex.Message);
    return 1;
}

static void RunBattle(GameRules rules, ArmySetup a, ArmySetup b, int seed, int repeats)
{
    var sim = new BattleSimulator(rules);
    Console.WriteLine($"A: {a}  (hedef: {ArmyParser.Describe(a.Targeting)})");
    Console.WriteLine($"B: {b}  (hedef: {ArmyParser.Describe(b.Targeting)})");
    Console.WriteLine();

    var result = sim.Simulate(a, b, new Random(seed), recordLog: repeats == 1);
    if (repeats == 1)
    {
        foreach (var line in result.Log) Console.WriteLine(line);
        Console.WriteLine();
        foreach (var side in new[] { result.SideA, result.SideB })
        {
            Console.WriteLine($"{side.Name}: {side.Survivors}/{side.Initial} hayatta");
            foreach (var t in side.ByType)
                Console.WriteLine($"   {t.Type.Name,-10} {t.Survivors,3}/{t.Initial,-3} hayatta · verdiği hasar {t.DamageDealt,7:0} · aldığı {t.DamageTaken,7:0}");
        }
        return;
    }

    int winsA = 0, winsB = 0, draws = 0;
    double seconds = 0, survivorsA = 0, survivorsB = 0;
    for (int i = 0; i < repeats; i++)
    {
        var r = sim.Simulate(a, b, new Random(seed + i));
        seconds += r.DurationSeconds;
        switch (r.Outcome)
        {
            case BattleOutcome.SideAWins: winsA++; survivorsA += r.SideA.Survivors; break;
            case BattleOutcome.SideBWins: winsB++; survivorsB += r.SideB.Survivors; break;
            default: draws++; break;
        }
    }
    Console.WriteLine($"{repeats} savaş · ortalama {seconds / repeats:0.0} sn");
    Console.WriteLine($"  A kazandı: %{100.0 * winsA / repeats:0.0}" + (winsA > 0 ? $" (kazanınca ort. {survivorsA / winsA:0.0} hayatta)" : ""));
    Console.WriteLine($"  B kazandı: %{100.0 * winsB / repeats:0.0}" + (winsB > 0 ? $" (kazanınca ort. {survivorsB / winsB:0.0} hayatta)" : ""));
    Console.WriteLine($"  Berabere:  %{100.0 * draws / repeats:0.0}");
}

static (string command, List<string> positional, Dictionary<string, string> flags) ParseArgs(string[] args)
{
    var positional = new List<string>();
    var flags = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    for (int i = 0; i < args.Length; i++)
    {
        if (args[i].StartsWith("--", StringComparison.Ordinal) && args[i].Length > 2)
        {
            if (i + 1 >= args.Length) throw new FormatException($"{args[i]} bir değer bekliyor.");
            flags[args[i][2..]] = args[++i];
        }
        else positional.Add(args[i]);
    }
    string command = positional.Count > 0 ? positional[0].ToLowerInvariant() : "denge";
    if (positional.Count > 0) positional.RemoveAt(0);
    return (command, positional, flags);
}

/// <summary>--agirlik eleme,hasar,oldurme,nufus (zafer puanı ağırlıkları; varsayılan 150,0.2,2,1).</summary>
static double[] Weights(Dictionary<string, string> flags)
{
    var w = new[] { 150.0, 0.2, 2.0, 1.0 };
    if (!flags.TryGetValue("agirlik", out var text)) return w;
    var parts = text.Split(',');
    if (parts.Length != 4) throw new FormatException("--agirlik dört sayı ister: eleme,hasar,öldürme,nüfus");
    for (int i = 0; i < 4; i++) w[i] = double.Parse(parts[i], CultureInfo.InvariantCulture);
    return w;
}

static string? FindConfig()
{
    if (BalanceConfigLoader.FindDefaultPath(Environment.CurrentDirectory) is { } found) return found;
    var nextToExe = Path.Combine(AppContext.BaseDirectory, "balance.json");
    return File.Exists(nextToExe) ? nextToExe : null;
}

static int Int(Dictionary<string, string> flags, string key, int fallback) =>
    !flags.TryGetValue(key, out var v) ? fallback
    : int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n
    : throw new FormatException($"--{key} bir tam sayı olmalı (\"{v}\").");

static double Dbl(Dictionary<string, string> flags, string key, double fallback) =>
    !flags.TryGetValue(key, out var v) ? fallback
    : double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d
    : throw new FormatException($"--{key} bir sayı olmalı (\"{v}\").");
