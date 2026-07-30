/* Velvet Stack — static Texas Hold'em table. No build step required. */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
let mode = 'single', game = null, myId = 0, peer = null, conn = null, connections = [], isHost = false,
  autoHandTimer = null, progressTimer = null, countdownTimer = null, countdownRemaining = 0;

function toast(t) {
  let x = $('#toast');
  x.textContent = t;
  x.classList.add('show');
  clearTimeout(window.tt);
  window.tt = setTimeout(() => x.classList.remove('show'), 2600)
}

function show(v) {
  [$('#lobbyView'), $('#onlineView'), $('#localSetupView'), $('#gameView'), $('#playersView'), $('#winnerView')].forEach(x => x.classList.add('hidden'));
  v.classList.remove('hidden')
}

function card(c, back = false) {
  let d = document.createElement('div');
  d.className = 'playing-card ' + (back ? 'card-back' : (c.suit === '♥' || c.suit === '♦' ? 'red' : ''));
  if (!back) d.innerHTML = `<span class="rank">${c.rank}</span><span class="suit">${c.suit}</span>`;
  return d
}

function deck() {
  let d = [];
  SUITS.forEach(s => RANKS.forEach(r => d.push({ suit: s, rank: r, value: RANKS.indexOf(r) + 2 })));
  for (let i = d.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

function players(n = 4, names) {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    name: names?.[i] || ['You', 'Maya', 'Theo', 'Ari', 'Sam', 'Lina', 'Ravi', 'Nora'][i],
    chips: 100,
    hand: [],
    folded: false,
    bet: 0,
    totalBet: 0,
    acted: false,
    bot: i > 0
  }))
}

function showDealerStep(step) {
  if (mode !== 'local') return;
  let title = $('#dealerTitle'), text = $('#dealerText'), button = $('#dealerAction');
  let steps = {
    cut: ['Cut the deck', 'Use your physical deck to make a cut, then continue.', 'Cut deck', () => cutDeck()],
    deal: ['Deal the hand', 'Deal private cards to every player, then start betting.', 'Deal hand', () => deal()],
    flop: ['Open 3 cards', 'Betting is complete. Open the flop on your physical table.', 'Open flop', () => street(true)],
    turn: ['Open the 4th card', 'Open the turn card on your physical table.', 'Open turn', () => street(true)],
    river: ['Open the last card', 'Open the river card on your physical table.', 'Open river', () => street(true)]
  }[step];
  if (!steps) return;
  title.textContent = steps[0];
  text.textContent = steps[1];
  button.textContent = steps[2];
  button.onclick = steps[3];
  $('#dealerModal').classList.remove('hidden')
}

function hideDealerStep() {
  $('#dealerModal').classList.add('hidden')
}

function start(kind = 'single', names, setup) {
  mode = kind;
  myId = 0;
  game = {
    deck: deck(),
    community: [],
    pot: 0,
    minRaise: 2,
    street: 'preflop',
    dealer: 0,
    turn: 0,
    players: players(kind === 'local' ? Math.max(2, Math.min(8, names?.length || 4)) : kind === 'online' ? Math.max(2, Math.min(8, names?.length || 2)) : 1 + Math.max(1, Math.min(7, Number(localStorage.getItem('velvet-stack-bot-count')) || 7)), names),
    handNo: 1,
    winner: null,
    started: false,
    cut: false,
    botLevel: $('#botLevel')?.value || 'sharp',
    history: [],
    setup: setup || null
  };
  if (setup) game.players.forEach((p, i) => { p.chips = setup[i]?.stack || 100 });
  if (kind !== 'local') game.players.forEach(p => p.hand = [game.deck.pop(), game.deck.pop()]);
  show($('#gameView'));
  $('#modeTitle').textContent = kind === 'local' ? 'LOCAL MULTIPLAYER' : kind === 'online' ? 'ONLINE TABLE' : 'SOLO TABLE';
  $('#tableName').textContent = kind === 'local' ? 'Pass & Play' : 'The Green Felt';
  $('#roomShare').classList.toggle('hidden', kind !== 'online');
  $('#localControls').classList.toggle('hidden', kind !== 'local');
  $('#setWinnerBtn').classList.add('hidden');
  $('#openBoardBtn').classList.add('hidden');
  $('#dealHandBtn').textContent = 'Deal hand';
  $('#deckStatus').textContent = kind === 'local' ? 'Deck ready — cut before dealing' : 'Deck ready';
  render();
  if (kind === 'local') showDealerStep('cut');
  else if (kind === 'online') {
    $('#deckStatus').textContent = 'Waiting for a guest to join';
    $('#actionHint').textContent = 'Share the room code — the hand starts when a guest arrives.';
  } else setTimeout(deal, 300)
}

function nextPlayer(from) {
  let i = from;
  for (let n = 0; n < game.players.length; n++) {
    i = (i + 1) % game.players.length;
    if (!game.players[i].folded && game.players[i].chips > 0) return i
  }
  return from
}

function putBlind(index, amount) {
  let p = game.players[index], paid = Math.min(p.chips, amount);
  p.chips -= paid;
  p.bet = paid;
  p.totalBet = (p.totalBet || 0) + paid;
  p.acted = p.chips === 0;
  game.pot += paid
}

function deal() {
  if (!game || game.started) return toast('A hand is already in progress');
  if (mode === 'local' && !game.cut) return toast('Cut the deck before dealing');
  hideDealerStep();
  game.players.forEach(p => { p.bet = 0; p.acted = false; p.folded = false });
  game.started = true;
  game.pot = 0;
  game.minRaise = 2;
  let small = game.nextSmall ?? (game.players.length === 2 ? game.dealer : nextPlayer(game.dealer)),
    big = nextPlayer(small);
  if (game.setup) {
    let configuredSmall = game.setup.findIndex(x => x.blind === 'small'),
      configuredBig = game.setup.findIndex(x => x.blind === 'big');
    if (configuredSmall >= 0) small = configuredSmall;
    if (configuredBig >= 0) big = configuredBig
  }
  game.smallBlind = small;
  game.bigBlind = big;
  game.nextSmall = nextPlayer(small);
  game.setup = null;
  putBlind(small, 1);
  putBlind(big, 2);
  game.turn = game.players.length === 2 ? small : nextPlayer(big);
  $('#deckStatus').textContent = 'Hand dealt — betting open';
  $('#dealHandBtn').textContent = 'Hand dealt';
  render();
  sync();
  autoProgress()
}

function cutDeck() {
  if (!game || mode !== 'local' || game.started) return toast('Cut only before the hand is dealt');
  let point = 2 + Math.floor(Math.random() * (game.deck.length - 4));
  game.deck = game.deck.slice(point).concat(game.deck.slice(0, point));
  game.cut = true;
  $('#deckStatus').textContent = `Deck cut at ${point} cards`;
  $('#dealHandBtn').textContent = 'Deal hand';
  toast('Deck cut — ready to deal');
  showDealerStep('deal')
}

function autoProgress() {
  if (!game || game.winner !== null || !game.started || mode !== 'single') return;
  clearTimeout(progressTimer);
  progressTimer = setTimeout(() => {
    if (!game || game.winner !== null) return;
    let active = game.players.filter(p => !p.folded && p.chips > 0),
      current = game.players[game.turn];
    if (active.length === 0 || !current || current.folded || current.chips <= 0) {
      if (game.street === 'river') finish();
      else street();
    } else if (current.bot) queueBot()
  }, 40)
}

function advance() {
  let alive = game.players.filter(p => !p.folded),
    active = alive.filter(p => p.chips > 0);
  if (active.length === 0) return autoProgress();
  let idx = game.turn;
  for (let z = 0; z < game.players.length; z++) {
    idx = (idx + 1) % game.players.length;
    if (!game.players[idx].folded && game.players[idx].chips > 0) {
      game.turn = idx;
      break
    }
  }
  let max = Math.max(...alive.map(p => p.bet));
  if (active.every(p => p.acted) && active.every(p => p.bet === max || p.chips === 0)) street()
}

function street(force = false) {
  if (force) saveHistory();
  if (mode === 'local' && !force) {
    if (game.street === 'river') return finish();
    game.pendingReveal = true;
    $('#openBoardBtn').classList.remove('hidden');
    let next = game.street === 'preflop' ? 'flop' : game.street === 'flop' ? 'turn' : 'river';
    $('#deckStatus').textContent = `Betting complete — open the ${next}`;
    render();
    showDealerStep(next);
    return
  }
  if (mode === 'local' && game.street === 'river') {
    hideDealerStep();
    return finish()
  }
  hideDealerStep();
  game.pendingReveal = false;
  $('#openBoardBtn').classList.add('hidden');
  game.players.forEach(p => { p.bet = 0; p.acted = false });
  game.minRaise = 2;
  if (game.street === 'preflop') {
    game.community.push(...(mode === 'local' ? [{ hidden: true }, { hidden: true }, { hidden: true }] : [game.deck.pop(), game.deck.pop(), game.deck.pop()]));
    game.street = 'flop'
  } else if (game.street === 'flop') {
    game.community.push(mode === 'local' ? { hidden: true } : game.deck.pop());
    game.street = 'turn'
  } else if (game.street === 'turn') {
    game.community.push(mode === 'local' ? { hidden: true } : game.deck.pop());
    game.street = 'river'
  } else {
    return finish()
  }
  game.turn = nextPlayer(game.dealer);
  render();
  autoProgress()
}

function saveHistory() {
  if (!game) return;
  let copy = JSON.parse(JSON.stringify(game));
  copy.history = [];
  game.history = game.history || [];
  game.history.push(copy);
  if (game.history.length > 30) game.history.shift()
}

function undoLast() {
  if (!game || !['single', 'local'].includes(mode) || !game.history?.length) return toast('Nothing to undo');
  clearTimeout(window.botTimer);
  clearTimeout(progressTimer);
  clearTimeout(autoHandTimer);
  cancelCountdown(true);
  let previous = game.history.pop();
  previous.history = game.history;
  let remaining = previous.deck || [];
  if (mode === 'single') {
    for (let i = remaining.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]]
    }
    previous.deck = remaining
  }
  game = previous;
  $('#dealerModal').classList.add('hidden');
  $('#countdownModal').classList.add('hidden');
  toast(mode === 'local' ? 'Undone — physical deck order unchanged' : 'Undone — remaining solo deck reshuffled');
  render();
  if (mode === 'single') autoProgress();
  else if (mode === 'local' && game.pendingReveal) {
    let next = game.street === 'preflop' ? 'flop' : game.street === 'flop' ? 'turn' : 'river';
    showDealerStep(next)
  }
}

function act(a, amount) {
  if (!['fold', 'check', 'call', 'raise'].includes(a)) return;
  if (!game || !game.started || game.winner !== null || game.needsTableReset) return;
  if (a === 'raise' && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) return toast('Invalid raise amount');
  let p = game.players[game.turn],
    maxBet = Math.max(...game.players.filter(x => !x.folded).map(x => x.bet));
  if (a === 'check' && p.bet < maxBet) {
    toast(`Call $${maxBet-p.bet} before checking`);
    return
  }
  if (mode === 'online' && !isHost) {
    if (p.id === myId && conn?.open) conn.send({ type: 'action', action: a, amount, playerId: myId });
    return
  }
  if (mode === 'single' && p.id !== 0 && !p.bot) return;
  if (p.chips <= 0) {
    if (p.bot) {
      p.acted = true;
      advance();
      render();
      queueBot()
    } else toast('This player is all-in');
    return;
  }
  if (mode !== 'single' || !p.bot) saveHistory();
  if (a === 'fold') p.folded = true;
  else if (a === 'check') p.acted = true;
  else if (a === 'call') {
    let m = Math.max(...game.players.filter(x => !x.folded).map(x => x.bet)),
      owed = m - p.bet,
      paid = Math.min(p.chips, owed);
    p.chips -= paid;
    p.bet += paid;
    p.totalBet = (p.totalBet || 0) + paid;
    game.pot += paid;
    p.acted = true
  } else if (a === 'raise') {
    // Minimum legal raise = size of the previous bet/raise (or the big blind if nobody
    // has raised yet this street). A short all-in raise is still allowed, but it does
    // not reset the minimum for players acting after it.
    let m = Math.max(...game.players.filter(x => !x.folded).map(x => x.bet)),
      minIncrement = game.minRaise || 2,
      minTarget = m + minIncrement,
      maxTarget = p.bet + p.chips,
      target = amount === undefined ? minTarget : Math.floor(Number(amount));
    target = Math.min(target, maxTarget);
    if (target <= m) return toast('Raise is not available');
    // A raise below the minimum is legal only when it is the player's full all-in stack.
    if (target < minTarget && target !== maxTarget) return toast(`Raise to at least $${minTarget}`);
    let paid = target - p.bet;
    let reachedFullRaise = target >= minTarget;
    p.chips -= paid;
    p.bet = target;
    p.totalBet = (p.totalBet || 0) + paid;
    game.pot += paid;
    p.acted = true;
    if (reachedFullRaise) game.minRaise = (p.bet - m) || minIncrement
  }
  if (game.players.filter(x => !x.folded).length === 1) return finish();
  advance();
  render();
  autoProgress();
  sync()
}

function queueBot() {
  clearTimeout(window.botTimer);
  if (mode === 'single' && game && game.winner === null && game.players[game.turn]?.bot) window.botTimer = setTimeout(bot, 140)
}

function botEquity(p) {
  let h = p.hand || [], board = game.community || [];
  if (!h.length) return .5;
  if (!board.length) {
    let vals = h.map(c => c.value).sort((a, b) => b - a),
      pair = vals[0] === vals[1], high = vals[0] >= 12,
      connected = vals[0] - vals[1] <= 2, suited = h[0].suit === h[1].suit;
    return Math.min(.92, .14 + (pair ? .38 : 0) + (high ? .16 : 0) + (connected ? .08 : 0) + (suited ? .07 : 0) + (vals[0] === 14 ? .07 : 0))
  }
  // A small Monte Carlo estimate makes post-flop bots react to draws, kickers,
  // and the number of opponents instead of merely the current hand category.
  let used = new Set([...h, ...board].map(c => c.rank + c.suit));
  let pool = SUITS.flatMap(suit => RANKS.map((rank, i) => ({ suit, rank, value: i + 2 }))).filter(c => !used.has(c.rank + c.suit));
  let opponents = game.players.filter(x => x.id !== p.id && !x.folded && x.chips > 0).length;
  let trials = game.botLevel === 'pro' ? 100 : 55, score = 0;
  for (let t = 0; t < trials; t++) {
    let sample = [...pool];
    for (let i = sample.length - 1; i > 0; i--) { let j = Math.floor(Math.random() * (i + 1)); [sample[i], sample[j]] = [sample[j], sample[i]] }
    let cursor = 0, runout = [...board];
    while (runout.length < 5) runout.push(sample[cursor++]);
    let mine = evaluate([...h, ...runout]), best = mine, ties = 1;
    for (let o = 0; o < opponents; o++) {
      let theirs = evaluate([sample[cursor++], sample[cursor++], ...runout]);
      let cmp = compareScore(theirs, best);
      if (cmp > 0) { best = theirs; ties = 1 } else if (cmp === 0) ties++;
    }
    let cmp = compareScore(mine, best);
    if (cmp === 0) score += 1 / ties;
  }
  return score / trials
}
function bot() {
  if (!game || game.winner !== null || !game.started) return;
  let p = game.players[game.turn];
  if (!p?.bot) return;
  if (p.folded || p.chips <= 0) {
    p.acted = true;
    advance();
    render();
    queueBot();
    return
  }
  let alive = game.players.filter(x => !x.folded),
    max = Math.max(...alive.map(x => x.bet)),
    owed = Math.max(0, max - p.bet),
    level = game.botLevel || 'sharp',
    equity = botEquity(p),
    r = Math.random();
  let potOdds = owed / Math.max(1, game.pot + owed),
    pressure = Math.min(.16, alive.length * .025),
    skill = level === 'pro' ? 1 : level === 'sharp' ? .72 : .35,
    foldChance = Math.max(0, (potOdds + pressure - equity) * (1.25 - skill * .45) + (level === 'casual' ? .07 : .015)),
    raiseChance = Math.max(.025, (equity - .43) * (.22 + skill * .28) + (owed === 0 ? .05 : 0));
  // Better bots bluff sparingly, value-bet strong hands, and protect against cheap draws.
  if (owed > 0 && r < foldChance && game.street !== 'river') return act('fold');
  if (r < raiseChance) {
    let sizing = level === 'pro' ? Math.max(game.minRaise || 2, Math.ceil(game.pot * .55)) : Math.max(game.minRaise || 2, 5);
    return act('raise', max + sizing);
  }
  if (owed > 0) return act('call');
  return act('check')
}

function cancelCountdown(silent = false) {
  clearInterval(countdownTimer);
  countdownTimer = null;
  $('#countdownModal').classList.add('hidden');
  if (!silent) toast('Auto-start cancelled')
}

function startCountdown(seconds, callback, title) {
  cancelCountdown(true);
  countdownRemaining = seconds;
  $('#countdownTitle').textContent = title;
  $('#countdownText').textContent = 'The next hand will start automatically.';
  let tick = () => {
    if (countdownRemaining <= 0) {
      cancelCountdown(true);
      callback();
      return
    }
    let n = $('#countdownNumber');
    n.textContent = countdownRemaining;
    n.style.opacity = String(1 - (countdownRemaining - 1) / seconds);
    n.style.transform = 'scale(1)';
    requestAnimationFrame(() => n.style.transform = 'scale(1.08)');
    countdownRemaining--
  };
  $('#countdownModal').classList.remove('hidden');
  tick();
  countdownTimer = setInterval(tick, 1000)
}

function scheduleAutoHand() {
  if (mode !== 'single' || !game || game.players[0]?.chips <= 0) return;
  clearTimeout(autoHandTimer);
  autoHandTimer = setTimeout(() => {
    if (game && game.winner !== null) startCountdown(3, () => {
      if (game && game.winner !== null) newHand()
    }, 'Next solo hand begins in')
  }, 5000)
}

function scheduleLocalHand() {
  if (mode !== 'local' || !game) return;
  clearTimeout(autoHandTimer);
  autoHandTimer = setTimeout(() => {
    if (game && game.winner !== null) startCountdown(5, () => {
      if (game && game.winner !== null) newHand()
    }, 'Next local hand begins in')
  }, 5000)
}

// Splits the hand's total contributions into main pot + side pots so that a
// short all-in stack can only win the chips it (and anyone matching it) put in.
// Folded players' chips still count toward the pots they contributed to, but
// folded players are never eligible to win a pot.
function computeSidePots(playerList) {
  let contributors = playerList.filter(p => (p.totalBet || 0) > 0);
  if (!contributors.length) return [];
  let levels = [...new Set(contributors.map(p => p.totalBet))].sort((a, b) => a - b);
  let pots = [], prev = 0;
  levels.forEach(level => {
    let layerPerPlayer = level - prev,
      payers = contributors.filter(p => p.totalBet >= level),
      amount = layerPerPlayer * payers.length;
    if (amount > 0) {
      pots.push({ amount, eligible: payers.filter(p => !p.folded).map(p => p.id) })
    }
    prev = level
  });
  return pots
}

function tableNeedsReset() {
  return game && game.players.filter(p => p.chips <= 0).length >= Math.ceil(game.players.length / 2);
}

function promptTableReset() {
  if (!game?.needsTableReset) return;
  $('#tableResetText').textContent = `${game.players.filter(p => p.chips <= 0).length} of ${game.players.length} stacks are empty. Reset every player to $100 before the next hand.`;
  $('#tableResetModal').classList.remove('hidden');
}

function finish() {
  if (mode === 'local') {
    let alive = game.players.filter(p => !p.folded);
    if (alive.length === 1) return settleWinner(alive[0].id);
    game.pendingPots = computeSidePots(game.players);
    if (!game.pendingPots.length) game.pendingPots = [{ amount: game.pot, eligible: alive.map(p => p.id) }];
    game.potIndex = 0;
    game.awaitingWinner = true;
    game.street = 'showdown';
    $('#setWinnerBtn').classList.remove('hidden');
    $('#deckStatus').textContent = game.pendingPots.length > 1 ? `Showdown — choose the winner (pot 1 of ${game.pendingPots.length})` : 'Showdown — choose the winner';
    render();
    showWinnerPage();
    return
  }
  let pots = computeSidePots(game.players);
  if (!pots.length) pots = [{ amount: game.pot, eligible: game.players.filter(p => !p.folded).map(p => p.id) }];
  let winnerIds = new Set(), summary = [];
  pots.forEach(pot => {
    let eligiblePlayers = pot.eligible.map(id => game.players.find(p => p.id === id)).filter(Boolean);
    if (!eligiblePlayers.length) return;
    let scored = eligiblePlayers.map(p => ({ p, score: evaluate([...p.hand, ...game.community]) })).sort((a, b) => compareScore(b.score, a.score));
    let best = scored[0],
      winners = scored.filter(x => compareScore(x.score, best.score) === 0),
      share = Math.floor(pot.amount / winners.length),
      remainder = pot.amount % winners.length;
    winners.forEach((entry, i) => {
      entry.p.chips += share + (i === 0 ? remainder : 0);
      winnerIds.add(entry.p.id)
    });
    summary.push({ amount: pot.amount, names: winners.map(w => w.p.name), score: best.score })
  });
  let winnerList = [...winnerIds].map(id => game.players.find(p => p.id === id));
  game.winner = winnerList[0]?.id ?? null;
  game.allWinnerIds = [...winnerIds];
  game.tiedWinners = winnerList.length > 1 ? [...new Set(winnerList.map(w => w.name))] : null;
  game.winningScore = pots.length > 1 ? { name: 'MULTIPLE POTS' } : (winnerList.length > 1 ? { name: 'SPLIT POT' } : summary[0]?.score);
  game.street = 'showdown';
  let message = summary.map(s => `${s.names.join(' & ')} ${s.names.length > 1 ? 'split' : 'wins'} $${s.amount} with ${s.score.name}`).join(' · ');
  toast(message || 'Hand complete');
  render();
  sync();
  game.needsTableReset = tableNeedsReset();
  if (game.needsTableReset) {
    toast('Half the table is out — start a fresh game to continue');
    setTimeout(promptTableReset, 350);
  } else scheduleAutoHand()
}

function evaluate(cards) {
  let counts = {};
  cards.forEach(c => { counts[c.value] = (counts[c.value] || 0) + 1 });
  let groups = Object.entries(counts).map(([v, n]) => ({ v: +v, n })).sort((a, b) => b.n - a.n || b.v - a.v);
  let suits = {};
  cards.forEach(c => (suits[c.suit] ??= []).push(c.value));
  let flush = Object.values(suits).find(a => a.length >= 5);
  let uniq = [...new Set(cards.map(c => c.value))].sort((a, b) => b - a);
  if (uniq.includes(14)) uniq.push(1);
  let straight = 0;
  for (let i = 0; i <= uniq.length - 5; i++) {
    let run = uniq.slice(i, i + 5);
    if (run[0] - run[4] === 4) {
      straight = run[0];
      break
    }
  }
  if (flush) {
    let fu = [...new Set(flush)].sort((a, b) => b - a);
    if (fu.includes(14)) fu.push(1);
    for (let i = 0; i <= fu.length - 5; i++)
      if (fu[i] - fu[i + 4] === 4) return { name: fu[i] === 14 ? 'ROYAL FLUSH' : 'STRAIGHT FLUSH', rank: 8, tie: [fu[i]] }
  }
  if (groups[0].n === 4) return { name: 'FOUR OF A KIND', rank: 7, tie: [groups[0].v, groups[1].v] };
  if (groups[0].n === 3 && groups.some((g, i) => i > 0 && g.n >= 2)) return { name: 'FULL HOUSE', rank: 6, tie: [groups[0].v, groups.find((g, i) => i > 0 && g.n >= 2).v] };
  if (flush) return { name: 'FLUSH', rank: 5, tie: [...flush].sort((a, b) => b - a).slice(0, 5) };
  if (straight) return { name: 'STRAIGHT', rank: 4, tie: [straight] };
  if (groups[0].n === 3) return { name: 'THREE OF A KIND', rank: 3, tie: [groups[0].v, ...groups.slice(1).map(g => g.v).slice(0, 2)] };
  if (groups[0].n === 2 && groups[1]?.n === 2) {
    // Two pair: kicker is the highest remaining card, not merely the next-ranked
    // pair-group — with three pairs on board/hand, the third pair's *value* is
    // not necessarily the best available single kicker.
    let pairA = groups[0].v, pairB = groups[1].v,
      remainingCounts = { [pairA]: 2, [pairB]: 2 },
      remaining = [];
    cards.forEach(c => {
      if (remainingCounts[c.value] > 0) { remainingCounts[c.value]--; return }
      remaining.push(c.value)
    });
    remaining.sort((a, b) => b - a);
    return { name: 'TWO PAIR', rank: 2, tie: [pairA, pairB, remaining[0] || 0] }
  }
  if (groups[0].n === 2) return { name: 'PAIR', rank: 1, tie: [groups[0].v, ...groups.slice(1).map(g => g.v).slice(0, 3)] };
  return { name: 'HIGH CARD', rank: 0, tie: uniq.slice(0, 5) }
}

function compareScore(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tie.length, b.tie.length); i++)
    if ((a.tie[i] || 0) !== (b.tie[i] || 0)) return (a.tie[i] || 0) - (b.tie[i] || 0);
  return 0
}

function render() {
  if (!game) return;
  $('#potValue').textContent = '$' + game.pot;
  $('#hudFormat').textContent = mode === 'local' ? 'LOCAL TABLE' : mode === 'online' ? 'ONLINE ROOM' : 'SOLO TABLE';
  $('#hudSeat').textContent = game.winner !== null ? 'HAND COMPLETE' : (game.players[game.turn]?.name || '—').toUpperCase();
  $('#hudBank').textContent = '$' + game.players.reduce((sum, player) => sum + player.chips, 0);
  $('#streetLabel').textContent = game.winner !== null ? 'SHOWDOWN' : game.street.toUpperCase();
  $('#handNumber').textContent = '#' + String(game.handNo).padStart(3, '0');
  $('#playerCount').textContent = game.players.length;
  $('#rebuyBtn').classList.toggle('hidden', !(mode === 'single' && game.winner !== null && game.players[0]?.chips <= 0));
  $('#freshStartBtn').classList.toggle('hidden', !(game.winner !== null && tableNeedsReset()));
  $('#undoBtn').classList.toggle('hidden', !(['single', 'local'].includes(mode) && game.history?.length > 0));
  $('#community').replaceChildren(...(mode === 'local' ? game.community.map((c, i) => {
    let d = document.createElement('div');
    d.className = 'board-marker';
    d.textContent = i < 3 ? 'OPEN' : 'OPEN';
    return d
  }) : game.community.map(c => card(c))));
  let viewId = mode === 'local' ? game.turn : myId;
  if (mode === 'local') {
    $('#holeCards').innerHTML = '<span class="hidden-hand-note">Private cards stay with each player</span>';
    $('#handStrength').textContent = ''
  } else {
    $('#holeCards').replaceChildren(...(game.players[viewId]?.hand || []).map(c => card(c)));
    $('#handStrength').textContent = game.winner === null ? estimate(game.players[viewId]?.hand || [], game.community) : ''
  }
  let p = game.players[game.turn],
    canAct = game.started && !game.awaitingWinner && !game.pendingReveal && (mode === 'local' || p.id === myId);
  $('#turnLabel').textContent = game.winner !== null ? 'FINAL HAND' : mode === 'local' ? `${p.name.toUpperCase()} — PASS THE DEVICE` : p.id === myId ? 'YOUR HAND' : `${p.name.toUpperCase()} IS PLAYING`;
  $('#actionHint').textContent = game.winner !== null ? `${game.tiedWinners?.join(' & ')||game.players[game.winner].name} ${game.tiedWinners?'split':'wins'} with ${game.winningScore?.name||'the best hand'}. Start a new hand when ready.` : canAct ? 'Your move — make it count.' : `${p.name} is thinking…`;
  let m = Math.max(...game.players.filter(x => !x.folded).map(x => x.bet));
  let owed = Math.max(0, m - (game.players[viewId]?.bet || 0));
  $('#callAmount').textContent = '$' + owed;
  $('#actions [data-action="check"]').classList.toggle('hidden', owed > 0);
  $('#actions [data-action="call"]').classList.toggle('hidden', owed === 0);
  $('#actions').classList.toggle('hidden', game.winner !== null || !canAct);
  let raiseRange = $('#raiseRange');
  if (raiseRange && p) raiseRange.max = String(Math.max(1, p.bet + p.chips));
  renderPlayers()
}

function renderPlayers() {
  let l = $('#playersLayer');
  l.replaceChildren();
  game.players.forEach((p, i) => {
    let isWinner = game.allWinnerIds ? game.allWinnerIds.includes(p.id) : (game.winner === p.id || game.tiedWinners?.includes(p.name));
    let s = document.createElement('div');
    s.className = `player-seat seat-${i} ${i===game.turn?'active':''} ${isWinner?'winner':''}`;
    s.innerHTML = `<div class="seat-name">${p.name}${p.folded?'<span class="folded-tag">FOLDED</span>':''}</div><div class="stack">$${p.chips}</div><div class="mini-cards"></div>${p.bet?`<div class="bet">$${p.bet}</div>`:''}`;
    s.querySelector('.mini-cards').replaceChildren(...(mode !== 'local' && (p.id === myId || game.winner !== null) ? p.hand.map(c => card(c)) : p.hand.map(() => card(null, true))));
    l.append(s)
  })
}

function showWinnerPage() {
  let pot = game.pendingPots?.[game.potIndex] || { amount: game.pot, eligible: game.players.filter(p => !p.folded).map(p => p.id) },
    eligible = pot.eligible.map(id => game.players.find(p => p.id === id)).filter(Boolean),
    box = $('#winnerChoices');
  $('#winnerPot').textContent = '$' + pot.amount;
  box.replaceChildren(...eligible.map(p => {
    let b = document.createElement('button');
    b.className = 'winner-choice';
    b.innerHTML = `<span><strong>${p.name}</strong><small>$${p.chips} stack · still in</small></span><b>→</b>`;
    b.onclick = () => settleWinner(p.id);
    return b
  }));
  if (game.pendingPots && game.pendingPots.length > 1) {
    $('#deckStatus').textContent = `Showdown — choose the winner (pot ${game.potIndex+1} of ${game.pendingPots.length})`
  }
  show($('#winnerView'))
}

function settleWinner(id) {
  let winner = game.players.find(p => p.id === id);
  if (!winner) return;
  if (game.pendingPots && game.pendingPots.length) {
    let pot = game.pendingPots[game.potIndex];
    winner.chips += pot.amount;
    game.allWinnerIds = [...new Set([...(game.allWinnerIds || []), winner.id])];
    game.potIndex++;
    if (game.potIndex < game.pendingPots.length) {
      toast(`${winner.name} wins $${pot.amount}`);
      showWinnerPage();
      return
    }
  } else {
    winner.chips += game.pot;
    game.allWinnerIds = [winner.id]
  }
  game.winner = winner.id;
  game.tiedWinners = game.allWinnerIds.length > 1 ? [...new Set(game.allWinnerIds.map(pid => game.players.find(p => p.id === pid)?.name).filter(Boolean))] : null;
  game.awaitingWinner = false;
  game.winningScore = { name: game.pendingPots && game.pendingPots.length > 1 ? 'MULTIPLE POTS' : 'MANUAL SHOWDOWN' };
  $('#setWinnerBtn').classList.add('hidden');
  $('#deckStatus').textContent = `${winner.name} wins the pot`;
  toast(`${winner.name} wins $${game.pot}`);
  show($('#gameView'));
  game.needsTableReset = tableNeedsReset();
  render();
  if (game.needsTableReset) {
    toast('Half the table is out — start a fresh game to continue');
    setTimeout(promptTableReset, 350);
  } else scheduleLocalHand()
}

function setLocalWinner() {
  if (game?.awaitingWinner) showWinnerPage()
}

function estimate(h, c) {
  return evaluate([...h, ...c])?.name || ''
}

function freshStart() {
  if (!game || game.winner === null || !tableNeedsReset()) return;
  game.players.forEach(p => p.chips = 100);
  game.needsTableReset = false;
  $('#tableResetModal').classList.add('hidden');
  $('#freshStartBtn').classList.add('hidden');
  toast('Fresh table — every stack reset to $100');
  newHand()
}

function rebuy() {
  if (mode !== 'single' || !game || game.winner === null || game.players[0].chips > 0) return;
  game.players[0].chips = 100;
  $('#rebuyBtn').classList.add('hidden');
  toast('Fresh stack added — good luck');
  render()
}

function newHand() {
  cancelCountdown(true);
  clearTimeout(autoHandTimer);
  if (mode === 'single' && game.players[0]?.chips <= 0) return toast('Rebuy before starting a new hand');
  let oldPlayers = game.players, old = oldPlayers.length;
  game = {
    deck: deck(),
    community: [],
    pot: 0,
    minRaise: 2,
    street: 'preflop',
    dealer: (game.dealer + 1) % old,
    nextSmall: game.nextSmall,
    turn: 0,
    players: oldPlayers.map((p, i) => ({
      ...p,
      id: i,
      hand: [],
      folded: false,
      bet: 0,
      totalBet: 0,
      acted: false,
      bot: mode === 'single' && i > 0
    })),
    handNo: game.handNo + 1,
    winner: null,
    started: false,
    cut: false,
    botLevel: game.botLevel || $('#botLevel')?.value || 'sharp',
    history: []
  };
  if (mode !== 'local') game.players.forEach(p => p.hand = [game.deck.pop(), game.deck.pop()]);
  if (mode === 'local') {
    $('#setWinnerBtn').classList.add('hidden');
    $('#openBoardBtn').classList.add('hidden');
    $('#dealHandBtn').textContent = 'Deal hand';
    $('#deckStatus').textContent = 'Deck ready — cut before dealing'
  }
  render();
  if (mode === 'local') showDealerStep('cut');
  else if (mode !== 'online' || connections.length) setTimeout(deal, 300);
  else {
    $('#deckStatus').textContent = 'Waiting for a guest to join';
    $('#actionHint').textContent = 'Share the room code — the hand starts when a guest arrives.';
  }
}

function renderRoster() {
  let box = $('#playerRoster');
  box.replaceChildren(...game.players.map((p, i) => {
    let row = document.createElement('div');
    row.className = 'roster-row';
    row.innerHTML = `<span><strong>${p.name}</strong><br>Seat ${i+1} · $${p.chips}</span>${game.players.length>2&&i>0?'<button title="Remove player">×</button>':''}`;
    let remove = row.querySelector('button');
    if (remove) remove.onclick = () => removePlayer(i);
    return row
  }))
}

function openPlayersPage() {
  if (mode !== 'local') return toast('Player management is available for local tables');
  if (game.started && game.winner === null) return toast('Finish the current hand before changing players');
  renderRoster();
  show($('#playersView'))
}

function addPlayer() {
  if (mode !== 'local') return;
  if (game.started && game.winner === null) return toast('Finish the current hand before adding players');
  if (game.players.length >= 8) return toast('A table can have up to 8 players');
  let input = $('#newPlayerName'), name = input.value.trim();
  if (!name) return toast('Enter a player name');
  if (game.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return toast('That player is already at the table');
  game.players.push({ id: game.players.length, name, chips: 100, hand: [], folded: false, bet: 0, totalBet: 0, acted: false, bot: false });
  input.value = '';
  renderRoster();
  render();
  toast(`${name} joined the table`)
}

function removePlayer(index) {
  if (mode !== 'local') return toast('Only local tables can edit the roster');
  if (game.started && game.winner === null) return toast('Finish the current hand first');
  if (game.players.length <= 2) return toast('Keep at least 2 players');
  let dealerPlayer = game.players[game.dealer],
    oldNextSmall = game.nextSmall,
    removed = game.players.splice(index, 1)[0];
  if (oldNextSmall !== undefined && oldNextSmall !== null) {
    game.nextSmall = oldNextSmall === index ? index : oldNextSmall > index ? oldNextSmall - 1 : oldNextSmall
  }
  game.players.forEach((p, i) => p.id = i);
  let dealerIndex = game.players.indexOf(dealerPlayer);
  game.dealer = dealerIndex >= 0 ? dealerIndex : Math.min(index, game.players.length - 1);
  renderRoster();
  render();
  toast(`${removed.name} left the table`)
}

function sendState(c, recipientId) {
  if (!c?.open) return;
  let view = JSON.parse(JSON.stringify(game));
  view.players.forEach(p => {
    if (p.id !== recipientId && view.winner === null) p.hand = []
  });
  c.send({ type: 'state', game: view })
}

function sync() {
  if (isHost) {
    $('#roomPlayers').textContent = `${connections.length+1}/8 players`;
    connections.forEach(x => sendState(x.conn, x.id))
  }
}
let setupData = [
  { name: 'You', stack: 100, blind: 'small' },
  { name: 'Maya', stack: 100, blind: 'big' },
  { name: 'Theo', stack: 100, blind: 'none' },
  { name: 'Ari', stack: 100, blind: 'none' }
];

function renderSetup() {
  let box = $('#setupPlayers');
  box.replaceChildren();
  setupData.forEach((raw, i) => {
    let p = { name: 'Player ' + (i + 1), stack: 100, blind: 'none', ...(raw || {}) },
      row = document.createElement('div');
    row.className = 'setup-row';
    let name = document.createElement('input');
    name.dataset.field = 'name';
    name.value = p.name;
    name.maxLength = 14;
    name.setAttribute('aria-label', `Player ${i+1} name`);
    let position = document.createElement('span');
    position.className = 'setup-position';
    position.textContent = `Seat ${i+1}`;
    let blind = document.createElement('select');
    blind.dataset.field = 'blind';
    blind.setAttribute('aria-label', `Player ${i+1} blind`);
    [
      ['none', 'None'],
      ['small', 'Small'],
      ['big', 'Big']
    ].forEach(([value, label]) => {
      let option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = p.blind === value;
      blind.append(option)
    });
    row.append(name, position, blind);
    if (i > 1) {
      let remove = document.createElement('button');
      remove.type = 'button';
      remove.title = 'Remove player';
      remove.textContent = '×';
      remove.onclick = () => {
        setupData.splice(i, 1);
        renderSetup()
      };
      row.append(remove)
    } else row.append(document.createElement('span'));
    box.append(row)
  })
}

function openLocalSetup() {
  setupData = setupData.slice(0, 4);
  renderSetup();
  show($('#localSetupView'))
}

function startConfiguredLocal() {
  let rows = [...document.querySelectorAll('.setup-row')];
  let common = Math.max(2, Number($('#commonPot').value) || 100),
    data = rows.map((row, i) => ({
      name: row.querySelector('[data-field=name]').value.trim() || `Player ${i+1}`,
      stack: common,
      blind: row.querySelector('[data-field=blind]').value
    }));
  if (data.length < 2) return toast('Add at least 2 players');
  if (data.filter(x => x.blind === 'small').length !== 1 || data.filter(x => x.blind === 'big').length !== 1) return toast('Assign exactly one small blind and one big blind');
  localStorage.setItem('velvet-stack-saved-players', JSON.stringify(data.map(x => x.name)));
  start('local', data.map(x => x.name), data)
}
$$('.mode-card').forEach(b => b.onclick = () => {
  if (b.dataset.mode === 'online') show($('#onlineView'));
  else if (b.dataset.mode === 'local') openLocalSetup();
  else start('single')
});
// The local setup exit is a normal href link, so it stays reliable even if scripts fail.
$('#addSetupPlayer').onclick = () => {
  if (setupData.length >= 8) return toast('A table can have up to 8 players');
  setupData.push({ name: `Player ${setupData.length+1}`, stack: 100, blind: 'none' });
  renderSetup()
};
$('#startLocalTable').onclick = startConfiguredLocal;
$('#backToLobby').onclick = () => show($('#lobbyView'));
function returnToLobby() {
  cancelCountdown(true);
  clearTimeout(window.botTimer); clearTimeout(progressTimer); clearTimeout(autoHandTimer);
  peer?.destroy(); peer = null; conn = null; connections = []; isHost = false;
  // Always dismiss every local-table overlay before exposing the lobby.
  ['#tableResetModal', '#dealerModal', '#helpModal', '#countdownModal'].forEach(id => $(id)?.classList.add('hidden'));
  show($('#lobbyView'))
}
$('#leaveGame').onclick = returnToLobby;
$('#dealerLeave').onclick = returnToLobby;
$('#playersBtn').onclick = openPlayersPage;
$('#undoBtn').onclick = undoLast;
$('#rebuyBtn').onclick = rebuy;
$('#freshStartBtn').onclick = freshStart;
$('#resetTableNow').onclick = freshStart;
$('#backFromPlayers').onclick = () => { show($('#gameView')); render() };
$('#addPlayerBtn').onclick = addPlayer;
$('#newPlayerName').onkeydown = e => { if (e.key === 'Enter') addPlayer() };
$('#backFromWinner').onclick = () => { show($('#gameView')); render() };
$('#newHandBtn').onclick = () => {
  if (mode === 'online' && !isHost) return toast('Only the host can start a new hand');
  newHand()
};
$('#cancelCountdown').onclick = () => cancelCountdown();
$('#helpBtn').onclick = () => $('#helpModal').classList.remove('hidden');
$('#closeHelp').onclick = $('#gotIt').onclick = () => $('#helpModal').classList.add('hidden');
$$('.action-btn').forEach(b => b.onclick = () => {
  if (b.dataset.action === 'raise') {
    let p = game?.players?.[game.turn],
      m = game ? Math.max(...game.players.filter(x => !x.folded).map(x => x.bet)) : 0,
      minIncrement = game?.minRaise || 2,
      range = $('#raiseRange');
    if (p && range) {
      let maxTarget = p.bet + p.chips, minTarget = m + minIncrement;
      range.max = String(Math.max(1, maxTarget));
      range.min = String(Math.min(maxTarget, minTarget));
      range.value = String(Math.min(maxTarget, minTarget));
      $('#raiseValue').textContent = 'To $' + range.value
    }
    $('#actions').classList.add('hidden');
    $('#raiseControl').classList.remove('hidden')
  } else act(b.dataset.action)
});
$('#raiseRange').oninput = e => $('#raiseValue').textContent = 'To $' + e.target.value;
$('#confirmRaise').onclick = () => {
  $('#raiseControl').classList.add('hidden');
  $('#actions').classList.remove('hidden');
  act('raise', +$('#raiseRange').value)
};
document.onkeydown = e => {
  if (e.key.toLowerCase() === 'f') act('fold');
  if (e.key.toLowerCase() === 'c') act('check');
  if (e.key === 'Enter') act('call')
};
$('#copyCode').onclick = () => navigator.clipboard?.writeText($('#shareCode').textContent).then(() => toast('Room code copied'));

function host() {
  if (typeof Peer === 'undefined') return toast('Online service unavailable — use local mode');
  isHost = true;
  connections = [];
  let code = '';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  peer = new Peer(code.toLowerCase(), { debug: 0 });
  peer.on('open', () => {
    $('#shareCode').textContent = code;
    $('#roomBadge').classList.remove('hidden');
    $('#roomBadge b').textContent = code;
    start('online', [$('#hostName').value || 'Host', 'Guest']);
    $('#connectionStatus').textContent = 'Room ' + code
  });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') toast('That room code was busy — please try again');
    else toast('Could not create the room')
  });
  peer.on('connection', c => {
    let slot = game ? game.players.findIndex(p => p.bot) : -1;
    if (slot < 0 && game && game.players.length < 8) {
      slot = game.players.length;
      game.players.push({ id: slot, name: 'Guest ' + slot, chips: 100, hand: [], folded: false, bet: 0, totalBet: 0, acted: false, bot: true })
    }
    c.on('open', () => {
      if (!game || slot < 0 || slot >= 8) {
        c.send({ type: 'full' });
        return
      }
      connections.push({ conn: c, id: slot });
      c.playerId = slot;
      game.players[slot].name = 'Guest ' + slot;
      game.players[slot].bot = false;
      c.send({ type: 'welcome', playerId: slot });
      toast(`${game.players[slot].name} joined the room`);
      sync();
      if (!game.started) setTimeout(deal, 250)
    });
    c.on('data', d => {
      if (d.type === 'hello' && c.playerId !== undefined) {
        game.players[c.playerId].name = (d.name || `Guest ${c.playerId}`).slice(0, 14);
        sync()
      }
      if (d.type === 'action' && c.playerId !== undefined) {
        let allowed = ['fold', 'check', 'call', 'raise'].includes(d.action);
        let validAmount = d.action !== 'raise' || (Number.isInteger(d.amount) && d.amount >= 0 && d.amount <= 1000000);
        if (allowed && validAmount && game.turn === c.playerId) act(d.action, d.amount)
      }
    });
    c.on('close', () => {
      let found = connections.find(x => x.conn === c);
      if (found && game?.players[found.id]) {
        game.players[found.id].name = 'Guest ' + found.id;
        game.players[found.id].bot = true;
        if (game.started && !game.players[found.id].folded) {
          game.players[found.id].folded = true;
          if (game.turn === found.id) advance();
        }
        toast('A player left the room — their hand was folded');
        render();
        sync()
      }
      connections = connections.filter(x => x.conn !== c)
    })
  })
}

function join() {
  if (typeof Peer === 'undefined') return toast('Online service unavailable');
  let code = $('#roomCode').value.trim().toLowerCase();
  if (!code) return toast('Enter a room code');
  peer = new Peer(undefined, { debug: 0 });
  peer.on('open', () => {
    conn = peer.connect(code);
    conn.on('open', () => {
      isHost = false;
      conn.send({ type: 'hello', name: ($('#joinName').value || 'Player').slice(0, 14) });
      $('#connectionStatus').textContent = 'Connecting…'
    });
    conn.on('data', d => {
      if (d.type === 'welcome') {
        myId = d.playerId;
        $('#connectionStatus').textContent = 'Connected as player ' + (myId + 1);
        toast('Joined the table')
      }
      if (d.type === 'full') toast('This room is full');
      if (d.type === 'state') {
        game = d.game;
        mode = 'online';
        show($('#gameView'));
        render()
      }
    });
    conn.on('close', () => toast('Host disconnected'))
  })
}
$('#hostBtn').onclick = host;
$('#joinBtn').onclick = join;
$('#cutDeckBtn').onclick = cutDeck;
$('#dealHandBtn').onclick = () => { if (!game || mode !== 'local') return; deal() };
$('#openBoardBtn').onclick = () => { if (game?.pendingReveal) street(true) };
$('#setWinnerBtn').onclick = setLocalWinner;
// Settings panel — the top-right gear stores table preferences locally.
function updateSavedPlayersDetail() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('velvet-stack-saved-players') || '[]') } catch (_) {}
  $('#savedPlayersDetail').textContent = saved.length ? saved.join(' · ') : 'No saved local roster yet.'
}
function openSettings() {
  let level = localStorage.getItem('velvet-stack-bot-level') || $('#botLevel').value || 'sharp';
  let count = localStorage.getItem('velvet-stack-bot-count') || '7';
  $('#settingsBotLevel').value = level;
  $('#settingsBotCount').value = count;
  updateSavedPlayersDetail();
  $('#settingsModal').classList.remove('hidden')
}
$('#soundBtn').onclick = openSettings;
$('#closeSettings').onclick = () => $('#settingsModal').classList.add('hidden');
$('#saveSettings').onclick = () => {
  let level = $('#settingsBotLevel').value, count = $('#settingsBotCount').value;
  localStorage.setItem('velvet-stack-bot-level', level);
  localStorage.setItem('velvet-stack-bot-count', count);
  $('#botLevel').value = level;
  $('#settingsModal').classList.add('hidden');
  toast(`Saved: ${level} bots · ${count} opponents`)
};
let storedBotLevel = localStorage.getItem('velvet-stack-bot-level');
if (storedBotLevel) $('#botLevel').value = storedBotLevel;
document.body.classList.toggle('no-ambient', localStorage.getItem('velvet-stack-ambient') === 'off');

let savedTheme = localStorage.getItem('velvet-stack-theme') || 'emerald';
document.body.dataset.theme = savedTheme;
$('#themeSelect').value = savedTheme;
$('#themeSelect').onchange = e => {
  document.body.dataset.theme = e.target.value;
  localStorage.setItem('velvet-stack-theme', e.target.value)
};

// Ambient felt lighting reacts to pointer movement while leaving gameplay controls stable.
(function velvetAmbientMotion(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let queued=false,x=0,y=0;
  const paint=()=>{queued=false;document.body.style.setProperty('--motion-x',`${x*7}%`);document.body.style.setProperty('--motion-y',`${y*5}%`)};
  addEventListener('pointermove',e=>{x=e.clientX/innerWidth-.5;y=e.clientY/innerHeight-.5;if(!queued){queued=true;requestAnimationFrame(paint)}},{passive:true});
})();

// Decorative card meteors: lightweight physical-card drift with chip bursts on contact.
(function velvetCardMeteors(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer=document.querySelector('.ambient-cards');
  if(!layer) return;
  layer.querySelectorAll('i').forEach(x=>x.remove());
  const suits=['♠','♥','♦','♣'], ranks=['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
  const unoFaces=['+2','+4','↻','⊘','WILD','0','1','2','3','4','5','6','7','8','9'], isUno=document.body.classList.contains('uno');
  // The revealed loading cards become this page's meteor cards.
  const faces=window.__velvetAmbientFaces || (window.__velvetAmbientFaces=Array.from({length:5},(_,i)=>{
    const uno=isUno;
    return uno ? {uno:true,label:unoFaces[Math.floor(Math.random()*unoFaces.length)]} : {rank:ranks[Math.floor(Math.random()*ranks.length)],suit:suits[Math.floor(Math.random()*suits.length)]};
  }));
  // Match the loading row exactly, then fling the revealed cards outward into the room.
  const dealWidth=76, dealStep=59, startX=innerWidth/2-(dealWidth+(faces.length-1)*dealStep)/2, startY=innerHeight/2-28;
  const cards=faces.map((face,index)=>{
    const el=document.createElement('div'),uno=!!face.uno,suit=face.suit||'';
    el.className='ambient-card'+((suit==='♥'||suit==='♦')?' red':'')+(uno?' uno':'');
    el.innerHTML=uno ? `<span>${face.label}</span>` : `<b class="ac-rank">${face.rank}</b><b class="ac-suit">${suit}</b><b class="ac-center">${suit}</b>`;
    layer.append(el);
    const launch=[[-.82,.06],[-.28,-.74],[0,.86],[.28,-.74],[.82,.06]][index]||[0,.15];return {el,x:startX+index*dealStep,y:startY,vx:launch[0],vy:launch[1],rot:(index-(faces.length-1)/2)*3,vr:(Math.random()-.5)*.08,lastHit:0};
  });
  const burst=(x,y)=>{for(let n=0;n<6;n++){const chip=document.createElement('i');chip.className='ambient-chip';chip.style.left=x+'px';chip.style.top=y+'px';chip.style.setProperty('--chip-x',(Math.random()*90-45)+'px');chip.style.setProperty('--chip-y',(Math.random()*90-45)+'px');document.body.append(chip);setTimeout(()=>chip.remove(),750)}};
  let last=performance.now(), launchedAt=0;
  const tick=now=>{const step=Math.min(2.2,(now-last)/16.7);last=now;
    if(!document.body.classList.contains('no-ambient')){
      cards.forEach(c=>{c.x+=c.vx*step;c.y+=c.vy*step;c.rot+=c.vr*step;if(c.x<-90||c.x>innerWidth+20)c.vx*=-1;if(c.y<-120||c.y>innerHeight+20)c.vy*=-1;c.el.style.transform=`translate3d(${c.x}px,${c.y}px,0) rotate(${c.rot}deg)`});
      for(let a=0;a<cards.length;a++)for(let b=a+1;b<cards.length;b++){const A=cards[a],B=cards[b];const hit=A.x < B.x+74 && A.x+74 > B.x && A.y < B.y+106 && A.y+106 > B.y;if(launchedAt&&now-launchedAt>3000&&hit&&now-A.lastHit>700){A.lastHit=B.lastHit=now;const overlapX=Math.min(A.x+74,B.x+74)-Math.max(A.x,B.x),overlapY=Math.min(A.y+106,B.y+106)-Math.max(A.y,B.y);const edgeX=(Math.max(A.x,B.x)+Math.min(A.x+74,B.x+74))/2,edgeY=(Math.max(A.y,B.y)+Math.min(A.y+106,B.y+106))/2;if(overlapX<overlapY){const dir=(A.x+37)<(B.x+37)?-1:1,push=overlapX/2+3;A.x+=dir*push;B.x-=dir*push;A.vx=dir*Math.min(.34,Math.max(.18,Math.abs(A.vx)*1.08));B.vx=-dir*Math.min(.34,Math.max(.18,Math.abs(B.vx)*1.08))}else{const dir=(A.y+53)<(B.y+53)?-1:1,push=overlapY/2+3;A.y+=dir*push;B.y-=dir*push;A.vy=dir*Math.min(.34,Math.max(.18,Math.abs(A.vy)*1.08));B.vy=-dir*Math.min(.34,Math.max(.18,Math.abs(B.vy)*1.08))}A.vr*=-1.08;B.vr*=-1.08;burst(edgeX,edgeY)}}
    } requestAnimationFrame(tick)};
  // Keep the revealed loading cards in focus, then release this same set into the background.
  setTimeout(()=>{launchedAt=performance.now();requestAnimationFrame(tick)},2050);
})();

// Brief deal-in: the exact cards revealed here become the ambient meteor deck.
(function velvetDealIn(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { document.body.classList.remove('velvet-loading'); return; }
  const faces=window.__velvetAmbientFaces;if(!faces){document.body.classList.remove('velvet-loading');return;}
  const overlay=document.createElement('div');overlay.className='deal-loader';
  const title=document.createElement('div');title.className='deal-loader-title';title.textContent='VELVET STACK';overlay.append(title);
  const row=document.createElement('div');row.className='deal-loader-row';
  faces.forEach((face,i)=>{const c=document.createElement('div'),s=face.suit||'';c.className='deal-loader-card '+((s==='♥'||s==='♦')?'red':'')+(face.uno?' uno':'');c.style.setProperty('--deal-delay',i*.18+'s');c.innerHTML=face.uno?`<b>${face.label}</b>`:`<b>${face.rank}</b><span>${s}</span><em>${s}</em>`;row.append(c)});overlay.append(row);document.body.append(overlay);
  setTimeout(()=>{overlay.classList.add('exit');setTimeout(()=>{overlay.remove();document.body.classList.remove('velvet-loading')},1050)},1850);
})();
