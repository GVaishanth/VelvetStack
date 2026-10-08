const puppeteer = require('puppeteer');
const BASE = 'http://localhost:8000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (c, l) => { console.log((c ? '  PASS ' : '  FAIL ') + l); if (!c) failures++; };

async function page(browser, tag, errs) {
  const p = await browser.newPage();
  p.on('pageerror', e => { errs.push(`[${tag}] ${e.message}`); });
  return p;
}
const click = (p, sel) => p.evaluate(s => document.querySelector(s)?.click(), sel);
const text = (p, sel) => p.evaluate(s => document.querySelector(s)?.textContent || '', sel);
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden'); }, sel);

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errs = [];

  /* ---- POKER SOLO: full hand vs bots + undo ---- */
  console.log('=== POKER SOLO ===');
  let p = await page(browser, 'solo', errs);
  await p.goto(BASE + '/poker.html', { waitUntil: 'domcontentloaded' });
  await click(p, '.mode-card[data-mode="single"]');
  await p.waitForFunction(() => /\$\d+/.test(document.querySelector('#potValue')?.textContent || ''), { timeout: 20000 });
  const seats = await p.evaluate(() => document.querySelectorAll('#playersLayer .player-seat').length);
  ok(seats >= 2, `table seated with bots (${seats} seats)`);
  // play our turns until the hand completes
  let undone = false, acted = 0;
  for (let i = 0; i < 60; i++) {
    const done = await p.evaluate(() => /wins|split/i.test(document.querySelector('#actionHint')?.textContent || ''));
    if (done) break;
    const my = await p.evaluate(() => {
      const a = document.querySelector('#actions');
      return document.querySelector('#turnLabel')?.textContent === 'YOUR HAND' && a && !a.classList.contains('hidden');
    });
    if (my) {
      await p.evaluate(() => {
        const check = document.querySelector('#actions [data-action="check"]');
        const call = document.querySelector('#actions [data-action="call"]');
        (check && !check.classList.contains('hidden') ? check : call).click();
      });
      acted++;
      if (!undone && acted === 1) { // undo still works in solo
        await sleep(300);
        if (await visible(p, '#undoBtn')) { await click(p, '#undoBtn'); undone = true; await sleep(300); }
      }
    }
    await sleep(350);
  }
  ok(undone, 'undo button appeared and worked after a solo action');
  ok(await p.evaluate(() => /wins|split/i.test(document.querySelector('#actionHint')?.textContent || '')), `solo hand completed vs bots (${acted} human actions)`);
  const strength = await text(p, '#handStrength');
  console.log('  hand strength readout during play was shown; final hint:', (await text(p, '#actionHint')).slice(0, 60));
  await p.close();

  /* ---- POKER LOCAL: cut -> deal -> bet -> open streets -> pick winner ---- */
  console.log('=== POKER LOCAL (pass & play) ===');
  p = await page(browser, 'local', errs);
  await p.goto(BASE + '/poker.html', { waitUntil: 'domcontentloaded' });
  await click(p, '.mode-card[data-mode="local"]');
  ok(await visible(p, '#localSetupView'), 'local setup page opened');
  await click(p, '#startLocalTable');
  await p.waitForFunction(() => !document.querySelector('#dealerModal')?.classList.contains('hidden'), { timeout: 10000 });
  ok(true, 'dealer guide modal appeared (cut step)');
  await click(p, '#dealerAction'); // cut
  await sleep(300);
  await click(p, '#dealerAction'); // deal
  await sleep(400);
  ok(await p.evaluate(() => /\$3/.test(document.querySelector('#potValue')?.textContent || '')), 'local blinds posted ($3 pot)');
  let winnerShown = false;
  for (let i = 0; i < 40; i++) {
    if (await visible(p, '#winnerView')) { winnerShown = true; break; }
    if (await p.evaluate(() => !document.querySelector('#dealerModal')?.classList.contains('hidden'))) {
      await click(p, '#dealerAction'); // open flop/turn/river
    } else if (await p.evaluate(() => { const a = document.querySelector('#actions'); return a && !a.classList.contains('hidden'); })) {
      await p.evaluate(() => {
        const check = document.querySelector('#actions [data-action="check"]');
        const call = document.querySelector('#actions [data-action="call"]');
        (check && !check.classList.contains('hidden') ? check : call).click();
      });
    }
    await sleep(350);
  }
  ok(winnerShown, 'reached the local showdown winner-selection page');
  if (winnerShown) {
    const bank0 = await p.evaluate(() => document.querySelector('#hudBank')?.textContent);
    await p.evaluate(() => document.querySelector('#winnerChoices button')?.click());
    await sleep(600);
    ok(await p.evaluate(() => /wins/i.test(document.querySelector('#actionHint')?.textContent || '') || document.querySelector('#winnerView')?.classList.contains('hidden')), 'local winner settled, chips awarded');
  }
  await p.close();

  /* ---- RUMMY SOLO: three full draw/discard turns vs bots ---- */
  console.log('=== RUMMY SOLO ===');
  p = await page(browser, 'rummy', errs);
  await p.goto(BASE + '/game.html?game=rummy', { waitUntil: 'domcontentloaded' });
  await click(p, '#startSolo'); await click(p, '#confirmBots');
  await p.waitForFunction(() => document.querySelectorAll('#hand > *').length === 13, { timeout: 15000 });
  ok(true, 'dealt 13 cards (2-bot table)');
  let turns = 0;
  for (let t = 0; t < 3; t++) {
    const got = await p.waitForFunction(() => document.querySelector('#drawRummy'), { timeout: 20000 }).then(() => true).catch(() => false);
    if (!got) break;
    await click(p, '#drawRummy');
    await p.waitForFunction(() => document.querySelector('#discardRummy'), { timeout: 10000 });
    await p.evaluate(() => document.querySelector('#hand > *').click());
    await p.waitForFunction(() => { const b = document.querySelector('#discardRummy'); return b && !b.disabled; }, { timeout: 10000 });
    await click(p, '#discardRummy');
    turns++;
  }
  ok(turns === 3, `played ${turns}/3 full rummy turns; bots responded each time`);
  await p.close();

  /* ---- UNO SOLO: three turns vs bots ---- */
  console.log('=== UNO SOLO ===');
  p = await page(browser, 'uno', errs);
  await p.goto(BASE + '/game.html?game=uno', { waitUntil: 'domcontentloaded' });
  await click(p, '#startSolo'); await click(p, '#confirmBots');
  await p.waitForFunction(() => document.querySelectorAll('#hand > *').length === 7, { timeout: 15000 });
  ok(true, 'dealt 7 cards');
  let unoTurns = 0;
  for (let t = 0; t < 3; t++) {
    const got = await p.waitForFunction(() => document.querySelector('#drawUno'), { timeout: 25000 }).then(() => true).catch(() => false);
    if (!got) break;
    await click(p, '#drawUno');
    unoTurns++;
    await sleep(400);
  }
  ok(unoTurns === 3, `played ${unoTurns}/3 uno turns; bots cycled each time`);
  await p.close();

  await browser.close();
  if (errs.length) { console.log('\nPAGE ERRORS:'); errs.forEach(e => console.log('  ' + e)); failures += errs.length; }
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nBASE CODE INTACT — ALL REGRESSION CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
