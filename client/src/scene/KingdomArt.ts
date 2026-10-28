import Phaser from 'phaser';
import type { PlayerColor } from '../types';

// The kingdoms' look: ornaments drawn in code over a castle in the player's own colour (so the colour still tells whose it is): a banner with the
// kingdom's emblem on the keep, pennants, and a few props at its foot. A kingdom is a "look" id (the server's Faction.Look); adding one means adding
// a drawing here. Another player's ornaments are only put up while their castle is in live sight (the server sends their kingdom only then).

export const LOOK_OF: Record<string, string> = { golge: 'shadow', tuccar: 'merchant', kahin: 'oracle', entrikaci: 'schemer' };

const TEAM: Record<PlayerColor, number> = { blue: 0x3b6fd6, red: 0xc9443b, yellow: 0xe0b43a, purple: 0x8a5cc4, black: 0x3a3a44 };
const WOOD = 0x6b4426, WOOD_DARK = 0x3d2615, INK = 0x1c1420;

type Draw = (g: Phaser.GameObjects.Graphics, team: number) => void;

const rect = (g: Phaser.GameObjects.Graphics, color: number, x: number, y: number, w: number, h: number) => { g.fillStyle(color, 1); g.fillRect(x, y, w, h); };
const disc = (g: Phaser.GameObjects.Graphics, color: number, x: number, y: number, r: number) => { g.fillStyle(color, 1); g.fillCircle(x, y, r); };
const tri = (g: Phaser.GameObjects.Graphics, color: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
  g.fillStyle(color, 1); g.fillTriangle(x1, y1, x2, y2, x3, y3);
};

/** A flag on a pole: the pole's foot is at (x, y); the cloth is in the player's colour with the kingdom's colour as a border and an emblem. */
function banner(g: Phaser.GameObjects.Graphics, x: number, y: number, team: number, accent: number, emblem: (cx: number, cy: number) => void, tall = 64): void {
  rect(g, WOOD_DARK, x - 2, y - tall - 14, 4, tall + 14);
  disc(g, accent, x, y - tall - 16, 4);
  rect(g, accent, x + 2, y - tall - 8, 40, 52);
  rect(g, team, x + 5, y - tall - 5, 34, 46);
  tri(g, accent, x + 2, y - tall + 44, x + 22, y - tall + 58, x + 42, y - tall + 44);
  tri(g, team, x + 5, y - tall + 41, x + 22, y - tall + 53, x + 39, y - tall + 41);
  emblem(x + 22, y - tall + 18);
}

const crescent = (g: Phaser.GameObjects.Graphics, team: number) => (cx: number, cy: number) => {
  disc(g, 0xe9e2ff, cx, cy, 11);
  disc(g, team, cx + 5, cy - 2, 10);
  disc(g, 0xe9e2ff, cx + 13, cy + 12, 2);
};
const coin = (g: Phaser.GameObjects.Graphics) => (cx: number, cy: number) => {
  disc(g, 0x8a5a10, cx, cy, 12); disc(g, 0xf4cc3c, cx, cy, 10); disc(g, 0xd9a526, cx, cy, 6); rect(g, 0xf4cc3c, cx - 1, cy - 4, 3, 8);
};
const eye = (g: Phaser.GameObjects.Graphics) => (cx: number, cy: number) => {
  g.fillStyle(0xffffff, 1); g.fillEllipse(cx, cy, 28, 16); disc(g, 0x3f86b5, cx, cy, 6); disc(g, INK, cx, cy, 3); disc(g, 0xffffff, cx - 2, cy - 2, 1.5);
};
const mask = (g: Phaser.GameObjects.Graphics) => (cx: number, cy: number) => {
  rect(g, 0xf0e6d0, cx - 10, cy - 12, 20, 24); rect(g, INK, cx - 7, cy - 6, 5, 4); rect(g, INK, cx + 2, cy - 6, 5, 4); rect(g, 0x8a2a22, cx - 5, cy + 4, 10, 2);
  rect(g, 0xb24a4a, cx - 10, cy - 12, 20, 3);
};

const LOOKS: Record<string, Draw> = {
  shadow: (g, team) => {
    const accent = 0x5b3f8f;
    banner(g, 0, -226, team, accent, crescent(g, team), 44);
    for (const sx of [-1, 1]) {
      banner(g, sx * 118, -214, team, accent, (cx, cy) => disc(g, 0xe9e2ff, cx, cy, 5), 30);
      // a dark obelisk with a glowing rune
      const ox = sx * 270;
      rect(g, 0x2a2140, ox - 10, -96, 20, 96); tri(g, 0x2a2140, ox - 10, -96, ox + 10, -96, ox, -122);
      rect(g, 0x7a5cc0, ox - 3, -80, 6, 22); rect(g, 0x7a5cc0, ox - 6, -70, 12, 4);
      g.fillStyle(0x9d7bff, 0.25); g.fillCircle(ox, -69, 20);
    }
    // a string of dark pennants over the gate
    for (let i = -4; i <= 4; i++) tri(g, i % 2 ? accent : 0x2a2140, i * 24 - 10, -128 + Math.abs(i) * 2, i * 24 + 10, -128 + Math.abs(i) * 2, i * 24, -108 + Math.abs(i) * 2);
  },
  merchant: (g, team) => {
    const accent = 0xd8a527;
    banner(g, 0, -226, team, accent, coin(g), 44);
    // a striped awning at the gate
    for (let i = 0; i < 10; i++) rect(g, i % 2 ? 0xf4ecd6 : accent, -60 + i * 12, -118, 12, 22);
    tri(g, accent, -64, -96, 64, -96, 0, -84);
    for (const sx of [-1, 1]) {
      banner(g, sx * 118, -210, team, accent, (cx, cy) => disc(g, 0xf4cc3c, cx, cy, 5), 30);
      const ox = sx * 250;
      // coin stacks and crates
      for (let i = 0; i < 4; i++) { g.fillStyle(0x8a5a10, 1); g.fillEllipse(ox, -8 - i * 8, 34, 12); g.fillStyle(0xf4cc3c, 1); g.fillEllipse(ox, -11 - i * 8, 34, 12); }
      rect(g, WOOD, ox + sx * 34 - 14, -26, 28, 26); rect(g, WOOD_DARK, ox + sx * 34 - 14, -16, 28, 3); rect(g, 0xd9a526, ox + sx * 34 - 3, -26, 6, 26);
    }
  },
  oracle: (g, team) => {
    const accent = 0x3f86b5;
    banner(g, 0, -226, team, accent, eye(g), 44);
    for (const sx of [-1, 1]) {
      banner(g, sx * 118, -214, team, accent, (cx, cy) => { disc(g, 0xe8f3ff, cx, cy, 5); rect(g, 0xe8f3ff, cx - 1, cy - 9, 2, 18); rect(g, 0xe8f3ff, cx - 9, cy - 1, 18, 2); }, 30);
    }
    // a crystal ball on a stone pedestal, and a rune stone
    rect(g, 0x7a808c, 214, -26, 36, 26); rect(g, 0x9aa1ae, 210, -30, 44, 6);
    g.fillStyle(0x7fc4ff, 0.3); g.fillCircle(232, -52, 34);
    disc(g, 0x9edcff, 232, -52, 20); disc(g, 0xe8f6ff, 225, -60, 5);
    const rx = -250;
    rect(g, 0x646b78, rx - 14, -110, 28, 110); tri(g, 0x646b78, rx - 14, -110, rx + 14, -110, rx, -132);
    rect(g, 0x7fc4ff, rx - 3, -92, 6, 28); rect(g, 0x7fc4ff, rx - 8, -82, 16, 4);
    g.fillStyle(0x7fc4ff, 0.22); g.fillCircle(rx, -78, 22);
  },
  schemer: (g, team) => {
    const accent = 0xb24a4a;
    banner(g, 0, -226, team, accent, mask(g), 44);
    for (const sx of [-1, 1]) {
      banner(g, sx * 118, -214, team, 0x3f7a4a, (cx, cy) => { rect(g, 0xf0e6d0, cx - 5, cy - 6, 10, 12); rect(g, INK, cx - 3, cy - 2, 2, 2); rect(g, INK, cx + 1, cy - 2, 2, 2); }, 30);
      // a mask on a pole
      const ox = sx * 250;
      rect(g, WOOD_DARK, ox - 2, -92, 4, 92); mask(g)(ox, -104);
      // striped red/green ribbon
      for (let i = 0; i < 6; i++) rect(g, i % 2 ? 0x3f7a4a : accent, ox + sx * 28 + i * 6 * sx - 3, -40, 6, 14);
    }
    // a hooded figure at the foot of the keep
    const hx = 214;
    tri(g, 0x4a1f26, hx - 22, 0, hx + 22, 0, hx, -64); disc(g, 0x4a1f26, hx, -66, 13); rect(g, INK, hx - 7, -68, 14, 9); disc(g, 0xf4d24a, hx - 3, -64, 1.5); disc(g, 0xf4d24a, hx + 3, -64, 1.5);
  },
};

export class KingdomArt {
  private readonly groups = new Map<string, { look: string; team: PlayerColor; node: Phaser.GameObjects.Container }>();

  constructor(private readonly scene: Phaser.Scene) {}

  /** Puts up (or takes down, for a null look) the ornaments of the castle `key`, standing at (x, y) as the castle sprite does. */
  set(key: string, look: string | null, team: PlayerColor, x: number, y: number, scale: number): void {
    const have = this.groups.get(key);
    if (!look || !LOOKS[look]) { if (have) { have.node.destroy(); this.groups.delete(key); } return; }
    if (have && have.look === look && have.team === team) return;
    have?.node.destroy();
    const g = this.scene.add.graphics();
    LOOKS[look](g, TEAM[team]);
    const node = this.scene.add.container(x, y, [g]).setScale(scale).setDepth(y + 2);
    this.scene.tweens.add({ targets: g, angle: { from: -0.6, to: 0.6 }, duration: 1800 + (key.length % 3) * 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.groups.set(key, { look, team, node });
  }

  /** The ornaments that are up (for the debug layer and tests). */
  get count(): number { return this.groups.size; }
  keys(): string[] { return [...this.groups.keys()]; }
}
