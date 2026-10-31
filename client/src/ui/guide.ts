import { esc } from '../format';
import { isEnglish, numLocale, t, tr } from '../i18n';
import { emblemHtml } from './emblem';
import { serverUrl } from '../env';

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
  kingdoms?: { id: string; name: string; title: string; decree: string; abilities: { id: string; name: string; text: string }[] }[] | null;
}

let cached: Promise<Guide> | null = null;
let open: HTMLElement | null = null;

// First-time onboarding: the guide opens by itself in the first match, and the "?" of the top bar glows until it is first clicked.
const SEEN_KEY = 'keepfall_tutorial_seen', CLICKED_KEY = 'keepfall_guide_clicked';
const store = {
  get: (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* private mode: the guide may open again, harmless */ } },
};
/** True when the player has closed the guide before (when the browser keeps nothing, true as well: never nag every match). */
export function tutorialSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === 'true'; } catch { return true; }
}
/** The "?" has been clicked once: it stops glowing for good. */
export function guideClicked(): boolean { return store.get(CLICKED_KEY) === 'true'; }
export function markGuideClicked(): void { store.set(CLICKED_KEY, 'true'); }
const closeWaiters: (() => void)[] = [];
let autoPending = false;
const flushWaiters = (): void => { for (const cb of closeWaiters.splice(0)) cb(); };
/** Runs `cb` now, or when the guide has been closed (the kingdom decree waits for the first-time guide instead of piling up on it). */
export function whenGuideClosed(cb: () => void): void {
  if (open || autoPending) closeWaiters.push(cb); else cb();
}
/** In the first match: open the guide half a second after the game screen is up. */
export function showFirstTimeGuide(): void {
  if (tutorialSeen()) return;
  autoPending = true;
  setTimeout(() => {
    autoPending = false;
    if (!open && !tutorialSeen()) toggleGuide(true); else if (!open) flushWaiters();
  }, 500);
}

/** Three steps to read in three seconds, above the detailed decree. */
const quickStart = (): string => `
  <div class="guide-quick" aria-label="${t('Hızlı başlangıç')}">
    <div class="guide-quick-step"><b class="gq-ico" aria-hidden="true">⛏️</b><span><b>${t('1. Ekonomi &amp; Üretim')}</b>${t('İşçileri tarla, oduncu, maden ve demirhaneye dağıt; kaynaklarını topla, binalarını yükselt.')}</span></div>
    <div class="guide-quick-step"><b class="gq-ico" aria-hidden="true">⚔️</b><span><b>${t('2. Ordu Kur')}</b>${t('Demirhanede silah üret, işçileri askere çevir ve ordunu taktiğine göre hazırla.')}</span></div>
    <div class="guide-quick-step"><b class="gq-ico" aria-hidden="true">🏰</b><span><b>${t('3. Keşfet &amp; Fethet')}</b>${t('Gözcüyle savaş sisini aç, düşman kalelerini bul; kapıda kazanırsan kale düşer!')}</span></div>
  </div>`;

const minutes = (s: number) => t('{0} dk', Math.round(s / 60));
const num = (n: number) => numLocale(n);
const range = (r: Range) => (r.min === r.max ? num(r.min) : `${num(r.min)}–${num(r.max)}`);
const has = (r: Range) => r.max > 0;
const percent = (x: number) => (isEnglish ? `${Math.round(x * 100)}%` : `%${Math.round(x * 100)}`);
const counts = (list: Count[]) => list.map((c) => `${c.count} ${tr(c.name)}`).join(', ');

/** What the decree says: short lists under small headings. */
export function guideHtml(g: Guide): string {
  const [l1, l2, l3, l4] = g.levels;
  const shortTotal = g.shortPrepSeconds + g.shortWarSeconds, longTotal = g.longPrepSeconds + g.longWarSeconds;
  const upgrades = g.levels.slice(1).map((l) => `${num(l.upgradeSeconds)}`).join(', ');
  const sections: [string, string[], boolean?][] = [
    [t('Amaç'), [
      t('2–4 kişi oynar, herkesin tek bir kalesi vardır. <b>Son ayakta kalan kale kazanır</b>; süre dolarsa en yüksek nüfus kazanır.'),
      t('<b>Hazırlık</b> ({0}): ekonomi, silah, orman. <b>Savaş</b> ({1}): ordular yola çıkar. {2} ve {3} modu var.', minutes(g.shortPrepSeconds), minutes(g.shortWarSeconds), minutes(shortTotal), minutes(longTotal)),
      t('Kale tek seferde düşer: bir ordu kapıdaki savaşı kazanırsa (tek askeri kalsa bile) o kale elenir ve oyuncu izleyici olur. Kapıdaki okçular surun arkasından %{0} fazla hasar verir.', num(g.archerDefenseBonusPercent)),
    ]],
    [t('Ekonomi: işçi mi asker mi?'), [
      t('Her işçi çiftçi, oduncu, madenci ya da demirci olur. Boşta duran üretmez ama yemek yer. Kişi başı dakikada: yemek {0}, odun {1}, demir {2}.', num(g.foodPerMinute), num(g.woodPerMinute), num(g.ironPerMinute)),
      t('Herkes yemek yer: işçi {0}, asker {1} dakikada. <b>Her asker üretimden bir işçi eksiltir</b>: ordu büyüdükçe yemek ve silah azalır.', num(g.workerFoodPerMinute), num(g.soldierFoodPerMinute)),
      t('Yeni kişi yemekle doğar (ilk kişi {0} yemek, sonra her kişi {1} pahalı). Savaş başlayınca {2} sonra kıtlık başlar ve maç sonuna kadar sürer: yemek üretimi ×{3}.', num(g.newPersonBaseCost), percent(g.newPersonCostGrowth), minutes(g.famineStartSeconds), num(g.famineFoodMultiplier)),
    ]],
    [t('Binalar ve silah'), [
      t('Çiftlik, kereste, maden ve demirci: her birinde en çok {0} kişi çalışır. Yükseltince {1} kişi, üretim {2}.', l1.capacity,
        `${l2 ? `${l2.capacity}` : ''}${l3 ? `, ${l3.capacity}` : ''}${l4 ? ` ${t('ve')} ${l4.capacity}` : ''}`,
        `${l2 ? `×${num(l2.multiplier)}` : ''}${l3 ? `, ×${num(l3.multiplier)}` : ''}${l4 ? ` ${t('ve')} ×${num(l4.multiplier)}` : ''}`),
      l2 ? t('Yükseltme bedeli: {0} odun + {1} demir{2}; {3} sn sürer.', num(l2.upgradeWood), num(l2.upgradeIron),
        l3 ? ` (${t('sonra')} ${num(l3.upgradeWood)} + ${num(l3.upgradeIron)}${l4 ? `, ${t('en üst seviye')} ${num(l4.upgradeWood)} + ${num(l4.upgradeIron)}` : ''})` : '', upgrades) : '',
      t('Demirci demir ve odundan <b>silah</b> yapar; silahı askere çevirirsin, asker işçiye de geri dönebilir.'),
    ]],
    [t('Deste, keşiş, mancınık, süvari'), [
      g.deckEnabled ? t('Maç başında {0} birlikten <b>{1}</b> tanesini seçersin (lobide); yalnız onları üretir, kuşanır ve kiralarsın. Rakibin destesini yalnız gözcü raporunda görürsün.', g.units.length, g.deckSize) : '',
      ...g.units.filter((u) => u.heal).map((u) => t("<b>{0}</b>: arka sırada durur, saldırmaz; her {1} sn'de ordusundaki en yaralı dostuna {2} can verir. Okçuların öncelikli hedefi olarak seçilebilir.", esc(tr(u.name)), num(u.healInterval ?? 0), num(u.heal ?? 0))),
      ...g.units.filter((u) => u.backFirst).map((u) => t('<b>{0}</b>: savaşın başından itibaren düşmanın <b>arka sırasına</b> vurur, hedefin yanındaki {1} kişiye de yarım hasar; {2} kişi harcar. Yakın dövüşte çok zayıftır.', esc(tr(u.name)), u.splashTargets ?? 0, u.people ?? 2)),
      ...g.units.filter((u) => u.flank).map((u) => t('<b>{0}</b>: arka sırada okçu, mancınık ya da keşiş yaşadıkça ön sırayı aşıp onlara dalar; mızrakçıdan korkar. Haritada ×{1} hızlıdır. <b>Yalnız süvariden oluşan ordu</b> kapıda kazanırsa kale düşmez, rakibin tarlaları yanar (yemek üretimi {2} sn yarıya iner).', esc(tr(u.name)), num(u.speedFactor ?? 1), num(g.raidBurnSeconds ?? 60))),
    ]],
    [t('Krallıklar'), g.kingdoms?.length ? [
      t('Maç başında her oyuncuya <b>rastgele bir krallık</b> verilir (aynı maçta ikisi aynı olmaz); seçmezsin. Ne olduğunu başta bir fermanla öğrenirsin, düğmeleri sol üstteki krallık panelinde bulursun. Yetenekler bir kuralı değiştirir, sayı bonusu vermez.'),
      t('Rakibin kalesinin krallık süsleri (bayrak, sancaklar, minik eşyalar) <b>yalnız kalesi canlı görüşündeyken</b> ya da gözcü raporunda görünür; sisin altında kale sade çizilir.'),
      ...g.kingdoms.map((k) => `${emblemHtml(k.id, 'emblem-guide')}<b>${esc(tr(k.name))}</b> — ${esc(tr(k.decree))} ${k.abilities.map((a) => `<i>${esc(tr(a.name))}</i>: ${esc(tr(a.text))}`).join(' ')}`),
    ] : []],
    [t('Gözcü'), [
      t('Aynı anda en çok {0} gözcü. Bir rakibe gönder: dönünce <b>rapor</b> gelir (asker sayıları ±{1}% şaşabilir). Rakip gözetlendiğini öğrenir.', g.maxScouts, num(g.scoutErrorPercent)),
      t('Gözcü ormanın bir çeyreğini de gezer: bulduğu yerler haritada kalır. Hızı {0} karo/sn; ordu {1}.', num(g.scoutSpeed), num(g.armySpeed)),
    ]],
    [t('Orman: sandık, köy, kamp'), [
      t('Her köşenin çeyreğinde {0} sandık, {1} köy, {2} haydut kampı; ortada büyük kamp. Yerler gözcü yakınından geçince bulunur.', g.chestsPerCorner, g.villagesPerCorner, g.campsPerCorner),
      t('<b>Sandık</b> (gözcü alır): {0} altın{1}.', range(g.chest.gold), has(g.chest.iron) ? `, ${range(g.chest.iron)} ${t('demir')}` : ''),
      t('<b>Köy</b> (en az {0} asker, savaşsız): {1} altın{2}, {3} kişi.', g.village.minSoldiers, range(g.village.gold), has(g.village.food) ? `, ${range(g.village.food)} ${t('yemek')}` : '', range(g.village.people)),
      t('<b>Haydut kampı</b> (savaş: {0}): {1} altın{2}{3}. <b>Büyük kamp</b> daha güçlü ({4}), ödülü {5} altın.', counts(g.camp.bandits), range(g.camp.gold),
        has(g.camp.wood) ? `, ${range(g.camp.wood)} ${t('odun')}` : '', g.camp.weapons.length ? `, ${t('silah')} (${counts(g.camp.weapons)})` : '', counts(g.bigCamp.bandits), range(g.bigCamp.gold)),
      t('Yerler bir kez boşaltılır. Ganimet, ordu ya da gözcü <b>eve dönünce</b> gelir.'),
    ]],
    [t('Paralı asker'), [
      t('Altınla anında asker: {0} altın.', g.units.filter((u) => u.price !== null).map((u) => `${esc(tr(u.name))} ${num(u.price!)}`).join(', ')),
      t('İşçiden düşmez, nüfusa sayılır ve yemek yer; işçiye dönüştürülemez.'),
    ]],
    [t('Saldırı ve önünü kes'), [
      t('Savaş fazında rakip kalenin penceresinden birlik sayılarını (<b>Tümü / Yarısı</b> tek tıkla doldurur), sırayı ve okçu hedefini seç.'),
      t("Ordular yollardan yürür. Yolda karşılaşan düşman ordular savaşır. Kapıya varınca savunanlarla savaşılır; kazanırsan kale düşer: depodaki yemek, odun, demir ve altının {0}'i ile işçilerin {1}'ü ordunla eve gelir; ayrıca savunan ordunun {2}'i <b>esir</b> olur, senin askerin olarak eve döner.", percent(g.fallLootShare), percent(g.fallWorkerShare), percent(g.prisonerShare)),
      t('<b>Önünü kes</b>: ordu yolda karşılaştığı ilk orduyla savaşıp eve döner; rakip bunu bilemez.'),
      t('<b>Yeni emir</b>: yürüyen ordunu haritada tıkla; başka bir kaleye ya da ormandaki bir yere yönlendir ya da geri çağır. Rakipler yalnız yönünü görür, hedefini değil.'),
    ]],
    [t('Birlikler: kim kimi yener'), [], true],
    [t('Kale düşünce'), [
      t('Kalen düşerse elenirsin; haritayı izleyici olarak izlersin.'),
      t("Kaleyi düşüren ordu, depodaki yemek, odun, demir ve altının <b>{0}</b>'ini ve hayatta kalan işçilerin <b>{1}</b>'ünü (boşta) eve getirir.", percent(g.fallLootShare), percent(g.fallWorkerShare)),
    ]],
  ];
  const table = `
    <table class="guide-units">
      <tr><th>${t('Birlik')}</th><th>${t('Can')}</th><th>${t('Hasar/sn')}</th><th>${t('Bedel')}</th><th>${t('Daha iyi vurur')}</th><th>${t('Daha zayıf vurur')}</th></tr>
      ${g.units.map((u) => `<tr>
        <td><b>${esc(tr(u.name))}</b><small>${u.ranged ? t('uzaktan') : t('yakın')}</small></td><td>${num(u.hp)}</td><td>${num(u.dps)}</td>
        <td>${t('{0} demir, {1} odun', num(u.iron), num(u.wood))}</td><td>${u.strong.map((n) => esc(tr(n))).join(', ') || '—'}</td><td>${u.weak.map((n) => esc(tr(n))).join(', ') || '—'}</td></tr>`).join('')}
    </table>
    <p class="guide-note">${t('Ön sıra önce vurulur; arka sıradakiler öndekiler düşene kadar hasar almaz (yakın dövüşçüler orada yedektir).')}</p>`;
  return sections.map(([title, lines, units]) => `
    <section><h3>${title}</h3>${units ? table : `<ul>${lines.filter(Boolean).map((l) => `<li>${l}</li>`).join('')}</ul>`}</section>`).join('');
}

export function loadGuide(): Promise<Guide> {
  return load();
}

function load(): Promise<Guide> {
  cached ??= fetch(serverUrl('/api/guide')).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<Guide>; })
    .catch((e) => { cached = null; throw e; });
  return cached;
}

export function closeGuide(): void {
  const wasOpen = !!open;
  open?.remove();
  open = null;
  window.removeEventListener('keydown', onKey, true);
  if (!wasOpen) return;
  store.set(SEEN_KEY, 'true');
  flushWaiters();
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') { e.stopPropagation(); closeGuide(); }
}

/** Opens the decree (or closes it if it is open); `auto` is the first-time opening (it never closes an open one). */
export function toggleGuide(auto = false): void {
  if (open) { if (!auto) closeGuide(); return; }
  const overlay = document.createElement('div');
  overlay.className = 'guide-overlay';
  overlay.innerHTML = `
    <div class="guide paper" role="dialog" aria-label="${t('Nasıl oynanır')}">
      <div class="ribbon ribbon-blue guide-title">${t('Nasıl oynanır')}</div>
      <button class="btn-round btn-red guide-close" data-act="close" title="${t('Kapat (Esc)')}" aria-label="${t('Kapat')}"><i class="ico ico-close"></i></button>
      ${quickStart()}
      <div class="guide-body"><p class="guide-note">${t('Yükleniyor…')}</p></div>
      <div class="guide-foot"><button class="btn kf-btn--green" data-act="close">${document.documentElement.classList.contains('in-game') ? t('Anladım, Savaşa Başla!') : t('Anladım!')}</button></div>
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
    .catch(() => { if (open === overlay) body.innerHTML = `<p class="guide-note">${t('Rehber şu an yüklenemedi. Biraz sonra tekrar dene.')}</p>`; });
}

/** The "?" button for the menus (in the game it sits in the top bar). */
export function mountGuideButton(): void {
  const b = document.createElement('button');
  b.className = 'btn-round guide-fab';
  b.title = t('Nasıl oynanır?');
  b.setAttribute('aria-label', t('Nasıl oynanır?'));
  b.innerHTML = '<b>?</b>';
  b.addEventListener('click', () => toggleGuide());
  document.body.appendChild(b);
}
