const db = require('./db');

const DAY_MS = 24 * 60 * 60 * 1000;
const MILESTONES = {
  3: { bonusXp: 500, reward: 'uncommon cosmetic' },
  7: { bonusXp: 1500, reward: '3 loot boxes', title: 'Weekly Warrior' },
  14: { bonusXp: 3000, reward: '5 loot boxes' },
  30: { bonusXp: 10000, reward: '5 loot boxes', title: 'Monthly Legend' }
};

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(left, right) {
  const leftTime = Date.parse(`${left}T00:00:00Z`);
  const rightTime = Date.parse(`${right}T00:00:00Z`);
  return Math.round((rightTime - leftTime) / DAY_MS);
}

function scaleClaimXp(progressionMult = 1) {
  const multiplier = Number(progressionMult);
  const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return Math.min(500, Math.floor(150 * (1 + 0.25 * Math.log2(safeMultiplier))));
}

function parseTitles(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function getState(discordUserId) {
  return new Promise((resolve, reject) => db.get(
    'SELECT * FROM streak_state WHERE discord_user_id = ?', [String(discordUserId)], (error, row) => {
      if (error) return reject(error);
  if (!row) {
    return resolve({
      discordUserId: String(discordUserId),
      currentStreak: 0,
      longestStreak: 0,
      lastClaimDate: null,
      totalClaims: 0,
      totalXpFromClaims: 0,
      milestoneTitlesAwarded: {}
    });
  }
  resolve({
    discordUserId: row.discord_user_id,
    currentStreak: row.current_streak || 0,
    longestStreak: row.longest_streak || 0,
    lastClaimDate: row.last_claim_date || null,
    totalClaims: row.total_claims || 0,
    totalXpFromClaims: row.total_xp_from_claims || 0,
    milestoneTitlesAwarded: parseTitles(row.milestone_titles_awarded)
  });
  }));
}

async function getClaimPreview(discordUserId, progressionMult = 1) {
  const state = await getState(discordUserId);
  const today = todayUtc();
  const alreadyClaimed = state.lastClaimDate === today;
  const nextStreak = alreadyClaimed ? state.currentStreak : (
    !state.lastClaimDate || daysBetween(state.lastClaimDate, today) > 3
      ? 1
      : state.currentStreak + 1
  );
  const cycleDay = ((Math.max(1, nextStreak) - 1) % 30) + 1;
  const nextMilestoneDay = [3, 7, 14, 30].find((day) => cycleDay < day) || 3;
  const daysAway = cycleDay < nextMilestoneDay ? nextMilestoneDay - cycleDay : 30 - cycleDay + 3;
  return {
    canClaim: !alreadyClaimed,
    currentStreak: state.currentStreak,
    longestStreak: state.longestStreak,
    previewXp: { scaled: scaleClaimXp(progressionMult), tierLabel: 'HangStream' },
    nextMilestone: { day: nextMilestoneDay, daysAway, bonusXp: MILESTONES[nextMilestoneDay].bonusXp },
    cosmeticChance: cycleDay === 3 ? 0.2 : 0
  };
}

async function claim(discordUserId, progressionMult = 1) {
  const id = String(discordUserId || '').trim();
  if (!/^\d{17,20}$/.test(id)) {
    throw new Error('A valid Discord user ID is required');
  }
  const today = todayUtc();
  const state = await getState(id);
  if (state.lastClaimDate === today) {
    return { claimed: false, ...(await getClaimPreview(id, progressionMult)), message: 'Already claimed today.' };
  }

  const gap = state.lastClaimDate ? daysBetween(state.lastClaimDate, today) : null;
  const streak = !state.lastClaimDate || gap > 3 ? 1 : state.currentStreak + 1;
  const cycleDay = ((streak - 1) % 30) + 1;
  const milestone = MILESTONES[cycleDay] || null;
  const titles = { ...state.milestoneTitlesAwarded };
  let titleAwarded = null;
  if (milestone && milestone.title && !titles[milestone.title]) {
    titles[milestone.title] = today;
    titleAwarded = milestone.title;
  }
  const baseXp = scaleClaimXp(progressionMult);
  const bonusXp = milestone ? milestone.bonusXp : 0;
  const xpAwarded = baseXp + bonusXp;
  const longest = Math.max(state.longestStreak, streak);

  await new Promise((resolve, reject) => db.run(`
    INSERT INTO streak_state
      (discord_user_id, current_streak, longest_streak, last_claim_date, total_claims, total_xp_from_claims, milestone_titles_awarded)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(discord_user_id) DO UPDATE SET
      current_streak = excluded.current_streak,
      longest_streak = excluded.longest_streak,
      last_claim_date = excluded.last_claim_date,
      total_claims = excluded.total_claims,
      total_xp_from_claims = excluded.total_xp_from_claims,
      milestone_titles_awarded = excluded.milestone_titles_awarded
  `, [id, streak, longest, today, state.totalClaims + 1, state.totalXpFromClaims + xpAwarded, JSON.stringify(titles)], (error) => error ? reject(error) : resolve()));
  await new Promise((resolve, reject) => db.run(`
    INSERT INTO daily_claims
      (discord_user_id, claim_date, xp_awarded, streak_day, is_milestone, milestone_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, today, xpAwarded, streak, milestone ? 1 : 0, milestone ? (milestone.title || milestone.reward) : null], (error) => error ? reject(error) : resolve()));

  return {
    claimed: true,
    currentStreak: streak,
    longestStreak: longest,
    claimDate: today,
    xp: { base: baseXp, bonus: bonusXp, total: xpAwarded },
    milestone: milestone ? { day: cycleDay, reward: milestone.reward, titleAwarded } : null,
    message: `Day ${streak}: +${xpAwarded} XP${titleAwarded ? ` and the ${titleAwarded} title` : ''}.`
  };
}

module.exports = { getState, getClaimPreview, claim, todayUtc };
