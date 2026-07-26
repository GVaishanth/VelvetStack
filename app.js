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
    players: players(kind === 'local' ? Math.max(2, Math.min(8, names?.length || 4)) : kind === 'online' ? Math.max(2, Math.min(8, names?.length || 2)) : 8, names),
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
  else setTimeout(deal, 300)
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
  if (!game || !game.started || game.winner !== null) return;
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
      requested = amount || (m + minIncrement),
      target = Math.max(m + minIncrement, requested),
      paid = Math.min(p.chips, target - p.bet);
    if (paid <= 0) return toast('Raise is not available');
    let reachedFullRaise = (p.bet + paid) >= target;
    p.chips -= paid;
    p.bet += paid;
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
  let h = p.hand || [], all = [...h, ...game.community];
  if (!h.length) return .5;
  if (!game.community.length) {
    let vals = h.map(c => c.value).sort((a, b) => b - a),
      pair = vals[0] === vals[1],
      high = vals[0] >= 12,
      connected = vals[0] - vals[1] <= 2,
      suited = h[0].suit === h[1].suit;
    return Math.min(.9, .18 + (pair ? .34 : 0) + (high ? .13 : 0) + (connected ? .07 : 0) + (suited ? .06 : 0) + (vals[0] === 14 ? .06 : 0))
  }
  return Math.min(.98, .08 + (evaluate(all).rank / 8) * .82)
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
  let foldBase = level === 'casual' ? .025 : level === 'pro' ? .12 : .06,
    raiseBase = level === 'casual' ? .08 : level === 'pro' ? .18 : .12;
  let foldChance = Math.max(0, foldBase + (owed > 0 ? .22 * (1 - equity) : 0)),
    raiseChance = raiseBase + equity * .3;
  if (owed > 0 && r < foldChance && game.street !== 'river') return act('fold');
  if (r < raiseChance) return act('raise', max + Math.max(game.minRaise || 2, level === 'pro' ? 8 : 5));
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
  scheduleAutoHand()
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
  $('#streetLabel').textContent = game.winner !== null ? 'SHOWDOWN' : game.street.toUpperCase();
  $('#handNumber').textContent = '#' + String(game.handNo).padStart(3, '0');
  $('#playerCount').textContent = game.players.length;
  $('#rebuyBtn').classList.toggle('hidden', !(mode === 'single' && game.winner !== null && game.players[0]?.chips <= 0));
  $('#freshStartBtn').classList.toggle('hidden', !(game.winner !== null && game.players.filter(p => p.chips <= 0).length > 4));
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
    canAct = !game.awaitingWinner && !game.pendingReveal && (mode === 'local' || p.id === myId);
  $('#turnLabel').textContent = game.winner !== null ? 'FINAL HAND' : mode === 'local' ? `${p.name.toUpperCase()} — PASS THE DEVICE` : p.id === myId ? 'YOUR HAND' : `${p.name.toUpperCase()} IS PLAYING`;
  $('#actionHint').textContent = game.winner !== null ? `${game.tiedWinners?.join(' & ')||game.players[game.winner].name} ${game.tiedWinners?'split':'wins'} with ${game.winningScore?.name||'the best hand'}. Start a new hand when ready.` : canAct ? 'Your move — make it count.' : `${p.name} is thinking…`;
  let m = Math.max(...game.players.filter(x => !x.folded).map(x => x.bet));
  let owed = Math.max(0, m - (game.players[viewId]?.bet || 0));
  $('#callAmount').textContent = '$' + owed;
  $('#actions [data-action="check"]').classList.toggle('hidden', owed > 0);
  $('#actions [data-action="call"]').classList.toggle('hidden', owed === 0);
  $('#actions').classList.toggle('hidden', game.winner !== null || !canAct);
  let raiseRange = $('#raiseRange');
  if (raiseRange && p) raiseRange.max = String(Math.max(1, p.chips));
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
  render();
  scheduleLocalHand()
}

function setLocalWinner() {
  if (game?.awaitingWinner) showWinnerPage()
}

function estimate(h, c) {
  return evaluate([...h, ...c])?.name || ''
}

function freshStart() {
  if (!game || game.winner === null || game.players.filter(p => p.chips <= 0).length <= 4) return;
  game.players.forEach(p => p.chips += 100);
  $('#freshStartBtn').classList.add('hidden');
  toast('Fresh start — $100 added to every stack');
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
  if (mode !== 'local') setTimeout(deal, 300);
  else showDealerStep('cut')
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
  start('local', data.map(x => x.name), data)
}
$$('.mode-card').forEach(b => b.onclick = () => {
  if (b.dataset.mode === 'online') show($('#onlineView'));
  else if (b.dataset.mode === 'local') openLocalSetup();
  else start('single')
});
$('#backFromLocalSetup').onclick = () => show($('#lobbyView'));
$('#addSetupPlayer').onclick = () => {
  if (setupData.length >= 8) return toast('A table can have up to 8 players');
  setupData.push({ name: `Player ${setupData.length+1}`, stack: 100, blind: 'none' });
  renderSetup()
};
$('#startLocalTable').onclick = startConfiguredLocal;
$('#backToLobby').onclick = () => show($('#lobbyView'));
$('#leaveGame').onclick = () => {
  cancelCountdown(true);
  peer?.destroy();
  show($('#lobbyView'))
};
$('#playersBtn').onclick = openPlayersPage;
$('#undoBtn').onclick = undoLast;
$('#rebuyBtn').onclick = rebuy;
$('#freshStartBtn').onclick = freshStart;
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
      range.max = String(Math.max(1, p.chips));
      range.min = String(Math.min(p.chips, minIncrement));
      range.value = String(Math.min(p.chips, m + minIncrement - p.bet > 0 ? m + minIncrement - p.bet : minIncrement));
      $('#raiseValue').textContent = '$' + range.value
    }
    $('#actions').classList.add('hidden');
    $('#raiseControl').classList.remove('hidden')
  } else act(b.dataset.action)
});
$('#raiseRange').oninput = e => $('#raiseValue').textContent = '$' + e.target.value;
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
      sync()
    });
    c.on('data', d => {
      if (d.type === 'hello' && c.playerId !== undefined) {
        game.players[c.playerId].name = (d.name || `Guest ${c.playerId}`).slice(0, 14);
        sync()
      }
      if (d.type === 'action' && c.playerId !== undefined) {
        if (game.turn === c.playerId) act(d.action, d.amount)
      }
    });
    c.on('close', () => {
      let found = connections.find(x => x.conn === c);
      if (found && game?.players[found.id]) {
        game.players[found.id].name = 'Guest ' + found.id;
        game.players[found.id].bot = true;
        toast('A player left the room');
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
let savedTheme = localStorage.getItem('velvet-stack-theme') || 'emerald';
document.body.dataset.theme = savedTheme;
$('#themeSelect').value = savedTheme;
$('#themeSelect').onchange = e => {
  document.body.dataset.theme = e.target.value;
  localStorage.setItem('velvet-stack-theme', e.target.value)
};
