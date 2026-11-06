// Dev-only preview of every banner design (open /banner-lab.html on the Vite dev server). Not part of the game build.
import { clothCanvas, DESIGNS, poleCanvas } from './scene/Banners';

const KINGDOMS: Record<string, string> = { golge: 'Gölge', tuccar: 'Tüccar', kahin: 'Kâhin', entrikaci: 'Entrikacı' };
const root = document.getElementById('root')!;
for (const id of Object.keys(KINGDOMS)) {
  const row = document.createElement('div');
  row.className = 'row';
  for (const design of Object.keys(DESIGNS[id])) {
    const pole = poleCanvas(DESIGNS[id][design].pole), cloth = clothCanvas(id, design);
    const c = document.createElement('canvas');
    c.width = 56; c.height = 100;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(pole, 0, 0, 56, 120, 0, 0, 56, 120);
    if (cloth) g.drawImage(cloth, 6, 15);
    c.style.width = '168px'; c.style.height = '300px';
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.appendChild(c);
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = `${KINGDOMS[id]} ${design.toUpperCase()}`;
    cell.appendChild(name);
    row.appendChild(cell);
  }
  root.appendChild(row);
}
