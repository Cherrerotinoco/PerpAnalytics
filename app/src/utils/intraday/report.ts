import type { CvdAnalysis, Divergence, IntradaySnapshot } from './types';

// Self-contained briefing for an AI assistant: raw data + the interpretation rules
// needed to turn it into a probabilistic scenario table, so a fresh agent with no
// prior context can work from this single paste.
//
// The methodology is the one in bitcoinAnalizer/AGENT.md, reweighted around the
// sources this edition actually has (see fetchers.ts): order flow carries the weight.
// Markdown rather than box-drawing separators — it parses better as a prompt and
// still renders fine in a <pre>.

const usd = (n: number | null | undefined, digits = 0): string =>
  n == null ? 'N/A' : '$' + n.toLocaleString('en-US', { maximumFractionDigits: digits });

const millions = (n: number | null | undefined): string => {
  if (n == null) return 'N/A';
  const s = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${s}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${s}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${s}$${(abs / 1e3).toFixed(1)}K`;
  return `${s}$${abs.toFixed(0)}`;
};

const pct = (n: number | null | undefined): string =>
  n == null ? 'N/A' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;

const sign = (n: number | null | undefined, d = 1): string =>
  n == null ? 'N/A' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`;

const sigEmoji = (s: string | null | undefined): string =>
  s === 'BULLISH' ? '🟢' : s === 'BEARISH' ? '🔴' : '⚪';

const num = (n: number | null | undefined): string => n?.toLocaleString('en-US') ?? 'N/A';

// ─── Interpretation guide (static) ────────────────────────────────────────────

const ROLE = `# ROLE
You are a quantitative Bitcoin intraday trading analyst. Your task: read the DATA below
and return a scenario analysis (bullish / bearish / sideways) with a probability table
summing to 100%, following the methodology and output format specified further down.

This data is raw figures plus deterministic signals already computed for you. Your value
is the JOINT READING of those signals and the translation into scenarios — not
recomputing numbers.

⚠️ SCOPE: the DATA block below is the complete set of inputs. Base the analysis exclusively
on aggressor order flow (CVD) and gamma exposure. If your usual methodology would weight a
metric that does not appear below, leave it out — do not estimate it, do not assume it and
do not write a section about it.`;

const GUIDE = `# HOW TO INTERPRET THE DATA

## A) Multi-timeframe CVD — aggressor order flow (HIGH WEIGHT, primary driver)
CVD (Cumulative Volume Delta) is net aggressor volume (taker buy − taker sell): it measures
who is being aggressive RIGHT NOW, buying at market (lifting the ask) or selling at market
(hitting the bid).

**Timeframes 15m / 1H / 4H.** These are nested horizons of the SAME aggressor pressure, and
they cover the IN-PROGRESS candle of each timeframe (aligned to Binance's clock cut, not a
rolling window). Read them largest to smallest to separate trend from noise:
- 4H = background aggressor bias of the current block. 1H = pressure of the hour. 15m = the
  immediate pulse (useful for timing, noisiest).
- Alignment (all three the same sign) = consistent pressure → more conviction.
- Conflict (e.g. 4H negative but 15m positive) = incipient turn or just a pause: treat it as
  a timing signal, not a trend signal; confirm against the session.
- ⚠️ These are PARTIAL candles: a freshly opened TF candle has few 5m candles behind it and
  is not representative. A 4H that just opened carries less weight than a mature one. The
  "maturity" line tells you how much sample backs each number.

**Session signal 🟢/🔴/⚪.** It only reads BULLISH/BEARISH when net aggression exceeds ±5% of
total volume; below that it is NEUTRAL. ⚠️ The signal and the divergence are INDEPENDENT: a
NEUTRAL CVD can coexist with a live divergence. Never treat NEUTRAL as "no information".

**Price↔CVD divergence (the highest-value read).** Compares the session price move (close of
the 1st 5m candle → close of the last, i.e. intraday since 00:00 UTC) against the sign of
cumulative CVD. Four patterns:
- Bullish aggression (price↑ + CVD↑): aggressive buying pushing price, with real volume
  behind it. High bullish conviction while it holds.
- Bearish aggression (price↓ + CVD↓): aggressive selling pushing price. High bearish
  conviction while it holds.
- Bullish absorption (price↓ but CVD positive): passive demand eating the supply despite the
  drop → floor warning (BULLISH).
- Bearish absorption (price↑ but CVD negative, "rally without aggressor volume"): rising on
  absence of supply, not on real buying → top warning (BEARISH).
The "Divergence" field only labels BULLISH / BEARISH / CONFIRMS. ⚠️ CONFIRMS is the default
bucket and is DIRECTION-AGNOSTIC: it covers bullish aggression, bearish aggression and also
a nearly flat price (which is strong aggression in neither direction). Never write "confirms
the bias" without checking the actual sign of session CVD and price to know WHAT is being
confirmed. If price barely moved, treat it as neutral.

**Structure nuance.** When a divergence exists, the report computes whether price pivots
(local lows/highs, ±3 candles of 5m) hold their structure. Rising lows despite a negative CVD
= stepped passive absorption, more constructive than a "hollow rally": use it to qualify the
bearish read rather than taking it at face value. Falling highs despite a positive CVD =
buy-side absorption weaker than it looks.

**⚠️ Per-timeframe absorption.** For each TF the sign of CVD is compared against the price
move WITHIN that same window (follow-through threshold: 0.05%):
- Absorbed buying (strong CVD↑ but price does not rise): passive supply eats the buying →
  distribution / top (BEARISH). Once the buying is exhausted, nothing holds price up.
- Absorbed selling (strong CVD↓ but price does not fall): passive demand eats the selling →
  accumulation / floor (BULLISH).
Aggression ONLY counts if price rewards it. A buying turn on 15m/1H loses reliability when
flagged as absorbed: treat it as distribution, not as strength.

**Spot vs perp.** The perp trades far more volume and reflects leverage/speculation; spot
reflects real cash.
- Perp selling aggressively while spot holds or buys = leveraged shorts pressing against cash
  demand → if price does not fall, SHORT SQUEEZE risk (cross-check with the gamma Squeeze
  Risk).
- Perp buying while spot sells = leverage-driven rally with no cash backing, more fragile.
- ⚠️ Do NOT compare absolute magnitudes between spot and perp (perp is several times larger):
  compare SIGN and DIRECTION only, never size in BTC.

**CVD min/max excursion.** Detects intraday reversals: a CVD that bottomed and is recovering
(even with the net still negative) = buyers regaining control.

**Last candle + recent momentum.** Acceleration or turn in pressure. A negative day CVD with
the last minutes flipping positive = possible change of hands underway. ⚠️ Use the actual
window printed ("last N min"), do not assume 15 min.

## B) Daily CVD of previous days (MEDIUM-HIGH WEIGHT, background context)
Aggressor delta of the last COMPLETE sessions (spot and perp).
- Several consecutive days of the same sign = sustained pressure (background accumulation or
  distribution). Today's session inherits that bias unless it contradicts it.
- A recent turn against the multi-day streak gains relevance (e.g. 4 days of selling and
  buying today = possible floor).
- The spot↔perp divergence applies day by day too.
- ⚠️ This is context, NOT a trigger: use it to weight conviction, never to trade on alone.

## C) Gamma exposure (MEDIUM WEIGHT — modulates, does not replace)
⚠️ Sign convention: netGamma is assumed dealer-adjusted (negative = dealers short gamma). If
the regime clashes head-on with every other signal, suspect the sign and say so.
- NEGATIVE net gamma → amplified volatility; dealers hedge with the move and breakouts
  self-accelerate. LOWERS the probability of SIDEWAYS and raises conviction on whichever side
  breaks the pivot level.
- POSITIVE net gamma → mean reversion; price is pinned to the max-gamma level. RAISES the
  probability of SIDEWAYS.
- Pin (support == resistance) → price magnet and pivot level. ⚠️ "PIN" is only labelled on an
  EXACT match: if support and resistance come very close but not identical there is still a
  magnet — treat it as a quasi-pin and say so.
- Breakout → the break trigger. Compare it against current price: above = bullish trigger;
  below = bearish trigger. With negative gamma, breaking it tends to self-accelerate; with
  positive gamma price is more likely to reject it and return to the pin.
- Put/Call ratio → P/C > 1 defensive/bearish, < 1 offensive/bullish. A nuance, not a driver.
- Options flow (callFlow / putFlow / flow C/P) → where options money is positioning NOW
  (distinct from net gamma, which is accumulated stock). Confirms or qualifies the bias; not
  a driver on its own.
- realizedVol > impliedVol → expect more turbulence than the market is pricing.
- squeezeRisk / pinRisk → the vulnerable side and the strength of the magnet.
Gamma warns about the VOLATILITY REGIME and sets the real PIVOT LEVEL.

## D) End-of-capitulation check (convergence marker, not a verdict)
Counts how many exhaustion conditions hold. It is NOT a verdict: a bottom is only confirmed
in hindsight. The more simultaneous ✅, the more confidence. A "·" means the data is missing
and that condition counts neither for nor against.
⚠️ It runs on the order-flow conditions listed in the block: treat it as a partial marker
that supports a read, never as the read itself.

## E) Reading history
Sequence of pulls stored in the user's browser. Use it to read the EVOLUTION between readings
(is CVD recovering or sinking?). ⚠️ It may be empty or very short on a first visit: with fewer
than 3 records, say so and do not infer a trend from them.`;

const PROBABILITY_RULES = `# PROBABILITY RULES
Heuristic, not rigorous statistics. Weight, highest to lowest:
1. **Session spot price↔CVD divergence and absorption (high weight).** The highest-value read
   available in this edition.
2. **Spot and perp session CVD: sign, relative magnitude and the divergence between them
   (high weight).**
3. **Alignment or conflict across 15m / 1H / 4H (medium-high weight),** discounted by candle
   maturity and by absorption.
4. **Multi-day aggressor trend from the daily CVD (medium-high weight)** as background context.
5. **Gamma regime (medium weight):** modulates conviction and, above all, the SIDEWAYS
   probability (negative lowers it, positive raises it).
6. **Capitulation check (low-medium weight):** confirmation, never a primary driver.

Allocation rules:
- The three probabilities must sum to exactly 100%.
- If signals contradict each other, reflect it with spread probabilities (e.g. 45/45/10)
  instead of forcing conviction.
- Cap your conviction: avoid assigning more than 60% to a single scenario unless order flow,
  daily context and gamma all point the same way with no absorption against it.
- Early in the UTC session (few 5m candles) the sample is small: move towards a neutral split
  and say so explicitly.`;

const OUTPUT_FORMAT = `# REQUIRED OUTPUT FORMAT
Render in native markdown (headings, **bold**, tables). NOT inside a code block. Do NOT
replicate the DATA block: produce the analysis.

## 📊 Intraday BTC — Report
**⏰ Run:** [UTC time] · **💵 BTC price:** $XX,XXX · **📈 Session:** [number of 5m candles since 00:00 UTC]

### 📊 Order flow (Binance spot + perp) — [🟢/🔴/⚪ spot session signal]
[table: Tape | 15m | 1H | 4H | Session — rows Spot and Perp; read alignment or conflict]
- **Price↔CVD divergence (spot)** → [bullish aggression / bearish aggression / bullish
  absorption / bearish absorption] plus the structure nuance if it applies
- **Per-timeframe absorption** → [if flagged, say so and discount that TF]
- **Spot vs perp** → [aligned or divergent; if divergent, leverage vs cash, cross-checked
  against the gamma squeeze risk]
- **Excursion and momentum** → [CVD min/max, last candle, last N min]

### 🗓️ Multi-day context
[streak or turn across previous sessions and how it conditions today]

### 🧲 Gamma exposure (Deribit) — [⚡/🧲/⚪ regime]
- **Net gamma** (call vs put) · **P/C ratio** · bias
- **Pivot / breakout** · support · resistance, compared against current price
- Realized vs implied vol → [interpretation] · squeeze / pin risk

### 🎯 Intraday scenarios
[required table: Scenario | Prob. | Drivers | Key level]
[rows: 🟢 Bullish / 🔴 Bearish / ⚪ Sideways — probabilities MUST sum to 100%]
[in "Drivers" cite the concrete signals from the DATA that support that probability]
[in "Key level" use gamma levels; if there are none, say so rather than inventing them]

### 📐 Suggested setups (LONG / SHORT)
[table: Setup | Entry | Stop (invalidation) | Target | R:R | Volatility note]
LONG = the bullish scenario plus the share of sideways that resolves up. SHORT = bearish plus
the share of sideways that resolves down. Entry = current price or the relevant breakout/pin
level. Stop = the gamma level that breaks the thesis (support for LONG, resistance for SHORT).
Target = the next gamma level in that direction. R:R = |target − entry| / |entry − stop|, to
1 decimal. If gamma is missing or there are no usable levels for one side, OMIT that setup and
say so — do not fabricate levels.
[reminder: a mechanical translation of levels, not a recommendation to enter or to size]

### 🧠 Conclusion
[2-3 sentences: dominant bias, volatility regime, what to watch that would invalidate the thesis]

> ⚠️ Automated analysis over public data. Not financial advice.`;

const STRICT_RULES = `# STRICT RULES
1. NEVER invent data: use ONLY what appears in the DATA block of this run.
2. If a source failed (listed under "Issues" or its section says no data), say so explicitly
   and do not fabricate that part.
3. Never introduce a metric that is absent from the DATA block, even if your usual
   methodology would weight it. Work with what is there.
4. The scenario table probabilities must sum to exactly 100%.
5. Do not compare absolute CVD magnitudes between spot and perp, only sign and direction.
6. If the sample is small (session just opened, history < 3 readings), flag it and spread the
   probabilities more neutrally.`;

// ─── Data block ───────────────────────────────────────────────────────────────

const buildDataBlock = (snap: IntradaySnapshot): string => {
  const {
    generatedAt,
    errors,
    gamma,
    gammaRegime,
    cvdFlows,
    cvdPerpFlows,
    cvdDaily,
    capitulation,
    history,
  } = snap;
  const out: string[] = [];

  out.push('# DATA');
  out.push(`**Run:** ${generatedAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}`);
  if (cvdFlows?.priceTo != null) {
    out.push(`**BTC price (last 5m candle close):** ${usd(cvdFlows.priceTo)}`);
  }
  if (errors.length) {
    out.push('');
    out.push('**Issues in this run:**');
    for (const e of errors) out.push(`- ${e}`);
  }
  out.push('');

  // ---- Multi-timeframe CVD ----
  out.push('## Aggressor order flow — Binance spot + perp');
  if (!cvdFlows && !cvdPerpFlows) {
    out.push('No CVD data in this run.');
  } else {
    out.push('');
    out.push(
      'Aggressor delta (BTC) of the IN-PROGRESS candle of each timeframe · Session = accumulated since 00:00 UTC.'
    );
    out.push('');
    out.push('| Tape | 15m | 1H | 4H | Session |');
    out.push('| --- | --- | --- | --- | --- |');
    const tfRow = (label: string, f: CvdAnalysis | null): string => {
      if (!f) return `| ${label} | no data | no data | no data | no data |`;
      const tf = f.timeframes;
      return `| ${label} | ${sign(tf.m15?.delta)} | ${sign(tf.h1?.delta)} | ${sign(tf.h4?.delta)} | ${sigEmoji(f.signal)} ${sign(f.totalCvd)} |`;
    };
    out.push(tfRow('Spot', cvdFlows));
    out.push(tfRow('Perp', cvdPerpFlows));
    out.push('');

    // Maturity of each in-progress TF candle — how much sample backs each number.
    const maturity = (label: string, f: CvdAnalysis | null): string | null => {
      if (!f) return null;
      const tf = f.timeframes;
      return `- ${label} maturity (5m candles inside the in-progress candle): 15m ${tf.m15?.bars ?? 0}/3 · 1H ${tf.h1?.bars ?? 0}/12 · 4H ${tf.h4?.bars ?? 0}/48`;
    };
    const mSpot = maturity('Spot', cvdFlows);
    const mPerp = maturity('Perp', cvdPerpFlows);
    if (mSpot) out.push(mSpot);
    if (mPerp) out.push(mPerp);

    const absNote = (tape: string, f: CvdAnalysis | null): string | null => {
      const notes: string[] = [];
      for (const key of ['m15', 'h1', 'h4'] as const) {
        const t = f?.timeframes?.[key];
        if (!t) continue;
        const k = t.flow?.kind;
        if (k === 'ABSORBED_BUYING') {
          notes.push(
            `${t.label} ABSORBED BUYING (CVD ${sign(t.delta)} but price does not rise → distribution, bearish)`
          );
        } else if (k === 'ABSORBED_SELLING') {
          notes.push(
            `${t.label} ABSORBED SELLING (CVD ${sign(t.delta)} but price does not fall → accumulation, bullish)`
          );
        }
      }
      return notes.length ? `- ⚠️ ${tape} absorption: ${notes.join(' · ')}` : null;
    };
    const spotAbs = absNote('Spot', cvdFlows);
    const perpAbs = absNote('Perp', cvdPerpFlows);
    if (spotAbs) out.push(spotAbs);
    if (perpAbs) out.push(perpAbs);
    if (!spotAbs && !perpAbs) out.push('- No absorption flagged on any timeframe.');
    out.push('');

    if (cvdFlows) {
      out.push('### Spot session (reference tape)');
      out.push(
        `- Cumulative CVD: ${sign(cvdFlows.totalCvd)} BTC (${millions(cvdFlows.deltaUsd)}) · signal ${sigEmoji(cvdFlows.signal)} ${cvdFlows.signal} · ${cvdFlows.bars} candles of 5m`
      );
      out.push(
        `- Net session aggression: ${cvdFlows.ratio != null ? pct(cvdFlows.ratio * 100) : 'N/A'} (signal threshold ±5.00%) · buy ${cvdFlows.buyBtc.toFixed(0)} BTC / sell ${cvdFlows.sellBtc.toFixed(0)} BTC`
      );
      out.push(
        `- Session price: ${usd(cvdFlows.priceFrom)} → ${usd(cvdFlows.priceTo)} (${cvdFlows.priceFrom != null && cvdFlows.priceTo != null && cvdFlows.priceFrom !== 0 ? pct(((cvdFlows.priceTo - cvdFlows.priceFrom) / cvdFlows.priceFrom) * 100) : 'N/A'})`
      );
      out.push(
        `- Last candle: ${sign(cvdFlows.lastDelta)} BTC · last ${cvdFlows.recentBars * 5} min: ${sign(cvdFlows.recentDelta)} BTC`
      );
      out.push(
        `- CVD session excursion: min ${sign(cvdFlows.minCvd)} / max ${sign(cvdFlows.maxCvd)} BTC`
      );

      const divLabels: Record<Divergence, string> = {
        BULLISH: 'BULLISH — price falls over the session but CVD rises → buy-side absorption',
        BEARISH: 'BEARISH — price rises but CVD falls → rally without aggressor volume',
        CONFIRMS: 'CONFIRMS — session CVD and price aligned (direction-agnostic: check the signs)',
        'N/A': 'N/A — not enough data',
      };
      out.push(`- Price↔CVD divergence: ${divLabels[cvdFlows.divergence]}`);

      const swings = cvdFlows.priceSwings;
      if (cvdFlows.divergence === 'BEARISH' && swings.lowsAscending != null) {
        out.push(
          swings.lowsAscending
            ? '  - ⚠️ Nuance: price lows (5m) are still rising → passive absorption; a LESS bearish read than CVD alone suggests.'
            : '  - ⚠️ Nuance: price lows (5m) are no longer rising (the previous one broke) → with no counterweight, the bearish read stands unqualified.'
        );
      } else if (cvdFlows.divergence === 'BULLISH' && swings.highsDescending != null) {
        out.push(
          swings.highsDescending
            ? '  - ⚠️ Nuance: price highs (5m) are still falling → absorption WEAKER than CVD alone suggests.'
            : '  - ⚠️ Nuance: price highs (5m) are no longer falling (it cleared the previous one) → with no counterweight, the bullish read stands unqualified.'
        );
      } else {
        out.push('  - No structure nuance applicable (or not enough pivots).');
      }
      out.push('');
    }

    if (cvdPerpFlows) {
      out.push('### Perp session');
      out.push(
        `- Cumulative CVD: ${sign(cvdPerpFlows.totalCvd)} BTC · signal ${sigEmoji(cvdPerpFlows.signal)} ${cvdPerpFlows.signal} · ${cvdPerpFlows.bars} candles of 5m`
      );
      if (cvdFlows) {
        const spotSign = Math.sign(cvdFlows.totalCvd);
        const perpSign = Math.sign(cvdPerpFlows.totalCvd);
        out.push(
          spotSign !== 0 && perpSign !== 0 && spotSign !== perpSign
            ? '- ⚠️ SPOT↔PERP DIVERGENCE: cash and leverage are aggressing in opposite directions.'
            : '- Spot and perp aligned in sign.'
        );
      }
      out.push('');
    }

    const daySpot = cvdDaily?.spot ?? [];
    const dayPerp = cvdDaily?.perp ?? [];
    if (daySpot.length || dayPerp.length) {
      const perpByDay = new Map(dayPerp.map((d) => [d.dayMs, d]));
      out.push('### Daily CVD — previous complete sessions (background context)');
      out.push('');
      out.push('| Date | Spot | Perp |');
      out.push('| --- | --- | --- |');
      for (const d of daySpot) {
        const date = d.dayMs != null ? new Date(d.dayMs).toISOString().slice(0, 10) : 'N/A';
        out.push(`| ${date} | ${sign(d.delta)} | ${sign(perpByDay.get(d.dayMs)?.delta)} |`);
      }
      out.push('');
    }
  }

  // ---- Gamma ----
  out.push('## Gamma exposure (Deribit)');
  if (!gamma || !gamma.ok) {
    out.push(
      gamma?.ok === false && gamma.degraded
        ? 'No usable snapshot: the API returned a well-formed Dataset with the gamma metrics zeroed (placeholder).'
        : 'No gamma snapshot in this run.'
    );
  } else {
    out.push(`- Generated: ${gamma.generatedAt ?? 'N/A'}`);
    out.push(`- Net gamma: ${num(gamma.netGamma)} → ${gammaRegime?.regimeLabel ?? 'N/A'}`);
    out.push(`- Call gamma: ${num(gamma.callGamma)} · Put gamma: ${num(gamma.putGamma)}`);
    out.push(
      `- Put/Call ratio: ${gamma.putCallRatio ?? 'N/A'} (${gammaRegime?.defensive ? 'defensive/bearish' : 'offensive/bullish'}) · Bias: ${gamma.bias ?? 'N/A'}`
    );
    out.push(
      gammaRegime?.isPin
        ? `- Levels: exact PIN at ${usd(gammaRegime.pinLevel)} · breakout ${usd(gamma.breakout)}`
        : `- Levels: support ${usd(gamma.support)} / resistance ${usd(gamma.resistance)} · breakout ${usd(gamma.breakout)}`
    );
    out.push(`- Snapshot reference price: ${usd(gamma.currentPrice)}`);
    out.push(
      `- Vol: realized ${gamma.realizedVol ?? 'N/A'}% vs implied ${gamma.impliedVol ?? 'N/A'}% (premium ${gamma.volPremium ?? 'N/A'}) → ${gammaRegime?.realizedGtImplied ? 'options UNDERPRICE the real move' : 'options cover the move'}`
    );
    out.push(
      `- Squeeze risk: ${gamma.squeezeRisk ?? 'N/A'} · Pin risk: ${gamma.pinRisk ?? 'N/A'} · Delta hedging: ${gamma.deltaHedging ?? 'N/A'}`
    );
    out.push(
      `- Options flow: call ${num(gamma.callFlow)} · put ${num(gamma.putFlow)} · flow C/P ${gamma.flowCpRatio ?? 'N/A'} · callWeighted ${num(gamma.callWeighted)}`
    );
  }
  out.push('');

  // ---- Capitulation ----
  if (capitulation.checks.length) {
    out.push('## End-of-capitulation check');
    out.push(`Conditions met: ${capitulation.met}/${capitulation.total} → ${capitulation.verdict}`);
    for (const c of capitulation.checks) {
      out.push(`- ${c.met == null ? '·' : c.met ? '✅' : '❌'} ${c.label} (${c.detail})`);
    }
    out.push('');
  }

  // ---- History ----
  out.push("## Reading history (stored in the user's browser)");
  if (!history.length) {
    out.push('No previous history: this is the first stored reading.');
  } else {
    out.push('');
    out.push('| UTC time | Price | Spot CVD | Perp CVD | Gamma regime |');
    out.push('| --- | --- | --- | --- | --- |');
    for (let i = 0; i < history.length; i++) {
      const r = history[i];
      const tag = i === history.length - 1 ? ' ← current' : '';
      out.push(
        `| ${r.t.slice(11, 16)}${tag} | ${usd(r.price)} | ${sign(r.cvdSpot)} | ${sign(r.cvdPerp)} | ${r.gammaRegime ?? '—'} |`
      );
    }
    if (history.length < 3) {
      out.push('');
      out.push(
        `⚠️ Only ${history.length} reading(s): not enough sample to infer a trend between pulls.`
      );
    }
  }

  return out.join('\n');
};

/** Full briefing: role + data + interpretation guide + rules + output format. */
export const buildIntradayReport = (snap: IntradaySnapshot): string =>
  [ROLE, buildDataBlock(snap), GUIDE, PROBABILITY_RULES, OUTPUT_FORMAT, STRICT_RULES].join(
    '\n\n---\n\n'
  );
