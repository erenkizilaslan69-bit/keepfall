// Packs the screen tour: index.md and the game summary for each language, a contact sheet per folder, one ZIP per language.
//   node tools/tam-tur-pack.mjs [out-root]      (default: the newest folder of art/shots/tam-tur)
import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const base = 'art/shots/tam-tur';
const ROOT = resolve(process.argv[2] ?? join(base, readdirSync(base).filter((d) => /^\d{4}-/.test(d)).sort().at(-1)));
const CATALOG = JSON.parse(readFileSync('tools/tam-tur.catalog.json', 'utf8'));
// pictures made with the game's own drawing but a made-up situation (nobody can order these moments in a real match, or they need other people)
const STAGED = new Set(['lobi-ev-sahibi', 'acik-oyunlar', 'adresle-katil', 'savas-yuruyus', 'savas-kapi', 'savas-kusatma', 'savas-uclu', 'kale-dusus', 'sahte-ordu-dagilma', 'savas-raporu', 'ulak-mesaji', 'kitlik-uyarisi', 'bildirimler',
  'mac-sonu-kazanma', 'mac-sonu-kaybetme', 'kim-kimi-kandirdi', 'xp-dokumu', 'seviye-atlama', 'baglanti-koptu', 'surum-uyusmuyor', 'ev-sahibi-ayrildi', 'bot-devraldi']);

const SUMMARY = {
  tr: `# Keepfall — oyunu hiç bilmeyen biri için 1 sayfa

**Ne bu?** 2–4 kişilik, tarayıcıda/PC'de oynanan bir kale stratejisi. Herkesin tek bir kalesi var. Amacın: ayakta kalan son kale olmak (süre dolarsa en kalabalık nüfus kazanır).

**İki aşama.**
1. **Hazırlık (5 dakika):** Kendi kalende işçilerini çiftçi, oduncu, madenci ve demirci yaparsın; yemek, odun, demir toplarsın. Demirhanede silah üretir, işçiyi silahla *askere çevirirsin* (kuşanmak 15 sn sürer). Binaları yükseltirsin. Altınla paralı asker kiralayabilirsin. Ortadaki **ormanda** sandık, köy, haydut kampı ve büyük bir kamp vardır; keşfedip yağmalarsan altın ve silah kazanırsın.
2. **Savaş (10 dakika):** Ordular yollarda yürür; yolda ve kale kapısında çarpışırlar. Kapıdaki savaşı saldıran kazanırsa **kale tek seferde düşer**, sahibi elenir ve maçı izleyici olarak sürdürür. 4. dakikadan sonra **kıtlık** başlar: yemeksiz kalan kalenin üretimi yarıya iner.

**Birimler (7).** Kılıçlı, Mızrakçı, Kalkanlı, Okçu, Keşiş (iyileştirir), Mancınık (arkadan döver) ve Süvari (hızlı baskıncı). Her maça lobide seçtiğin **4 birimlik deste** ile girersin; rakibin destesini yalnız gözcü raporu gösterir.

**Dört gizli krallık.** Maç başında herkes rastgele bir krallık alır; başkasının krallığını bilemezsin:
- **Gölge:** sahte (hayalet) ordular ve sahte gözcü raporları.
- **Tüccar:** yaklaşan orduya rüşvet verip geri döndürür, haydut kamplarını kiralar.
- **Kâhin:** herkesin krallığını ve destesini bilir, kazanma şansını görür, hileleri ayırt eder.
- **Entrikacı:** ulaklarını ve ordularını başkasının adıyla gönderir.

**Gözcü ve ulak.** *Gözcü* bir rakibin kalesine gidip rapor getirir (ordusu, destesi, krallığı) — ama Gölge'nin sahte raporunu da okuyabilir. *Ulak* rakibe hediye ve yazı götürür; yakalanmaz, iz bırakmaz: ittifak, tehdit ya da yalan için.

**Blöf.** Oyunun asıl tadı bu: kimin ne olduğunu, kimin ne yaptığını tam bilmezsin. Maç bitince **«Kim kimi kandırdı»** ekranı bütün hileleri açıklar.

**Nasıl başlanır?** Menüde «Oyna»: üç bota karşı tek kişilik maç (ilk maçlarda botlar kolay). İlk seferde rehberli maç adım adım öğretir. Arkadaşlarla oynamak için «Arkadaşlarla oyna».
`,
  en: `# Keepfall — one page for someone who has never seen it

**What is it?** A castle strategy game for 2–4 players (browser or PC). Everybody has a single castle. Your goal: be the last castle standing (if time runs out, the biggest population wins).

**Two phases.**
1. **Preparation (5 minutes):** In your own castle you set workers to farming, lumber, mining and smithing, and collect food, wood and iron. At the smithy you make weapons and turn workers into soldiers by arming them (it takes 15 seconds). You upgrade buildings. You can hire mercenaries with gold. In the **forest** in the middle there are chests, villages, bandit camps and a big camp; scout and plunder them for gold and weapons.
2. **War (10 minutes):** Armies walk along the roads and clash on the road and at castle gates. If the attacker wins at the gate, **the castle falls in one go**, its owner is out and keeps watching as a spectator. After the 4th minute a **famine** starts: a castle without food produces half.

**Units (7).** Swordsman, Spearman, Shield-bearer, Archer, Monk (heals), Catapult (hits the back rows) and Cavalry (fast raider). You enter every match with a **deck of 4 units** picked in the lobby; a rival's deck is only revealed by a scout report.

**Four hidden kingdoms.** At the start everybody gets a random kingdom; you cannot tell what the others are:
- **Shadow:** fake (phantom) armies and fake scout reports.
- **Merchant:** bribes approaching armies into turning back, and rents bandit camps.
- **Oracle:** knows everyone's kingdom and deck, sees win odds, and can tell fakes apart.
- **Schemer:** sends envoys and armies under another player's name.

**Scouts and envoys.** A *scout* travels to a rival's castle and brings back a report (army, deck, kingdom) — but it may also read the Shadow's fake. An *envoy* carries a gift and a message to a rival; it cannot be caught and leaves no trace: for alliances, threats or lies.

**Bluff.** That is the heart of the game: you never quite know who is what, or who did what. When the match ends, the **"Who fooled whom"** screen reveals every trick.

**How to start?** In the menu press "Play": a single-player match against three bots (easy bots for your first matches). The first time, a guided match teaches step by step. To play with friends, use "Play with friends".
`,
};

for (const lang of ['tr', 'en']) {
  const dir = join(ROOT, lang);
  if (!existsSync(dir)) { console.log('no folder', dir); continue; }
  const man = existsSync(join(ROOT, `manifest-${lang}.json`)) ? JSON.parse(readFileSync(join(ROOT, `manifest-${lang}.json`), 'utf8')) : { shots: {}, failed: {} };
  const tr = lang === 'tr';
  let md = tr ? `# Keepfall ekran turu (1920x1080, Türkçe)\n\nHer satır: dosya adı — bu ekran nedir, ne işe yarar. «[sahnelenmiş]»: oyunun kendi çizimiyle ama gerçek maçta anlık yakalanamayan bir durum örnek olarak kuruldu (örn. kale düşüşü, bağlantı koptu mesajı); oyun bunu kendisi çiziyor.\n\n`
    : `# Keepfall screen tour (1920x1080, English)\n\nEach line: file name — what this screen is and what it is for. "[staged]": drawn by the game itself, but a situation that cannot be caught on demand in a real match was set up as an example (e.g. a castle falling, the connection-lost message).\n\n`;
  let taken = 0; const missing = [];
  CATALOG.forEach((c, i) => {
    const n = String(i + 1).padStart(2, '0'), file = `${n}-${c.slug}.png`;
    if (existsSync(join(dir, file))) { taken++; md += `- **${file}** — ${tr ? c.tr : c.en}${STAGED.has(c.slug) ? (tr ? ' *[sahnelenmiş]*' : ' *[staged]*') : ''}\n`; }
    else missing.push(`- ${n}-${c.slug}: ${man.failed?.[c.slug] ?? (tr ? 'çekilmedi' : 'not taken')}`);
  });
  md += `\n${tr ? `**Çekilen ekran:** ${taken} / ${CATALOG.length}.` : `**Screens taken:** ${taken} / ${CATALOG.length}.`}\n`;
  md += missing.length ? `\n## ${tr ? 'Çekilemedi + neden' : 'Not taken + why'}\n\n${missing.join('\n')}\n` : `\n${tr ? 'Çekilemeyen ekran yok.' : 'Every screen was taken.'}\n`;
  writeFileSync(join(dir, 'index.md'), md);
  writeFileSync(join(dir, tr ? 'oyun-ozeti.md' : 'game-summary.md'), SUMMARY[lang]);
  const sheet = join(dir, tr ? 'iletisim-sayfasi.png' : 'contact-sheet.png');
  const r = spawnSync('node', ['tools/tam-tur-sheet.mjs', dir, sheet, '9', '420'], { stdio: 'inherit' });
  if (r.status !== 0) console.log('sheet failed for', lang);
  // the ZIP (Windows tar writes zip with -a)
  const zip = resolve(ROOT, tr ? 'Keepfall-ekranlar-TR.zip' : 'Keepfall-screens-EN.zip');
  if (existsSync(zip)) rmSync(zip);
  const t = spawnSync('C:/Windows/System32/tar.exe', ['-a', '-c', '-f', tr ? 'Keepfall-ekranlar-TR.zip' : 'Keepfall-screens-EN.zip', lang], { stdio: 'inherit', cwd: ROOT });
  console.log(`${lang}: ${taken}/${CATALOG.length} screens, zip ${t.status === 0 ? zip : 'FAILED'}`);
}
