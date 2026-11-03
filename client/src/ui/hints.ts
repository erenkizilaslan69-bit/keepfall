import type { CastleView } from '../types';
import { t } from '../i18n';
import { showsHints } from '../prefs';

// Short tips that appear when something in the game calls for them: idle workers, food running low, an enemy army on its way, the first scout report, the
// war beginning. Each comes at most once per match, only while the tutorial is not running, and the player can switch them all off in the settings.

const IDLE_WORKERS = 3, IDLE_SECONDS = 20;

export class Hints {
  private readonly seen = new Set<string>();
  private idleSince = 0;
  private phase: CastleView['phase'] | null = null;
  private reports: number | null = null;

  constructor(private readonly show: (text: string) => void) {}

  private once(key: string, text: string): void {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.show(text);
  }

  /** `quiet`: the tutorial is talking (nothing is said, but what happens is noted so it is not announced afterwards). */
  update(s: CastleView, quiet: boolean): void {
    const now = performance.now();
    const idle = s.jobs.find((j) => j.job === 'idle')?.count ?? 0;
    this.idleSince = idle >= IDLE_WORKERS ? (this.idleSince || now) : 0;
    const warStarted = this.phase === 'preparation' && s.phase === 'war';
    const newReport = this.reports !== null && s.scouting.reports.length > this.reports;
    this.phase = s.phase;
    this.reports = s.scouting.reports.length;
    if (quiet || !showsHints() || s.eliminated) return;

    if (warStarted) this.once('war', t('Savaş başladı! Bir rakip kalenin penceresinden ordularını yola çıkarabilirsin.'));
    if (newReport) this.once('report', t('Gözcün döndü: rapora tıklayıp rakibin ordusunu gör.'));
    if (s.war.incoming.length > 0) this.once('incoming', t('Bir düşman ordusu geliyor! Kale penceresinden işçileri askere çevir (kuşan) ve Savunma sekmesine bak.'));
    if (this.idleSince && now - this.idleSince > IDLE_SECONDS * 1000) this.once('idle', t('{0} işçin boşta: yemek yerler ama üretmezler. Bir binaya + ile işçi ata.', idle));
    if (s.elapsedSeconds > 20 && s.rates.foodIn < s.rates.foodOut && s.resources.food < Math.max(40, s.rates.foodOut * 3)) {
      this.once('food', t('Yemek azalıyor: tarlaya işçi ekle, yoksa açlık başlar.'));
    }
  }
}
