import { CAT, VID } from './defaults.js';
import { daysBetween, todayISO, splitItems } from './util.js';

export function valuesOf(state, pid) {
  const r = state.ratings[pid] || {};
  return Object.fromEntries(Object.entries(r).map(([vid, o]) => [vid, o.v]));
}

export function weighted(vars, values) {
  let sum = 0, w = 0;
  for (const v of vars) {
    const x = values[v.id];
    if (x != null) { sum += x * v.weight; w += v.weight; }
  }
  return w ? Math.round(sum / w) : null;
}

export const activeVars = (state) => state.variables.filter((v) => v.active).sort((a, b) => a.order - b.order);

export function overall(state, pid) {
  return weighted(activeVars(state), valuesOf(state, pid));
}

export function lastContact(state, pid) {
  let last = '';
  for (const i of state.interactions) if (i.p === pid && i.date > last) last = i.date;
  return last || null;
}

export function groupByCategory(vars) {
  const m = new Map();
  for (const v of vars) {
    const k = v.category || 'Other';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  }
  return m;
}

export function report(state, person) {
  const vars = activeVars(state);
  const values = valuesOf(state, person.id);
  const today = todayISO();

  const categories = [...groupByCategory(vars)].map(([name, list]) => ({
    name,
    score: weighted(list, values),
    rated: list.filter((v) => values[v.id] != null).length,
    total: list.length
  }));

  const rated = vars.filter((v) => values[v.id] != null).map((v) => ({ v, val: values[v.id] }))
    .sort((a, b) => b.val - a.val);
  const strengths = rated.filter((r) => r.val >= 60).slice(0, 4);
  const weakest = rated.filter((r) => r.val < 50).sort((a, b) => a.val - b.val).slice(0, 4);
  const unrated = vars.filter((v) => values[v.id] == null);

  const byVar = new Map();
  for (const h of state.history) if (h.p === person.id) {
    if (!byVar.has(h.v)) byVar.set(h.v, []);
    byVar.get(h.v).push(h);
  }
  const trends = [];
  for (const [vid, hs] of byVar) {
    const v = vars.find((x) => x.id === vid);
    if (!v || hs.length < 2) continue;
    hs.sort((a, b) => a.at - b.at);
    const from = hs[0].val, to = hs[hs.length - 1].val;
    if (from !== to) trends.push({ v, from, to, delta: to - from });
  }
  trends.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const log = state.interactions.filter((i) => i.p === person.id).sort((a, b) => a.date.localeCompare(b.date));
  const lastDay = log.at(-1)?.date || person.metDate || null;
  const daysSince = lastDay ? daysBetween(lastDay, today) : null;
  const avgVibe = log.length ? Math.round(log.reduce((s, i) => s + i.vibe, 0) / log.length) : null;
  let vibeShift = null;
  if (log.length >= 4) {
    const avg = (a) => a.reduce((s, i) => s + i.vibe, 0) / a.length;
    vibeShift = Math.round(avg(log.slice(-3)) - avg(log.slice(0, -3)));
  }

  const cat = (name) => categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.score ?? null;
  const rapport = cat(CAT.RAPPORT), attraction = cat(CAT.ATTRACTION), compat = cat(CAT.COMPAT);
  const receptive = values[VID.RECEPTIVE], reciprocity = values[VID.RECIPROCITY];
  const availability = values[VID.AVAILABILITY], chemistry = values[VID.CHEMISTRY];

  const insights = [];
  if (vars.length && unrated.length > vars.length / 2) insights.push('Most variables are unrated, so treat this analysis as provisional.');
  if (attraction != null && rapport != null && attraction - rapport >= 20)
    insights.push(`Your attraction (${attraction}) is running ahead of the rapport (${rapport}). Build more conversation and shared experiences before escalating.`);
  if (attraction != null && rapport != null && rapport - attraction >= 20)
    insights.push(`Rapport (${rapport}) is well ahead of attraction (${attraction}). If you want more than friendship, add playful teasing, more eye contact, and one-on-one time; otherwise this is a solid friendship.`);
  if (receptive != null && reciprocity != null && receptive >= 60 && reciprocity < 40)
    insights.push('Warm in person but rarely invests. Step back and leave space for them to initiate once before you push further.');
  if (receptive != null && receptive < 35)
    insights.push('Receptiveness is low. Keep things light and low-pressure, and don\'t over-invest.');
  if (chemistry != null && chemistry >= 70 && (compat ?? 100) < 45)
    insights.push('Strong chemistry with weak compatibility: likely exciting short-term, harder long-term.');
  if (compat != null && compat >= 70 && (chemistry ?? 100) < 40)
    insights.push('A good long-term fit on paper, but little spark yet. Change the setting: a more active or novel plan often shifts chemistry.');
  if (availability != null && availability < 30)
    insights.push('Availability is low. Treat this as part of your social circle unless that changes.');
  if (daysSince != null && daysSince > 21)
    insights.push(`No logged contact in ${daysSince} days. Reconnect with something specific from your notes rather than a generic message.`);
  else if (daysSince != null && daysSince <= 2 && log.length >= 3)
    insights.push('You\'ve been in contact very recently and often. Make sure the pace is mutual.');
  if (vibeShift != null && vibeShift >= 10) insights.push(`Recent interactions are going noticeably better (+${vibeShift}).`);
  if (vibeShift != null && vibeShift <= -10) insights.push(`Recent interactions are cooling (${vibeShift}). Look at what changed.`);
  if (person.nextFollowUp) {
    const d = daysBetween(today, person.nextFollowUp);
    if (d < 0) insights.push(`Follow-up is overdue by ${-d} days.`);
    else if (d === 0) insights.push('Follow-up is due today.');
  }
  if (trends[0]) insights.push(`Biggest change: ${trends[0].v.name} went from ${trends[0].from} to ${trends[0].to}.`);

  const prompts = [];
  const lastNext = log.at(-1)?.next;
  if (lastNext) prompts.push(`From last time: ${lastNext}`);
  prompts.push(...splitItems(person.talkingPoints));
  for (const x of splitItems(person.interests).slice(0, 5)) prompts.push(`Ask how ${x} is going, or what got them into it.`);
  for (const x of splitItems(person.likes).slice(0, 3)) prompts.push(`Suggest something around ${x}.`);
  if (person.background) prompts.push(`Draw out more of their story: ${person.background.split('\n')[0].slice(0, 80)}`);

  return {
    overall: weighted(vars, values), categories, strengths, weakest, unrated,
    trends: trends.slice(0, 6), interactionCount: log.length, daysSince, avgVibe, vibeShift,
    insights, prompts: [...new Set(prompts)]
  };
}
