// The settings' drop-downs and check boxes in the game's own look: they must still work from the keyboard (Enter / arrows / Esc, Space) and the mouse, and the
// value must reach the real <select> / checkbox. Prints a picture with a drop-down list open. Needs the dev server (5081) and Vite (5174).
//   node tools/check-settings-controls.mjs [out-dir]      → <out-dir>/open-list.png
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const OUT = process.argv[2] ?? 'art/shots/cila2/settings-after';
mkdirSync(OUT, { recursive: true });
const b = await launch({ width: 1280, height: 720, init: `try{localStorage.setItem('keepfall_lang','en')}catch(e){}` });
let bad = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) bad++; };
try {
  await b.goto('http://localhost:5174/');
  await b.waitFor(`!!document.querySelector('#quick')`);
  await sleep(1500);
  await b.js(`document.querySelector('.settings-fab').click(); 1`);
  await b.waitFor(`!!document.querySelector('.settings .set-tab')`, 10);
  await b.js(`document.querySelector('.set-tab[data-tab="display"]').click(); 1`);
  await sleep(300);
  const key = (k) => b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k === ' ' ? 'Space' : k, windowsVirtualKeyCode: { Enter: 13, ArrowDown: 40, ArrowUp: 38, Escape: 27, ' ': 32 }[k], text: k === 'Enter' ? '\r' : k === ' ' ? ' ' : undefined })
    .then(() => b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k === ' ' ? 'Space' : k, windowsVirtualKeyCode: { Enter: 13, ArrowDown: 40, ArrowUp: 38, Escape: 27, ' ': 32 }[k] }));
  check('native select hidden, styled button shown', await b.js(`getComputedStyle(document.querySelector('#set-quality')).opacity === '0' && !!document.querySelector('#set-quality-btn')`));
  // keyboard: focus the button, Enter opens, ArrowDown moves, Enter picks
  await b.js(`document.querySelector('#set-quality-btn').focus(); 1`);
  await key('Enter'); await sleep(150);
  check('Enter opens the list', await b.js(`!!document.querySelector('.kf-select-list') && document.querySelector('#set-quality-btn').getAttribute('aria-expanded') === 'true'`));
  await b.shot(`${OUT}/open-list.png`);
  await key('Escape'); await sleep(150);
  check('Esc closes only the list (the window stays)', await b.js(`!document.querySelector('.kf-select-list') && !!document.querySelector('.settings')`));
  await key('Enter'); await sleep(100); await key('ArrowDown'); await key('Enter'); await sleep(200);
  check('arrow + Enter changes the real select', await b.js(`document.querySelector('#set-quality').value === 'low'`));
  check('the face shows the new value', await b.js(`document.querySelector('#set-quality-btn .kf-select-text').textContent === document.querySelector('#set-quality').selectedOptions[0].textContent`));
  // mouse: open the scale list and click an option
  await b.js(`document.querySelector('#set-scale-btn').click(); 1`); await sleep(150);
  await b.js(`document.querySelector('.kf-select-list li:last-child').click(); 1`); await sleep(200);
  check('mouse pick changes the real select', await b.js(`document.querySelector('#set-scale').selectedIndex === document.querySelector('#set-scale').options.length - 1`));
  // restore the scale so the page is not left at a huge size
  await b.js(`document.querySelector('#set-scale-btn').click(); 1`); await sleep(100);
  await b.js(`document.querySelector('.kf-select-list li:nth-child(3)').click(); 1`); await sleep(200);
  // a check box from the keyboard
  await b.js(`document.querySelector('#set-fx').focus(); 1`);
  const before = await b.js(`document.querySelector('#set-fx').checked`);
  await key(' '); await sleep(150);
  check('Space toggles a check box', (await b.js(`document.querySelector('#set-fx').checked`)) !== before);
  check('check box is custom drawn (no native appearance)', await b.js(`getComputedStyle(document.querySelector('#set-fx')).appearance === 'none'`));
  await b.js(`document.querySelector('#set-quality-btn').click(); 1`); await sleep(100);
  await b.js(`document.querySelector('.kf-select-list li:first-child').click(); 1`); // (back to high)
  await b.js(`document.querySelector('.set-tab[data-tab="display"]').click(); 1`); await sleep(250);
  await b.shot(`${OUT}/display.png`);
  await b.js(`document.querySelector('.set-tab[data-tab="language"]').click(); 1`); await sleep(250);
  check('language list shows every language, each in its own font tag', await b.js(`(() => { document.querySelector('#set-lang-btn').click(); const n = document.querySelectorAll('.kf-select-list li[lang]').length; document.querySelector('#set-lang-btn').click(); return n === 15; })()`));
} finally { b.close(); }
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems');
process.exit(bad ? 1 : 0);
