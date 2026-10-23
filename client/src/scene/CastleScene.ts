import Phaser from 'phaser';
import type { BuildingType, BuildingView, CastleView, Job } from '../types';

// Placeholder art: the castle and its buildings are plain shapes. A building grows and changes
// material with its level (1 wood, 2 stone base, 3 stone with a flag); dots are the people working there.

export const SCENE_WIDTH = 640;
export const SCENE_HEIGHT = 520;

const SPOTS: Record<BuildingType, { x: number; y: number; color: number }> = {
  farm: { x: 150, y: 130, color: 0xc8b04a },
  lumberCamp: { x: 490, y: 130, color: 0x6b8f3a },
  mine: { x: 150, y: 400, color: 0x8a8f99 },
  forge: { x: 490, y: 400, color: 0xb5562f },
};

const UNIT_COLORS: Record<string, number> = { okcu: 0x3fa34d, kilicli: 0x4a78c2, mizrakci: 0xc2a24a, kalkanli: 0x9a5fc2 };
const WOOD = 0x8b5a2b;
const STONE = 0x9e9e9e;
const DARK = 0x2b2b2b;

export class CastleScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private state: CastleView | null = null;
  private pulse = 0;

  constructor() {
    super('castle');
  }

  create(): void {
    this.g = this.add.graphics();
    for (const [type, spot] of Object.entries(SPOTS)) {
      this.labels.set(type, this.add.text(spot.x, spot.y + 62, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#e8e2d0', align: 'center' }).setOrigin(0.5, 0));
    }
    this.labels.set('castle', this.add.text(320, 330, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#e8e2d0', align: 'center' }).setOrigin(0.5, 0));
    this.labels.set('idle', this.add.text(320, 352, '', { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#ffd84a', fontStyle: 'bold' }).setOrigin(0.5, 0));
    if (this.state) this.draw();
  }

  setState(state: CastleView): void {
    this.state = state;
    if (this.g) this.draw();
  }

  update(_time: number, delta: number): void {
    // Only the idle-people highlight animates; redraw for it while anyone is idle.
    if (!this.state || this.workers('idle') === 0) return;
    this.pulse = (this.pulse + delta / 600) % (Math.PI * 2);
    this.draw();
  }

  private workers(job: Job): number {
    return this.state?.jobs.find((j) => j.job === job)?.count ?? 0;
  }

  private draw(): void {
    const s = this.state!;
    const g = this.g;
    g.clear();

    // Ground and paths to each building.
    g.fillStyle(0x3d5a2f).fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    g.lineStyle(10, 0x6b5a3a, 1);
    for (const spot of Object.values(SPOTS)) g.lineBetween(320, 260, spot.x, spot.y);

    this.drawCastle(s);
    for (const b of s.buildings) this.drawBuilding(b);
  }

  private drawCastle(s: CastleView): void {
    const g = this.g;
    const cx = 320, cy = 250;
    g.fillStyle(STONE).fillRect(cx - 70, cy - 50, 140, 100);
    for (const tx of [cx - 70, cx + 50]) {
      g.fillRect(tx - 6, cy - 80, 32, 130);
      for (let i = 0; i < 3; i++) g.fillRect(tx - 6 + i * 12, cy - 92, 8, 12);
    }
    g.fillStyle(DARK).fillRect(cx - 16, cy + 10, 32, 40);
    g.lineStyle(2, DARK).strokeRect(cx - 70, cy - 50, 140, 100);

    // Soldiers stand in a row in front of the gate, coloured by unit type.
    let i = 0;
    for (const u of s.units) {
      g.fillStyle(UNIT_COLORS[u.id] ?? 0xffffff);
      for (let k = 0; k < u.soldiers; k++, i++) {
        const col = i % 16, row = Math.floor(i / 16);
        g.fillCircle(cx - 75 + col * 10, cy + 62 + row * 10, 4);
      }
    }

    const idle = this.workers('idle');
    if (idle > 0) {
      const a = 0.55 + 0.45 * Math.sin(this.pulse);
      g.fillStyle(0xffd84a, a);
      for (let k = 0; k < idle; k++) g.fillCircle(cx - 60 + (k % 14) * 9, cy - 110 - Math.floor(k / 14) * 9, 3.5);
    }
    this.labels.get('castle')!.setText(`Kale · nüfus ${s.population}`).setY(cy + 62 + Math.ceil(i / 16) * 10 + 6);
    this.labels.get('idle')!.setText(idle > 0 ? `${idle} kişi boşta!` : '').setY(cy - 140 - Math.floor((idle - 1) / 14) * 9);
  }

  private drawBuilding(b: BuildingView): void {
    const g = this.g;
    const spot = SPOTS[b.type];
    const size = 46 + (b.level - 1) * 14;
    const x = spot.x - size / 2, y = spot.y - size / 2;

    if (b.level >= 2) {
      g.fillStyle(STONE).fillRect(x - 6, y + size - 10, size + 12, 14); // stone foundation
    }
    g.fillStyle(b.level >= 3 ? STONE : WOOD).fillRect(x, y, size, size);
    g.fillStyle(spot.color).fillRect(x + 6, y + 6, size - 12, size * 0.35); // colour band = what it makes
    g.fillStyle(b.level >= 3 ? 0x7a3b2e : 0x5a3a1e).fillTriangle(x - 4, y, x + size + 4, y, spot.x, y - size * 0.45);
    if (b.level >= 3) {
      g.lineStyle(2, DARK).lineBetween(spot.x, y - size * 0.45, spot.x, y - size * 0.45 - 26);
      g.fillStyle(0xd23c3c).fillTriangle(spot.x, y - size * 0.45 - 26, spot.x + 18, y - size * 0.45 - 20, spot.x, y - size * 0.45 - 14);
    }
    g.lineStyle(2, DARK).strokeRect(x, y, size, size);

    // Worker slots: filled dot = working, hollow = free capacity.
    const count = this.workers(b.worker);
    for (let k = 0; k < b.capacity; k++) {
      const dx = spot.x - (b.capacity - 1) * 6 + k * 12, dy = y + size + 12;
      if (k < count) g.fillStyle(0xf2e6c9).fillCircle(dx, dy, 4);
      else g.lineStyle(1.5, 0xf2e6c9, 0.7).strokeCircle(dx, dy, 4);
    }

    if (b.upgradeRemaining !== null) {
      const p = 1 - b.upgradeRemaining / b.upgradeTotal;
      g.fillStyle(DARK).fillRect(x, y - size * 0.45 - 16, size, 6);
      g.fillStyle(0xffd84a).fillRect(x, y - size * 0.45 - 16, size * p, 6);
    }
    this.labels.get(b.type)!.setText(`${b.name} · Sv ${b.level}\n${count}/${b.capacity}`).setY(y + size + 22);
  }
}
