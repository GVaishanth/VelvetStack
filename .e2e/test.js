const puppeteer = require('puppeteer');
const BASE = 'http://localhost:8000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T = 60000; // generous: sandbox shares one IP, peerjs cloud throttles bursts

let failures = 0;
const ok = (cond, label) => { console.log((cond ? '  PASS ' : '  FAIL ') + label); if (!cond) failures++; };

async function newPage(browser, tag) {
  const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  [${tag} pageerror] ${e.message}`));
  return page;
}
const click = (page, sel) => page.evaluate(s => document.querySelector(s)?.click(), sel);
const setVal = (page, sel, val) => page.evaluate((s, v) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); }, sel, val);
async function waitText(page, sel, re, timeout = T) {
  try {
    await page.waitForFunction((s, r) => { const el = document.querySelector(s); return el && new RegExp(r).test(el.textContent); }, { timeout, polling: 400 }, sel, re.source);
    return true;
  } catch { return false; }
}
const text = (page, sel) => page.evaluate(s => document.querySelector(s)?.textContent || '', sel);
async function dump(page, tag, sels) {
  for (const s of sels) console.log(`    [${tag}] ${s} = "${(await text(page, s)).trim().slice(0, 80)}"`);
}

/* ---------------- POKER ---------------- */
async function testPoker(browser) {
  console.log('\n=== POKER (app.js) ===');
  const host = await newPage(browser, 'host'), g1 = await newPage(browser, 'g1'), g2 = await newPage(browser, 'g2');

  await host.goto(BASE + '/poker.html', { waitUntil: 'domcontentloaded' });
  await click(host, '.mode-card[data-mode="online"]');
  await setVal(host, '#hostName', 'HostA');
  await click(host, '#hostBtn');
  ok(await waitText(host, '#shareCode', /^[A-Z2-9]{6}$/), 'host room created, 6-char code displayed');
  const code = await text(host, '#shareCode');
  console.log('  room code:', code);

  await g1.goto(BASE + '/poker.html', { waitUntil: 'domcontentloaded' });
  await click(g1, '.mode-card[data-mode="online"]');
  await setVal(g1, '#joinName', 'GuestB');
  await setVal(g1, '#roomCode', code);
  await click(g1, '#joinBtn');
  ok(await waitText(g1, '#connectionStatus', /Connected as player/), 'guest1 connected (welcome received)');
  ok(await waitText(g1, '#potValue', /\$3/), 'guest1 sees blinds posted ($3 pot) — state sync works');
  const holes = await g1.evaluate(() => document.querySelectorAll('#holeCards > *').length);
  ok(holes >= 2, `guest1 received 2 private hole cards (got ${holes})`);
  ok(await waitText(host, '#roomPlayers', /2\/8/), 'host roster shows 2/8 players');

  await sleep(3000);
  await g2.goto(BASE + '/poker.html', { waitUntil: 'domcontentloaded' });
  await click(g2, '.mode-card[data-mode="online"]');
  await setVal(g2, '#joinName', 'GuestC');
  await setVal(g2, '#roomCode', code);
  await click(g2, '#joinBtn');
  const g2in = await waitText(g2, '#connectionStatus', /Connected as player/);
  ok(g2in, 'guest2 connected mid-hand');
  if (!g2in) { await dump(g2, 'g2', ['#connectionStatus', '#toast']); }
  ok(await waitText(host, '#roomPlayers', /3\/8/), 'host roster shows 3/8 players');
  if (g2in) {
    const seated = await g2.evaluate(() => document.querySelectorAll('#playersLayer .player-seat').length);
    console.log(`  guest2 sees ${seated} seats (joined mid-hand, sits out until next deal)`);
  }

  // Play the hand to completion: whoever has the turn clicks check/call
  const pages = [[host,'host'], [g1,'g1'], [g2,'g2']];
  let acted = 0, idle = 0;
  for (let i = 0; i < 40 && idle < 12; i++) {
    if (/SHOWDOWN/.test(await text(host, '#streetLabel'))) break;
    let moved = false;
    for (const [p] of pages) {
      const my = await p.evaluate(() => {
        const t = document.querySelector('#turnLabel')?.textContent || '';
        const a = document.querySelector('#actions');
        return t === 'YOUR HAND' && a && !a.classList.contains('hidden');
      }).catch(() => false);
      if (my) {
        await p.evaluate(() => {
          const check = document.querySelector('#actions [data-action="check"]');
          const call = document.querySelector('#actions [data-action="call"]');
          (check && !check.classList.contains('hidden') ? check : call).click();
        });
        acted++; moved = true; idle = 0;
        await sleep(1200);
        break;
      }
    }
    if (!moved) { idle++; await sleep(1200); }
  }
  const done = await waitText(host, '#streetLabel', /SHOWDOWN/, 10000);
  ok(done, `hand played to completion across the network (${acted} actions)`);
  if (!done) { await dump(host, 'host', ['#streetLabel', '#turnLabel', '#actionHint', '#potValue']); await dump(g1, 'g1', ['#streetLabel', '#turnLabel']); }
  ok(await waitText(g1, '#streetLabel', /SHOWDOWN/, 15000), 'guest1 sees the hand result');

  await click(host, '#newHandBtn');
  ok(await waitText(host, '#handNumber', /#00[23]/), 'host dealt the next hand');
  if (g2in) {
    ok(await waitText(g2, '#handNumber', /#00[23]/, 30000), 'guest2 synced into the next hand');
    const g2holes = await g2.evaluate(() => document.querySelectorAll('#holeCards > *').length);
    ok(g2holes >= 2, `guest2 now has hole cards (got ${g2holes})`);
  }

  // Disconnect: close guest1 -> host must fold the seat / keep playing
  const before = await text(host, '#roomPlayers');
  await g1.browserContext().close();
  const dropped = await host.waitForFunction(b => document.querySelector('#roomPlayers')?.textContent !== b, { timeout: 60000, polling: 500 }, before).then(() => true).catch(() => false);
  ok(dropped, `host detected guest1 disconnect (${before} -> ${await text(host, '#roomPlayers')})`);
  await host.browserContext().close(); await g2.browserContext().close();
}

/* ---------------- RUMMY + UNO (game.js) ---------------- */
async function testGameJs(browser, kind, drawId, label) {
  console.log(`\n=== ${label} (game.html?game=${kind}) ===`);
  const url = `${BASE}/game.html?game=${kind}`;
  const host = await newPage(browser, 'host'), g1 = await newPage(browser, 'g1'), g2 = await newPage(browser, 'g2');

  await host.goto(url, { waitUntil: 'domcontentloaded' });
  await click(host, '.mode[data-mode="online"]');
  await setVal(host, '#playerName', 'HostA');
  await click(host, '#hostRoom');
  ok(await waitText(host, '#roomLabel', /^ROOM [A-Z2-9]{6}$/), 'host room created');
  const code = (await text(host, '#roomLabel')).replace('ROOM ', '').trim();
  console.log('  room code:', code);

  for (const [pg, name, tag] of [[g1, 'GuestB', 'g1'], [g2, 'GuestC', 'g2']]) {
    await sleep(3000);
    await pg.goto(url, { waitUntil: 'domcontentloaded' });
    await click(pg, '.mode[data-mode="online"]');
    await setVal(pg, '#playerName', name);
    await setVal(pg, '#roomCode', code);
    await click(pg, '#joinRoom');
    const joined = await waitText(pg, '#roomLabel', /^ROOM /);
    ok(joined, `${name} connected`);
    if (!joined) await dump(pg, tag, ['#roomLabel', '#toast', '#status']);
    const gotHand = await pg.waitForFunction(() => document.querySelectorAll('#hand > *').length > 0, { timeout: T, polling: 400 }).then(() => true).catch(() => false);
    ok(gotHand, `${name} received their own private hand`);
  }
  ok(await waitText(host, '#board', /GuestB/), 'host board shows GuestB name');
  ok(await waitText(host, '#board', /GuestC/), 'host board shows GuestC name');
  const counts = await g1.evaluate(() => [...document.querySelectorAll('#board .board-stat b')].map(b => b.textContent).slice(0, 4));
  console.log('  guest1 sees per-seat card counts:', counts.join(','), '(hidden hands keep their count)');

  // Each page acts when its draw control appears; proves actions flow guest->host->all
  const doTurn = async (pg, who) => {
    const got = await pg.waitForFunction(id => document.querySelector(id), { timeout: T, polling: 300 }, drawId).then(() => true).catch(() => false);
    ok(got, `${who} got their turn`);
    if (!got) { await dump(pg, who, ['#status']); return false; }
    await pg.evaluate(id => document.querySelector(id).click(), drawId);
    if (kind === 'rummy') {
      await pg.waitForFunction(() => document.querySelector('#discardRummy'), { timeout: 20000, polling: 300 });
      await pg.evaluate(() => document.querySelector('#hand > *').click());
      await pg.waitForFunction(() => { const b = document.querySelector('#discardRummy'); return b && !b.disabled; }, { timeout: 10000, polling: 300 });
      await pg.evaluate(() => document.querySelector('#discardRummy').click());
    }
    return true;
  };
  await doTurn(host, 'host');
  await doTurn(g1, 'guest1');
  await doTurn(g2, 'guest2');
  // Seat 3 is an unclaimed bot seat -> host engine plays it, then play continues.
  // (UNO bots may legally skip/reverse, so just require that SOMEONE gets a turn.)
  const cont = await Promise.race([
    host.waitForFunction(id => document.querySelector(id), { timeout: T, polling: 300 }, drawId).then(() => 'host'),
    g1.waitForFunction(id => document.querySelector(id), { timeout: T, polling: 300 }, drawId).then(() => 'guest1'),
    g2.waitForFunction(id => document.querySelector(id), { timeout: T, polling: 300 }, drawId).then(() => 'guest2'),
  ]).catch(() => null);
  ok(!!cont, `play continued after the bot seat acted (next turn: ${cont})`);

  // Disconnect: guest1 leaves -> bot takes the seat; table must keep moving
  await g1.browserContext().close();
  ok(await waitText(host, '#board', /left — a bot plays the seat/, 90000), 'host announced bot takeover of the abandoned seat');
  await host.browserContext().close(); await g2.browserContext().close();
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    await testPoker(browser);
    await testGameJs(browser, 'rummy', '#drawRummy', 'MELD HOUSE / RUMMY');
    await testGameJs(browser, 'uno', '#drawUno', 'COLOR CLASH / UNO');
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
