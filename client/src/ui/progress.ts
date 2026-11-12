import { esc } from '../format';
import { t } from '../i18n';
import { emblemHtml } from './emblem';
import { logoHtml } from '../screens';
import {
  ACHIEVEMENTS, COSMETICS, FRAMES, KINGDOM_NAMES, MASTERY_WINS, earnedCount, isUnlocked, masteryLevel, nextMastery, setBannerPick, setFramePick,
  type MetaContext, type ProgressDelta,
} from '../progress/catalog';
import { KINGDOM_IDS, progressStore, type KingdomId } from '../progress/store';
import { bannerUrl, frameClass } from '../progress/looks';
import { MAX_LEVEL, MOMENT_NAMES, PATTERNS, TITLES, levelFill, levelOf, patternUnlocked, xpFor } from '../progress/level';
import { patternUrl, profileHtml } from './profile-look';
import type { XpGain } from '../progress/catalog';

// "Başarımlar ve Ustalık": the achievements, how far each kingdom has been mastered, and the cosmetics those open (banners, avatar frames).
// Cosmetics are looks only; nothing here changes how a match plays. Also the small progress panel of the end screen.

const pips = (level: number): string => `<span class="pg-pips" role="img" aria-label="${t('Ustalık {0} / 3', level)}">${[1, 2, 3].map((i) => `<i class="${i <= level ? 'on' : ''}"></i>`).join('')}</span>`;

/** How full the bar to the next mastery level is, 0–1 (1 at the top). */
function barFill(won: number): number {
  const next = nextMastery(won);
  if (next === null) return 1;
  const prev = [...MASTERY_WINS].reverse().find((n) => n <= won) ?? 0;
  return Math.max(0, Math.min(1, (won - prev) / (next - prev)));
}

function masteryCard(id: KingdomId, played: number, won: number): string {
  const level = masteryLevel(won), next = nextMastery(won);
  return `
    <article class="pg-kingdom">
      <header>${emblemHtml(id, 'emblem-rank')}<h3>${esc(KINGDOM_NAMES[id])}</h3>${pips(level)}</header>
      <div class="pg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(barFill(won) * 100)}"><i style="width:${Math.round(barFill(won) * 100)}%"></i></div>
      <p class="muted small">${t('{0} maç · {1} galibiyet', played, won)} · ${next === null ? t('en üst düzey') : t('sonraki düzey için {0} galibiyet daha', next - won)}</p>
    </article>`;
}

function swatch(attrs: string, label: string, img: string | null, on: boolean, locked: boolean, hint: string): string {
  return `<button class="pg-swatch${on ? ' on' : ''}${locked ? ' locked' : ''}" ${attrs} ${locked ? 'disabled' : ''} title="${esc(locked ? hint : label)}" aria-pressed="${on}">
    ${img ? `<img src="${img}" alt="" draggable="false">` : '<i class="pg-none"></i>'}<span>${esc(label)}</span>${locked ? `<small>${esc(hint)}</small>` : ''}</button>`;
}

export class ProgressScreen {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, _ctx: Omit<MetaContext, 'data'>, actions: { back: () => void }) {
    this.root = document.createElement('div');
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-back]')) { actions.back(); return; }
      const frame = el.closest<HTMLElement>('[data-frame]');
      if (frame) { setFramePick(frame.dataset.frame || null); this.render(); return; }
      const title = el.closest<HTMLElement>('[data-title]');
      if (title) { const d = progressStore().load(); d.picks.title = title.dataset.title || null; progressStore().save(d); this.render(); return; }
      const pattern = el.closest<HTMLElement>('[data-pattern]');
      if (pattern) { const d = progressStore().load(); d.picks.pattern = pattern.dataset.pattern === 'plain' ? null : pattern.dataset.pattern || null; progressStore().save(d); this.render(); return; }
      const banner = el.closest<HTMLElement>('[data-banner]');
      if (banner) { const [k, d] = banner.dataset.banner!.split(':'); setBannerPick(k as KingdomId, d); this.render(); }
    });
    // Esc goes back to the menu, like the "back" button (a settings or guide window that is open takes the key first: it stops it in the capture phase)
    const onKey = (e: KeyboardEvent): void => {
      if (!this.root.isConnected) { window.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Escape') actions.back();
    };
    window.addEventListener('keydown', onKey);
    this.render();
  }

  private render(): void {
    const data = progressStore().load();
    const total = ACHIEVEMENTS.length, got = earnedCount(data);
    const frames = [{ id: '', name: t('Çerçevesiz') }, ...FRAMES].map((f) => {
      const c = COSMETICS.find((x) => x.id === `frame:${f.id}`);
      const locked = !!c && !isUnlocked(c, data);
      return swatch(`data-frame="${f.id}"`, f.name, null, (data.picks.frame ?? '') === f.id, locked, c?.need ?? '').replace('<i class="pg-none"></i>', f.id ? `<i class="avatar pg-avatar${frameClass(f.id)}"></i>` : '<i class="avatar pg-avatar"></i>');
    }).join('');
    const banners = KINGDOM_IDS.map((k) => `
      <div class="pg-banner-row"><span class="pg-banner-name">${emblemHtml(k, 'emblem-rank')} ${esc(KINGDOM_NAMES[k])}</span>
        <div class="pg-swatches">${['a', 'b', 'c'].map((d) => {
          const c = COSMETICS.find((x) => x.id === `banner:${k}:${d}`);
          const locked = !!c && !isUnlocked(c, data);
          return swatch(`data-banner="${k}:${d}"`, d === 'a' ? t('Sade') : d === 'b' ? 'II' : 'III', bannerUrl(k, d), (data.picks.banners[k] ?? 'a') === d, locked, c?.need ?? '');
        }).join('')}</div></div>`).join('');
    const level = levelOf(data.xp);
    const titles = TITLES.map((x) => { const open = x.unlocked(data); return swatch(`data-title="${x.id}"`, x.name, null, data.picks.title === x.id, !open, x.need).replace('<i class="pg-none"></i>', ''); }).join('');
    const patterns = PATTERNS.map((p) => {
      const open = patternUnlocked(p, data);
      const url = patternUrl(p.id === 'plain' ? 'stripes' : p.id, 'blue');
      return swatch(`data-pattern="${p.id}"`, p.name, p.id === 'plain' ? null : url, (data.picks.pattern ?? 'plain') === p.id, !open, t('Seviye {0}', p.level));
    }).join('');
    const profile = `
          <section class="pf-section">
            <h2>${t('Profil')}</h2>
            <div class="pf-head"><span class="pf-big">${profileHtml({ level, title: data.picks.title && TITLES.find((x) => x.id === data.picks.title)?.unlocked(data) ? data.picks.title : null, pattern: data.picks.pattern && patternUnlocked(PATTERNS.find((x) => x.id === data.picks.pattern) ?? PATTERNS[0], data) ? data.picks.pattern : null, color: 'blue' })}</span>
              <div class="xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(levelFill(data.xp) * 100)}"><i style="width:${Math.round(levelFill(data.xp) * 100)}%"></i></div>
              <span class="muted small">${level >= MAX_LEVEL ? t('{0} XP · en üst seviye', data.xp) : t('{0} XP · sonraki seviye için {1} XP daha', data.xp, xpFor(level + 1) - data.xp)}</span></div>
            <p class="muted small">${t('Seviyen ve unvanın lobide ve maç sonunda adının yanında görünür. Yalnız süstür: oyuna hiçbir güç katmaz.')}</p>
            <h3>${t('Unvan')}</h3><div class="pg-swatches">${titles}</div>
            <h3>${t('Sancak deseni')}</h3><p class="muted small">${t('Desen kendi renginde çizilir ve hangi krallığı oynadığını belli etmez.')}</p><div class="pg-swatches">${patterns}</div>
          </section>`;
    const list = ACHIEVEMENTS.map((a) => {
      const at = data.achievements[a.id];
      return `<li class="pg-ach${at !== undefined ? ' got' : ''}" data-id="${a.id}"><i class="pg-medal" aria-hidden="true"></i><div><b>${esc(a.name)}</b><span class="muted small">${esc(a.desc)}</span></div></li>`;
    }).join('');
    this.root.innerHTML = `
      <div class="screen menu paper progress">
        ${logoHtml()}
        <div class="title-ribbon ribbon ribbon-blue">${t('Başarımlar ve Ustalık')}</div>
        <div class="pg-scroll">
          ${profile}
          <h2>${t('Krallık ustalığı')}</h2>
          <p class="muted small">${t('Bir krallıkla maç kazandıkça ustalığın artar; flama tasarımları ustalıkla açılır.')}</p>
          <div class="pg-kingdoms">${KINGDOM_IDS.map((k) => masteryCard(k, data.kingdoms[k].played, data.kingdoms[k].won)).join('')}</div>
          <h2>${t('Görünüş')}</h2>
          <p class="muted small">${t('Yalnız süstür, oyunu etkilemez. Çerçeven lobide ve maç sonunda herkese görünür; flaman yalnız kendi kalende asılı durur, maç bitince sıralamada herkes görür.')}</p>
          <h3>${t('Avatar çerçevesi')}</h3><div class="pg-swatches">${frames}</div>
          <h3>${t('Flamalar')}</h3>${banners}
          <h2>${t('Başarımlar')} <span class="muted small">${got} / ${total}</span></h2>
          <ul class="pg-achs">${list}</ul>
        </div>
        <div class="start"><button class="btn wide" data-back>${t('Ana menüye dön')}</button></div>
      </div>`;
  }
}

/** The progress block of the end screen: mastery of the kingdom just played and what opened. Empty when there is nothing to say. */
/** The XP the match paid: the lines, the level bar (filled by `animateXpBars` once it is on the screen) and what the new level opened. */
export function xpBlockHtml(x: XpGain | undefined): string {
  if (!x) return '';
  const names = MOMENT_NAMES();
  const lines: [string, string][] = [[t('Maç'), `+${x.match}`]];
  if (x.win) lines.push([t('Galibiyet'), `+${x.win}`]);
  if (Math.abs(x.modeFactor - 1) > 1e-9) lines.push([t('Maç süresi çarpanı ×{0}', String(x.modeFactor).replace('.', ',')), `+${Math.round((x.match + x.win) * x.modeFactor) - x.match - x.win}`]);
  for (const m of x.moments) lines.push([names[m.id] ?? m.id, `+${m.xp}`]);
  if (x.goals) lines.push([t('Görev hedefleri'), `+${x.goals}`]);
  if (x.firstClear) lines.push([t('Meydan okumayı ilk kez geçtin'), `+${x.firstClear}`]);
  const up = x.levelAfter > x.levelBefore;
  const from = Math.round(levelFill(x.before) * 100), to = Math.round(levelFill(x.after) * 100);
  const unlocks = [
    ...x.titles.map((a) => `<p class="xp-unlock">🎖 ${t('Yeni unvan: {0}', esc(a.name))}</p>`),
    ...x.patterns.map((a) => `<p class="xp-unlock">🚩 ${t('Yeni sancak deseni: {0}', esc(a.name))}</p>`),
  ].join('');
  return `<div class="xp-block"><h3>${t('Deneyim')} +${x.total} XP</h3>
    <ul class="xp-lines">${lines.map(([a, b]) => `<li><span>${esc(a)}</span><b>${esc(b)}</b></li>`).join('')}<li class="total"><span>${t('Toplam')}</span><b>+${x.total} XP</b></li></ul>
    <div class="xp-level"><span class="pf-level">${esc(t('Sv {0}', x.levelBefore))}</span>
      <div class="xp-bar" data-from="${from}" data-to="${to}" data-up="${up ? 1 : 0}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${to}"><i style="width:${from}%"></i></div></div>
    ${up ? `<p class="xp-up">${t('Seviye atladın: Sv {0}!', x.levelAfter)}</p>` : ''}${unlocks}</div>`;
}

/** Fills the level bar(s) of the XP block: from where the match found it to where it ended (a level up fills to the end, then the new level's part). */
export function animateXpBars(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.xp-bar[data-to]').forEach((bar) => {
    const fill = bar.firstElementChild as HTMLElement | null;
    if (!fill || bar.dataset.done) return;
    bar.dataset.done = '1';
    const to = Number(bar.dataset.to), up = bar.dataset.up === '1';
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (calm) { fill.style.width = `${to}%`; return; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.classList.add('animate');
      fill.style.width = up ? '100%' : `${to}%`;
      if (up) window.setTimeout(() => {
        bar.classList.remove('animate'); fill.style.width = '0%';
        requestAnimationFrame(() => requestAnimationFrame(() => { bar.classList.add('animate'); fill.style.width = `${to}%`; }));
      }, 1000);
    }));
  });
}

export function progressPanelHtml(delta: ProgressDelta | null): string {
  if (!delta) return '';
  const data = progressStore().load();
  const parts: string[] = [];
  parts.push(xpBlockHtml(delta.xp));
  if (delta.kingdom) {
    const k = delta.kingdom, rec = data.kingdoms[k];
    const up = delta.masteryAfter > delta.masteryBefore;
    parts.push(`<div class="pg-end-kingdom">${masteryCard(k, rec.played, rec.won)}${up ? `<p class="pg-up">${t('Ustalık yükseldi: düzey {0}!', delta.masteryAfter)}</p>` : ''}</div>`);
  }
  if (delta.newAchievements.length) {
    parts.push(`<div class="pg-new"><h3>${delta.newAchievements.length === 1 ? t('Yeni başarım!') : t('Yeni başarımlar!')}</h3><ul class="pg-achs">${delta.newAchievements.map((a) =>
      `<li class="pg-ach got fresh"><i class="pg-medal" aria-hidden="true"></i><div><b>${esc(a.name)}</b><span class="muted small">${esc(a.desc)}</span></div></li>`).join('')}</ul></div>`);
  }
  if (delta.newCosmetics.length) {
    parts.push(`<div class="pg-new"><h3>${t('Yeni açılım!')}</h3><p>${delta.newCosmetics.map((c) => `<b>${esc(c.name)}</b>`).join(', ')}</p><p class="muted small">${t('Ana menüdeki "Başarımlar ve Ustalık" ekranından seçebilirsin.')}</p></div>`);
  }
  return parts.length ? `<h2>${t('İlerleme')}</h2><div class="pg-end">${parts.join('')}</div>` : '';
}

/** Merges the later news (history achievements after the challenge stars were saved) into what the end screen already shows. */
export function mergeDelta(a: ProgressDelta | null, more: Pick<ProgressDelta, 'newAchievements' | 'newCosmetics'>): ProgressDelta | null {
  if (!a) return a;
  const have = new Set(a.newAchievements.map((x) => x.id));
  const haveC = new Set(a.newCosmetics.map((x) => x.id));
  return {
    ...a,
    newAchievements: [...a.newAchievements, ...more.newAchievements.filter((x) => !have.has(x.id))],
    newCosmetics: [...a.newCosmetics, ...more.newCosmetics.filter((x) => !haveC.has(x.id))],
  };
}
