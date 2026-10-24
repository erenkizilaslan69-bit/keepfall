// Tiny Swords UI art, cut into CSS-ready pieces at start-up.
//
// The pack's panels, buttons and ribbons come as 3×3 sheets with gaps between the tiles (the gaps are
// part of the sheet, not of the art), which `border-image` cannot skip. So each sheet is stitched into
// a compact 3×3 image on a canvas and handed to CSS as a custom property:
//   --paper, --paper-dark, --btn-blue, --btn-red (+ -down), --ribbon-blue/red/yellow/purple/black,
//   --ribbon-small-…, --bar-base, --bar-fill
// If the art is missing (it is not in the repository, see the README) nothing is set, the `ui-art`
// class stays off <html>, and the plain fallback styles in ui.css are used.

const ROOT = '/assets/tiny-swords/Tiny Swords (Free Pack)/UI Elements/UI Elements/';
const url = (path: string) => encodeURI(ROOT + path);

async function load(path: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url(path);
  await img.decode();
  return img;
}

/** Cuts the listed rectangles of a sheet and lays them out in a row/column grid, edge to edge. */
function stitch(img: HTMLImageElement, xs: [number, number][], ys: [number, number][]): string {
  const width = xs.reduce((n, [, w]) => n + w, 0), height = ys.reduce((n, [, h]) => n + h, 0);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  let dy = 0;
  for (const [sy, h] of ys) {
    let dx = 0;
    for (const [sx, w] of xs) {
      ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h);
      dx += w;
    }
    dy += h;
  }
  return `url(${canvas.toDataURL('image/png')})`;
}

const TILES3: [number, number][] = [[0, 64], [128, 64], [256, 64]];
const RIBBON_COLORS = ['blue', 'red', 'yellow', 'purple', 'black'] as const;
export type RibbonColor = (typeof RIBBON_COLORS)[number];

/** Resolves once the art is cut and applied (or immediately, with fallbacks, if it cannot be loaded). */
export async function loadUiArt(): Promise<boolean> {
  try {
    const root = document.documentElement.style;
    const set = (name: string, value: string) => root.setProperty(name, value);

    const paper = await load('Papers/RegularPaper.png');
    set('--paper', stitch(paper, TILES3, TILES3));
    set('--paper-dark', stitch(await load('Papers/SpecialPaper.png'), TILES3, TILES3));

    const blue = await load('Buttons/BigBlueButton_Regular.png');
    set('--btn-blue', stitch(blue, TILES3, TILES3));
    set('--btn-blue-down', stitch(await load('Buttons/BigBlueButton_Pressed.png'), TILES3, TILES3));
    const red = await load('Buttons/BigRedButton_Regular.png');
    set('--btn-red', stitch(red, TILES3, TILES3));
    set('--btn-red-down', stitch(await load('Buttons/BigRedButton_Pressed.png'), TILES3, TILES3));

    const big = await load('Ribbons/BigRibbons.png');
    const small = await load('Ribbons/SmallRibbons.png');
    RIBBON_COLORS.forEach((c, i) => {
      // Big: 128 | 64 | 128 wide, one 128-high row per colour. Small: 64 | 64 | 64 wide, two 64-high rows per colour.
      set(`--ribbon-${c}`, stitch(big, [[0, 128], [192, 64], [320, 128]], [[i * 128, 128]]));
      set(`--ribbon-small-${c}`, stitch(small, TILES3, [[i * 128, 64]]));
    });

    for (const [name, file] of [['round-blue', 'SmallBlueRoundButton'], ['round-red', 'SmallRedRoundButton'],
      ['square-blue', 'SmallBlueSquareButton'], ['square-red', 'SmallRedSquareButton']] as const) {
      set(`--${name}`, `url("${url(`Buttons/${file}_Regular.png`)}")`);
      set(`--${name}-down`, `url("${url(`Buttons/${file}_Pressed.png`)}")`);
    }
    set('--bar-base', stitch(await load('Bars/BigBar_Base.png'), TILES3, [[0, 64]]));
    for (const [name, file] of [['coin', '03'], ['wood', '02'], ['meat', '04'], ['hammer', '01'], ['sword', '05'], ['shield', '06'],
      ['back', '08'], ['close', '09'], ['gear', '10'], ['info', '11'], ['play', '07']] as const)
      set(`--ico-${name}`, `url("${url(`Icons/Icon_${file}.png`)}")`);

    document.documentElement.classList.add('ui-art');
    return true;
  } catch (e) {
    console.warn('Tiny Swords arayüz görselleri yüklenemedi, sade stil kullanılıyor.', e);
    return false;
  }
}
