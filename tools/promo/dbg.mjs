import { launch, sleep } from './lib.mjs';
const b = await launch();
await b.js("document.querySelector('#name').value='Eren'; document.querySelector('#quick').click(); 1");
await b.waitFor("document.documentElement.classList.contains('in-game')", 90);
await sleep(6000);
console.log(await b.js(`JSON.stringify([...document.body.children].map(e => e.tagName + '#' + e.id + '.' + e.className + ' ' + e.children.length)) + JSON.stringify([...document.querySelector('#app').children].map(e => e.tagName + '#' + e.id + '.' + e.className))`));
b.close();
