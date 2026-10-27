import { esc } from '../format';

// "Nasıl oynanır": a short decree (a parchment over the screen) opened with the "?" button, in the menus and in the game. Every number in it
// comes from the server (/api/guide, which reads config/balance.json), so it follows the settings when they change.

interface Range { min: number; max: number }
interface Count { name: string; count: number }
export interface GuideUnit {
  id: string; name: string; hp: number; damage: number; dps: number; ranged: boolean; iron: number; wood: number; buildSeconds: number;
  price: number | null; strong: string[]; weak: string[];
  heal?: number; healInterval?: number; people?: number; speedFactor?: number; back?: boolean; flank?: boolean; backFirst?: boolean; splashTargets?: number;
}
interface GuideCamp { bandits: Count[]; gold: Range; wood: Range; weapons: Count[] }
export interface Guide {
  shortPrepSeconds: number; shortWarSeconds: number; longPrepSeconds: number; longWarSeconds: number; startingPopulation: number;
  workerFoodPerMinute: number; soldierFoodPerMinute: number; foodPerMinute: number; woodPerMinute: number; ironPerMinute: number;
  newPersonBaseCost: number; newPersonCostGrowth: number; famineStartSeconds: number; famineFoodMultiplier: number;
  levels: { level: number; capacity: number; multiplier: number; upgradeWood: number; upgradeIron: number; upgradeSeconds: number }[];
  units: GuideUnit[];
  maxScouts: number; scoutErrorPercent: number; armySpeed: number; scoutSpeed: number;
  chestsPerCorner: number; villagesPerCorner: number; campsPerCorner: number;
  chest: { gold: Range; iron: Range };
  village: { gold: Range; food: Range; people: Range; minSoldiers: number };
  camp: GuideCamp; bigCamp: GuideCamp;
  fallLootShare: number; fallWorkerShare: number;
  archerDefenseBonusPercent: number;
  prisonerShare: number;
  deckEnabled: boolean; deckSize: number;
  raidBurnSeconds?: number;
}

let cached: Promise<Guide> | null = null;
let open: HTMLElement | null = null;

const minutes = (s: number) => `${Math.round(s / 60)} dk`;
const num = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1).replace('.', ','));
const range = (r: Range) => (r.min === r.max ? num(r.min) : `${num(r.min)}–${num(r.max)}`);
const has = (r: Range) => r.max > 0;
const percent = (x: number) => `%${Math.round(x * 100)}`;
const counts = (list: Count[]) => list.map((c) => `${c.count} ${c.name}`).join(', ');

/** What the decree says: short lists under small headings. */
export function guideHtml(g: Guide): string {
  const [l1, l2, l3, l4] = g.levels;
  const shortTotal = g.shortPrepSeconds + g.shortWarSeconds, longTotal = g.longPrepSeconds + g.longWarSeconds;
  const sections: [string, string[]][] = [
    ['Amaç', [
      '2–4 kişi oynar, herkesin tek bir kalesi vardır. <b>Son ayakta kalan kale kazanır</b>; süre dolarsa en yüksek nüfus kazanır.',
      `<b>Hazırlık</b> (${minutes(g.shortPrepSeconds)}): ekonomi, silah, orman. <b>Savaş</b> (${minutes(g.shortWarSeconds)}): ordular yola çıkar. ${minutes(shortTotal)} ve ${minutes(longTotal)} modu var.`,
      `Kale tek seferde düşer: bir ordu kapıdaki savaşı kazanırsa (tek askeri kalsa bile) o kale elenir ve oyuncu izleyici olur. Kapıdaki okçular surun arkasından %${num(g.archerDefenseBonusPercent)} fazla hasar verir.`,
    ]],
    ['Ekonomi: işçi mi asker mi?', [
      `Her işçi çiftçi, oduncu, madenci ya da demirci olur. Boşta duran üretmez ama yemek yer. Kişi başı dakikada: yemek ${num(g.foodPerMinute)}, odun ${num(g.woodPerMinute)}, demir ${num(g.ironPerMinute)}.`,
      `Herkes yemek yer: işçi ${num(g.workerFoodPerMinute)}, asker ${num(g.soldierFoodPerMinute)} dakikada. <b>Her asker üretimden bir işçi eksiltir</b>: ordu büyüdükçe yemek ve silah azalır.`,
      `Yeni kişi yemekle doğar (ilk kişi ${num(g.newPersonBaseCost)} yemek, sonra her kişi ${percent(g.newPersonCostGrowth)} pahalı). Savaş başlayınca ${minutes(g.famineStartSeconds)} sonra kıtlık başlar ve maç sonuna kadar sürer: yemek üretimi ×${num(g.famineFoodMultiplier)}.`,
    ]],
    ['Binalar ve silah', [
      `Çiftlik, kereste, maden ve demirci: her birinde en çok ${l1.capacity} kişi çalışır. Yükseltince ${l2 ? `${l2.capacity}` : ''}${l3 ? `, ${l3.capacity}` : ''}${l4 ? ` ve ${l4.capacity}` : ''} kişi, üretim ${l2 ? `×${num(l2.multiplier)}` : ''}${l3 ? `, ×${num(l3.multiplier)}` : ''}${l4 ? ` ve ×${num(l4.multiplier)}` : ''}.`,
      l2 ? `Yükseltme bedeli: ${num(l2.upgradeWood)} odun + ${num(l2.upgradeIron)} demir${l3 ? ` (sonra ${num(l3.upgradeWood)} + ${num(l3.upgradeIron)}${l4 ? `, en üst seviye ${num(l4.upgradeWood)} + ${num(l4.upgradeIron)}` : ''})` : ''}; ${g.levels.slice(1).map((l) => `${num(l.upgradeSeconds)}`).join(', ')} sn sürer.` : '',
      'Demirci demir ve odundan <b>silah</b> yapar; silahı askere çevirirsin, asker işçiye de geri dönebilir.',
    ]],
    ['Deste, keşiş, mancınık, süvari', [
      g.deckEnabled ? `Maç başında ${g.units.length} birlikten <b>${g.deckSize}</b> tanesini seçersin (lobide); yalnız onları üretir, kuşanır ve kiralarsın. Rakibin destesini yalnız gözcü raporunda görürsün.` : '',
      ...g.units.filter((u) => u.heal).map((u) => `<b>${esc(u.name)}</b>: arka sırada durur, saldırmaz; her ${num(u.healInterval ?? 0)} sn'de ordusundaki en yaralı dostuna ${num(u.heal ?? 0)} can verir. Okçuların öncelikli hedefi olarak seçilebilir.`),
      ...g.units.filter((u) => u.backFirst).map((u) => `<b>${esc(u.name)}</b>: savaşın başından itibaren düşmanın <b>arka sırasına</b> vurur, hedefin yanındaki ${u.splashTargets ?? 0} kişiye de yarım hasar; ${u.people ?? 2} kişi harcar. Yakın dövüşte çok zayıftır.`),
      ...g.units.filter((u) => u.flank).map((u) => `<b>${esc(u.name)}</b>: arka sırada okçu, mancınık ya da keşiş yaşadıkça ön sırayı aşıp onlara dalar; mızrakçıdan korkar. Haritada ×${num(u.speedFactor ?? 1)} hızlıdır. <b>Yalnız süvariden oluşan ordu</b> kapıda kazanırsa kale düşmez, rakibin tarlaları yanar (yemek üretimi ${num(g.raidBurnSeconds ?? 60)} sn yarıya iner).`),
    ]],
    ['Gözcü', [
      `Aynı anda en çok ${g.maxScouts} gözcü. Bir rakibe gönder: dönünce <b>rapor</b> gelir (asker sayıları ±${num(g.scoutErrorPercent)}% şaşabilir). Rakip gözetlendiğini öğrenir.`,
      `Gözcü ormanın bir çeyreğini de gezer: bulduğu yerler haritada kalır. Hızı ${num(g.scoutSpeed)} karo/sn; ordu ${num(g.armySpeed)}.`,
    ]],
    ['Orman: sandık, köy, kamp', [
      `Her köşenin çeyreğinde ${g.chestsPerCorner} sandık, ${g.villagesPerCorner} köy, ${g.campsPerCorner} haydut kampı; ortada büyük kamp. Yerler gözcü yakınından geçince bulunur.`,
      `<b>Sandık</b> (gözcü alır): ${range(g.chest.gold)} altın${has(g.chest.iron) ? `, ${range(g.chest.iron)} demir` : ''}.`,
      `<b>Köy</b> (en az ${g.village.minSoldiers} asker, savaşsız): ${range(g.village.gold)} altın${has(g.village.food) ? `, ${range(g.village.food)} yemek` : ''}, ${range(g.village.people)} kişi.`,
      `<b>Haydut kampı</b> (savaş: ${counts(g.camp.bandits)}): ${range(g.camp.gold)} altın${has(g.camp.wood) ? `, ${range(g.camp.wood)} odun` : ''}${g.camp.weapons.length ? `, silah (${counts(g.camp.weapons)})` : ''}. <b>Büyük kamp</b> daha güçlü (${counts(g.bigCamp.bandits)}), ödülü ${range(g.bigCamp.gold)} altın.`,
      'Yerler bir kez boşaltılır. Ganimet, ordu ya da gözcü <b>eve dönünce</b> gelir.',
    ]],
    ['Paralı asker', [
      `Altınla anında asker: ${g.units.filter((u) => u.price !== null).map((u) => `${esc(u.name)} ${num(u.price!)}`).join(', ')} altın.`,
      'İşçiden düşmez, nüfusa sayılır ve yemek yer; işçiye dönüştürülemez.',
    ]],
    ['Saldırı ve önünü kes', [
      'Savaş fazında rakip kalenin penceresinden birlik sayılarını (<b>Tümü / Yarısı</b> tek tıkla doldurur), sırayı ve okçu hedefini seç.',
      `Ordular yollardan yürür. Yolda karşılaşan düşman ordular savaşır. Kapıya varınca savunanlarla savaşılır; kazanırsan kale düşer: depodaki yemek, odun, demir ve altının ${percent(g.fallLootShare)}'i ile işçilerin ${percent(g.fallWorkerShare)}'ü ordunla eve gelir; ayrıca savunan ordunun ${percent(g.prisonerShare)}'i <b>esir</b> olur, senin askerin olarak eve döner.`,
      '<b>Önünü kes</b>: ordu yolda karşılaştığı ilk orduyla savaşıp eve döner; rakip bunu bilemez.',
      '<b>Yeni emir</b>: yürüyen ordunu haritada tıkla; başka bir kaleye ya da ormandaki bir yere yönlendir ya da geri çağır. Rakipler yalnız yönünü görür, hedefini değil.',
    ]],
    ['Birlikler: kim kimi yener', []],
    ['Kale düşünce', [
      `Kalen düşerse elenirsin; haritayı izleyici olarak izlersin.`,
      `Kaleyi düşüren ordu, depodaki yemek, odun, demir ve altının <b>${percent(g.fallLootShare)}</b>'ini ve hayatta kalan işçilerin <b>${percent(g.fallWorkerShare)}</b>'ünü (boşta) eve getirir.`,
    ]],
  ];
  const table = `
    <table class="guide-units">
      <tr><th>Birlik</th><th>Can</th><th>Hasar/sn</th><th>Bedel</th><th>Daha iyi vurur</th><th>Daha zayıf vurur</th></tr>
      ${g.units.map((u) => `<tr>
        <td><b>${esc(u.name)}</b><small>${u.ranged ? 'uzaktan' : 'yakın'}</small></td><td>${num(u.hp)}</td><td>${num(u.dps)}</td>
        <td>${num(u.iron)} demir, ${num(u.wood)} odun</td><td>${u.strong.map(esc).join(', ') || '—'}</td><td>${u.weak.map(esc).join(', ') || '—'}</td></tr>`).join('')}
    </table>
    <p class="guide-note">Ön sıra önce vurulur; arka sıradakiler öndekiler düşene kadar hasar almaz (yakın dövüşçüler orada yedektir).</p>`;
  return sections.map(([title, lines]) => `
    <section><h3>${title}</h3>${title.startsWith('Birlikler') ? table : `<ul>${lines.filter(Boolean).map((l) => `<li>${l}</li>`).join('')}</ul>`}</section>`).join('');
}

export function loadGuide(): Promise<Guide> {
  return load();
}

function load(): Promise<Guide> {
  cached ??= fetch('/api/guide').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<Guide>; })
    .catch((e) => { cached = null; throw e; });
  return cached;
}

export function closeGuide(): void {
  open?.remove();
  open = null;
  window.removeEventListener('keydown', onKey, true);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') { e.stopPropagation(); closeGuide(); }
}

/** Opens the decree (or closes it if it is open). */
export function toggleGuide(): void {
  if (open) { closeGuide(); return; }
  const overlay = document.createElement('div');
  overlay.className = 'guide-overlay';
  overlay.innerHTML = `
    <div class="guide paper" role="dialog" aria-label="Nasıl oynanır">
      <div class="ribbon ribbon-blue guide-title">Nasıl oynanır</div>
      <button class="btn-round btn-red guide-close" data-act="close" title="Kapat (Esc)" aria-label="Kapat"><i class="ico ico-close"></i></button>
      <div class="guide-body"><p class="guide-note">Yükleniyor…</p></div>
    </div>`;
  overlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === overlay || t.closest('[data-act="close"]')) closeGuide();
  });
  document.body.appendChild(overlay);
  open = overlay;
  window.addEventListener('keydown', onKey, true);
  const body = overlay.querySelector<HTMLElement>('.guide-body')!;
  load().then((g) => { if (open === overlay) body.innerHTML = guideHtml(g); })
    .catch(() => { if (open === overlay) body.innerHTML = '<p class="guide-note">Rehber şu an yüklenemedi. Biraz sonra tekrar dene.</p>'; });
}

/** The "?" button for the menus (in the game it sits in the top bar). */
export function mountGuideButton(): void {
  const b = document.createElement('button');
  b.className = 'btn-round guide-fab';
  b.title = 'Nasıl oynanır?';
  b.setAttribute('aria-label', 'Nasıl oynanır?');
  b.innerHTML = '<b>?</b>';
  b.addEventListener('click', toggleGuide);
  document.body.appendChild(b);
}
