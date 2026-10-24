import { COLOR_CSS } from './format';
import type { MapLayoutView, PlayerColor, Vec, VisionView } from './types';

// The minimap in the corner of the scene: the whole map at a glance, darkened where we cannot see,
// with castles, our armies and scouts, whatever enemy movement we can see, and the camera's view.
// Clicking it moves the camera there. Plain 2D canvas, redrawn a few times a second.

const SIZE = 180;
const REDRAW_MS = 200;

export interface MinimapMover { position: Vec; color: PlayerColor; own: boolean; scout: boolean }

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly base: HTMLCanvasElement;
  private readonly fog: HTMLCanvasElement;
  private readonly k: number;
  private lastDraw = 0;

  constructor(parent: HTMLElement, private readonly layout: MapLayoutView, onJump: (tile: Vec) => void) {
    this.k = SIZE / layout.size;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = this.canvas.height = SIZE;
    this.canvas.title = 'Mini harita: tıkladığın yere bakar';
    parent.appendChild(this.canvas);
    this.base = this.drawBase();
    this.fog = document.createElement('canvas');
    this.fog.width = this.fog.height = SIZE;
    const jump = (e: MouseEvent) => {
      const r = this.canvas.getBoundingClientRect();
      onJump({ x: ((e.clientX - r.left) / r.width) * layout.size, y: ((e.clientY - r.top) / r.height) * layout.size });
    };
    this.canvas.addEventListener('mousedown', (e) => { jump(e); e.preventDefault(); });
    this.canvas.addEventListener('mousemove', (e) => { if (e.buttons & 1) jump(e); });
  }

  destroy(): void {
    this.canvas.remove();
  }

  /** <paramref name="view"/>: the camera's rectangle, in tiles. */
  draw(vision: VisionView[], movers: MinimapMover[], view: { x: number; y: number; w: number; h: number }): void {
    const now = performance.now();
    if (now - this.lastDraw < REDRAW_MS) return;
    this.lastDraw = now;
    const k = this.k;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(this.base, 0, 0);

    // Fog: dark everywhere, holes where we see.
    const f = this.fog.getContext('2d')!;
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, SIZE, SIZE);
    f.fillStyle = 'rgba(8, 12, 18, 0.6)';
    f.fillRect(0, 0, SIZE, SIZE);
    f.globalCompositeOperation = 'destination-out';
    for (const c of vision) {
      f.beginPath();
      f.arc(c.center.x * k, c.center.y * k, c.radius * k, 0, Math.PI * 2);
      f.fill();
    }
    ctx.drawImage(this.fog, 0, 0);

    for (const m of movers) {
      ctx.beginPath();
      ctx.arc(m.position.x * k, m.position.y * k, m.scout ? 2 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_CSS[m.color] ?? '#888';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = m.own ? '#fff8e6' : '#1d1b18';
      ctx.stroke();
    }

    ctx.strokeStyle = '#fff8e6';
    ctx.lineWidth = 1;
    ctx.strokeRect(view.x * k + 0.5, view.y * k + 0.5, view.w * k, view.h * k);
  }

  /** Grass, water rim, forest, roads and every castle: drawn once. */
  private drawBase(): HTMLCanvasElement {
    const k = this.k, l = this.layout;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#47aba9';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#7fae4f';
    ctx.fillRect(k, k, SIZE - 2 * k, SIZE - 2 * k);
    for (const f of l.features) {
      ctx.fillStyle = '#3f6e3a';
      ctx.beginPath();
      ctx.arc(f.center.x * k, f.center.y * k, f.radius * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#d8b779';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (const r of l.roads) {
      ctx.beginPath();
      r.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * k, p.y * k) : ctx.lineTo(p.x * k, p.y * k)));
      ctx.stroke();
    }
    for (const r of l.regions) {
      if (!r.color) continue;
      const castle = { x: r.origin.x + 8, y: r.origin.y + 5.5 };
      ctx.fillStyle = COLOR_CSS[r.color] ?? '#888';
      ctx.strokeStyle = '#1d1b18';
      ctx.lineWidth = 1.5;
      ctx.fillRect(castle.x * k - 5, castle.y * k - 5, 10, 10);
      ctx.strokeRect(castle.x * k - 5, castle.y * k - 5, 10, 10);
    }
    return c;
  }
}
