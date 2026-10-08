const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const p = await b.newPage();
  let errs = []; p.on('pageerror', e => errs.push(e.message));
  // Poker solo
  await p.goto('http://localhost:8000/poker.html', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => document.querySelector('.mode-card[data-mode="single"]').click());
  await p.waitForFunction(() => /\$\d+/.test(document.querySelector('#potValue')?.textContent||''), { timeout: 20000 });
  await sleep(4000); // let bots act
  const pot = await p.evaluate(() => document.querySelector('#potValue').textContent);
  const strength = await p.evaluate(() => document.querySelector('#handStrength').textContent);
  console.log('poker solo: pot', pot, '| hand strength:', strength || '(none)', '| holes:', await p.evaluate(() => document.querySelectorAll('#holeCards > *').length));
  // Rummy solo
  await p.goto('http://localhost:8000/game.html?game=rummy', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => document.querySelector('#startSolo').click());
  await p.evaluate(() => document.querySelector('#confirmBots').click());
  await p.waitForFunction(() => document.querySelectorAll('#hand > *').length > 0, { timeout: 15000 });
  console.log('rummy solo: hand size', await p.evaluate(() => document.querySelectorAll('#hand > *').length));
  await p.evaluate(() => document.querySelector('#drawRummy')?.click());
  await sleep(600);
  console.log('rummy solo: can discard =', await p.evaluate(() => !!document.querySelector('#discardRummy')));
  // UNO solo
  await p.goto('http://localhost:8000/game.html?game=uno', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => document.querySelector('#startSolo').click());
  await p.evaluate(() => document.querySelector('#confirmBots').click());
  await p.waitForFunction(() => document.querySelectorAll('#hand > *').length === 7, { timeout: 15000 });
  console.log('uno solo: hand size', await p.evaluate(() => document.querySelectorAll('#hand > *').length));
  await b.close();
  console.log(errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : 'NO PAGE ERRORS — solo modes intact');
})();
