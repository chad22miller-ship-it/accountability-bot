/**
 * Consistency Compounds - Accountability Bot (free, GitHub Actions edition)
 * ------------------------------------------------------------------------
 * Runs entirely free on GitHub Actions. No server, no credit card.
 * GitHub runs this file every few minutes (see .github/workflows/bot.yml).
 * Each run does ONE pass and exits; all memory lives in state.json, which the
 * workflow commits back to your repo. That's what makes it survive 24/7 with
 * your computer off - GitHub's machines do the work, not yours.
 *
 * Each run:
 *   - Checks Telegram for your reply. "yes" -> instant personalized win, done for the day.
 *   - At/after your set time, sends the daily ask (once per day).
 *   - While waiting: nudges at most once per hour, gives up after 12 hours.
 *
 * Uses only Node's built-in tools (fetch, fs) - zero dependencies to install or trust.
 */

const fs = require('fs');
const path = require('path');

// ---------- Config (secrets come from GitHub Secrets; rest from the workflow file) ----------
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '');
const CHECKIN_URL = process.env.CHECKIN_URL || 'https://consistencycompounds.vercel.app/';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const TIMEZONE = process.env.TIMEZONE || 'America/New_York';
const ASK_HOUR = parseInt(process.env.ASK_HOUR || '9', 10);
const ASK_MINUTE = parseInt(process.env.ASK_MINUTE || '0', 10);
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, 'state.json');
const SMOKE_TEST = process.env.SMOKE_TEST === '1';

const NAG_INTERVAL_MS = 60 * 60 * 1000;  // remind at most once per hour
const GIVE_UP_MS = 12 * 60 * 60 * 1000;  // stop after 12 hours
const API = `https://api.telegram.org/bot${TOKEN}`;
const pad = (n) => String(n).padStart(2, '0');

// ---------- State ----------
const DEFAULT_STATE = {
  phase: 'idle',            // 'idle' | 'awaiting'
  askedAt: null,            // ms timestamp of today's ask
  lastNagAt: null,          // ms timestamp of last reminder
  lastAskedDate: null,      // 'YYYY-MM-DD' the daily ask last fired
  lastConfirmedDate: null,  // 'YYYY-MM-DD' of last confirmed check-in
  tgOffset: 0,              // Telegram update offset (so replies are never reprocessed)
  recent: []                // recent messages, to avoid repeats
};
let state = { ...DEFAULT_STATE };

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) state = { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
  } catch (e) { console.error('state load failed, using defaults:', e.message); }
}
function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n'); }
  catch (e) { console.error('state save failed:', e.message); }
}

function nowParts() {
  const d = new Date();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const [h, m] = hm.split(':').map((n) => parseInt(n, 10));
  return { date, h: h % 24, m };
}

// ---------- Chad's DNA (fuels the coach voice) ----------
const DNA = `
THE WHY: future kids who get a loving, present, empowering dad; breaking generational cycles; Ashley and the ripple effect; being the leader/guide/helper he needed.
90-DAY GOALS: 10 recruits/month, 10 big-event registrations/month, SMD at the October Convention, 3 reps trained on discovery and closing, time audit + prospect tracker + PPF Discovery locked in, admin delegated or eliminated.
18-MONTH VISION: 3 strong leaders each with 15 at convention, $25K/month passive income, $1M company valuation, EMD-level leader, $250K saved for the Aegon stock opportunity.
FAMILY VISION: margin for a future family vs. the 14-hour-day trap.
CORE VALUES: "Do what's best for people," "No excuses," "Simplify to multiply," "Take 100% responsibility."
WHAT MOVES THE NEEDLE: recruiting conversations, prospect discovery, deep coaching with the team.
`.trim();

const TEMPLATES = {
  ask: [
    `Morning, Chad - have you done your check-in at ${CHECKIN_URL} yet today? Reply yes or no.`,
    `New day, same standard: check-in done yet at ${CHECKIN_URL}? Hit me with yes or no.`,
    `Before the day runs you - did you log your check-in at ${CHECKIN_URL}? Reply yes or no.`,
    `Champions punch the clock. Have you done today's check-in at ${CHECKIN_URL}? Yes or no.`
  ],
  nudge: [
    `Still waiting on you, Chad. Check-in at ${CHECKIN_URL} - done yet? Reply yes or no.`,
    `Two minutes now beats a guilty conscience later. Check-in done? ${CHECKIN_URL} - yes or no.`,
    `Don't let the streak die on a technicality. Did you check in at ${CHECKIN_URL}? Yes or no.`,
    `The man you're becoming doesn't skip this. Check-in at ${CHECKIN_URL}? Reply yes or no.`
  ],
  win: [
    `This is why you deserve to win: every check-in is a brick in the legacy your future kids will stand on. Keep stacking.`,
    `This is why you deserve to win: you just proved "no excuses" isn't a slogan, it's who you are - that's how SMD gets built.`,
    `This is why you deserve to win: consistency like this is exactly what turns 14-hour grinds into $25K/month of margin. Onward.`,
    `This is why you deserve to win: the leader your team needs showed up today, and that ripple reaches Ashley and everyone after her.`
  ]
};
function pickTemplate(kind) {
  const pool = TEMPLATES[kind];
  const unused = pool.filter((m) => !state.recent.includes(m));
  const arr = unused.length ? unused : pool;
  return arr[Math.floor(Math.random() * arr.length)];
}

const PROMPTS = {
  ask: 'Write ONE short sentence asking Chad, with warm but direct coach energy, whether he has done his daily check-in yet. You MUST include this exact link: ' + CHECKIN_URL + ' and tell him to reply yes or no.',
  nudge: "Write ONE short sentence nudging Chad (he hasn't confirmed yet) to do his daily check-in. Direct coach energy, a little fire, no guilt-tripping. You MUST include this exact link: " + CHECKIN_URL + ' and tell him to reply yes or no.',
  win: 'Chad just confirmed his check-in. Write a 1-2 sentence celebration that MUST start with exactly "This is why you deserve to win:" then tie today\'s win to a SPECIFIC piece of his WHY/vision below. Fresh angle, no cliches.'
};

async function generate(kind) {
  if (ANTHROPIC_API_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: `You are Chad Miller's no-nonsense accountability coach (think Tony Robbins: raw truth, warmth, zero fluff). Keep it to ONE or TWO sentences, plain text, no markdown. Do not repeat any of these recent messages: ${JSON.stringify(state.recent)}. Here is Chad's DNA to draw from:\n${DNA}`,
          messages: [{ role: 'user', content: PROMPTS[kind] }]
        })
      });
      const j = await r.json();
      const text = (j.content || []).map((b) => b.text || '').join('').trim();
      if (text) return text;
      console.error('AI returned no text:', JSON.stringify(j).slice(0, 200));
    } catch (e) { console.error('AI generation failed, using template:', e.message); }
  }
  return pickTemplate(kind);
}

// ---------- Telegram (built-in fetch) ----------
async function tgSend(kind) {
  const text = await generate(kind);
  try {
    const r = await fetch(`${API}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text })
    });
    const j = await r.json();
    if (!j.ok) throw new Error(JSON.stringify(j));
    state.recent = [text, ...state.recent].slice(0, 20);
    console.log(`sent ${kind}: ${text}`);
  } catch (e) { console.error('send failed:', e.message); }
}
async function tgReply(text) {
  try {
    await fetch(`${API}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text })
    });
  } catch (e) { console.error('reply failed:', e.message); }
}

// ---------- One pass ----------
async function runOnce() {
  loadState();
  const { date, h, m } = nowParts();

  // 1) read any new replies
  try {
    const r = await fetch(`${API}/getUpdates?timeout=0&offset=${state.tgOffset || 0}`);
    const j = await r.json();
    if (j.ok && Array.isArray(j.result)) {
      for (const u of j.result) {
        state.tgOffset = u.update_id + 1;
        const msg = u.message || u.edited_message;
        if (!msg || !msg.chat || String(msg.chat.id) !== CHAT_ID) continue;
        const text = (msg.text || '').toLowerCase().trim();

        if (['/start', '/ping', 'ping', '/test'].includes(text)) {
          await tgReply(`Online and locked in. I'll ask about your check-in every day at ${pad(ASK_HOUR)}:${pad(ASK_MINUTE)} (${TIMEZONE}). Reply "yes" when it's done and I'll send your win.`);
          continue;
        }
        if (state.phase === 'awaiting' && (!state.askedAt || msg.date * 1000 >= state.askedAt) &&
            text.includes('yes') && state.lastConfirmedDate !== date) {
          state.phase = 'idle';
          state.askedAt = null;
          state.lastNagAt = null;
          state.lastConfirmedDate = date;
          await tgSend('win');
        }
      }
    }
  } catch (e) { console.error('getUpdates failed:', e.message); }

  // 2) scheduling + reminders
  const now = Date.now();
  if (state.phase !== 'awaiting') {
    const pastAskTime = h > ASK_HOUR || (h === ASK_HOUR && m >= ASK_MINUTE);
    if (state.lastAskedDate !== date && state.lastConfirmedDate !== date && pastAskTime) {
      state.lastAskedDate = date;
      state.phase = 'awaiting';
      state.askedAt = now;
      state.lastNagAt = now;
      await tgSend('ask');
    }
  } else {
    const sinceAsk = now - (state.askedAt || now);
    const sinceNag = now - (state.lastNagAt || now);
    if (sinceAsk > GIVE_UP_MS) {
      state.phase = 'idle';
      state.askedAt = null;
      state.lastNagAt = null;
      console.log('gave up for today (12h, no confirmation)');
    } else if (sinceNag >= NAG_INTERVAL_MS) {
      state.lastNagAt = now;
      await tgSend('nudge');
    }
  }

  saveState();
  console.log(`run complete @ ${date} ${pad(h)}:${pad(m)} ${TIMEZONE} | phase=${state.phase}`);
}

// ---------- Entry ----------
if (SMOKE_TEST) {
  loadState();
  const p = nowParts();
  console.log('SMOKE - now in', TIMEZONE, '=', JSON.stringify(p), '| ask at', `${ASK_HOUR}:${ASK_MINUTE}`);
  for (const k of ['ask', 'nudge', 'win']) console.log('SMOKE', k, '->', pickTemplate(k));
  console.log('SMOKE ok');
} else {
  if (!TOKEN || !CHAT_ID) { console.error('Missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID'); process.exit(1); }
  runOnce();
}
