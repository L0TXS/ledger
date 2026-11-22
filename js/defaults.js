export const STATUSES = ['Acquaintance', 'Friend', 'Interested', 'Talking', 'Dating', 'Faded', 'Not pursuing'];
export const KINDS = ['In person', 'Text', 'Call', 'Social media', 'Group'];
export const CAT = { RAPPORT: 'Rapport', COMPAT: 'Compatibility', ATTRACTION: 'Attraction', PRACTICAL: 'Practical' };

// Stable ids let the analysis rules keep working if you rename a variable.
export const VID = {
  RECEPTIVE: 'd-receptiveness',
  RECIPROCITY: 'd-reciprocity',
  AVAILABILITY: 'd-availability',
  CHEMISTRY: 'd-chemistry'
};

// [category, id, name, what it measures, low (0-33), mid (34-66), high (67-100), weight]
const D = [
  [CAT.RAPPORT, 'conversation', 'Conversation flow', 'How easily talk moves between you.',
    'Stilted; you carry it', 'Pleasant, but you lead most of it', 'Effortless; time disappears', 1],
  [CAT.RAPPORT, 'humour', 'Shared humour', 'Whether you make each other laugh and riff off each other.',
    'Jokes miss', 'Polite laughs', 'Running jokes; they riff back', 1],
  [CAT.RAPPORT, 'receptiveness', 'Receptiveness', 'How warm and engaged they are with you specifically, compared with how they treat others.',
    'Closed body language, short answers', 'Friendly, as with anyone', 'Lights up, leans in, seeks you out', 2],
  [CAT.RAPPORT, 'reciprocity', 'Reciprocity', 'How much they invest back: asking questions, initiating, making plans.',
    'Never asks, never initiates', 'Responds well but rarely starts', 'Initiates, asks about you, suggests plans', 2],
  [CAT.RAPPORT, 'trust', 'Trust and openness', 'How much personal ground they share with you.',
    'Surface topics only', 'Opinions and some history', 'Confides in you', 1],

  [CAT.COMPAT, 'values', 'Values alignment', 'Overlap on the things that matter most to you.',
    'Clashing on fundamentals', 'Mixed or unknown', 'Strongly aligned', 2],
  [CAT.COMPAT, 'lifestyle', 'Lifestyle fit', 'Activity level, routines, outdoors versus nightlife, early mornings versus late nights.',
    'Opposite rhythms', 'Workable', 'Naturally in sync', 1],
  [CAT.COMPAT, 'interests', 'Mutual interests', 'Activities and topics you genuinely share.',
    'Nothing in common', 'A couple of overlaps', 'Lots to do together', 1],
  [CAT.COMPAT, 'ambition', 'Ambition and drive', 'Goals, work ethic, and direction in life.',
    'Drifting', 'Steady', 'Driven and focused', 1],
  [CAT.COMPAT, 'intellect', 'Intellect and curiosity', 'Depth of conversation; interest in ideas and learning.',
    'Little depth', 'Holds their own', 'Challenges and teaches you', 1],
  [CAT.COMPAT, 'maturity', 'Emotional maturity', 'Consistency, self-awareness, and how they handle friction.',
    'Volatile or flaky', 'Ordinary', 'Grounded and consistent', 1],

  [CAT.ATTRACTION, 'physical', 'Physical attraction', 'Your own attraction to their looks.',
    'None', 'Attractive', 'Strongly drawn to them', 1],
  [CAT.ATTRACTION, 'style', 'Style and presentation', 'Dress, grooming, and how they carry themselves.',
    'Doesn\'t appeal', 'Fine', 'Exactly your taste', 1],
  [CAT.ATTRACTION, 'presence', 'Presence', 'Charisma and energy; how they affect a room.',
    'Flat', 'Pleasant', 'Magnetic', 1],
  [CAT.ATTRACTION, 'chemistry', 'Chemistry', 'The felt spark between you: eye contact, tension, and playful banter.',
    'None', 'Some sparks', 'Unmistakable', 2],

  [CAT.PRACTICAL, 'availability', 'Availability', 'Relationship status and bandwidth.',
    'Taken or unavailable', 'Unclear', 'Single and open', 1],
  [CAT.PRACTICAL, 'logistics', 'Logistics', 'Proximity, schedules, and how easy it is to see each other.',
    'Hard to arrange', 'Possible with effort', 'Easy and frequent', 1],
  [CAT.PRACTICAL, 'overlap', 'Social overlap', 'Shared friends and circles. More overlap means more chances to meet, and more at stake.',
    'None', 'A few mutuals', 'Same circle', 1]
];

export function defaultVariables() {
  return D.map(([category, id, name, description, low, mid, high, weight], i) => ({
    id: 'd-' + id, category, name, description, low, mid, high, weight, order: i, active: true
  }));
}

export function emptyState() {
  return {
    version: 1,
    persons: [],
    variables: defaultVariables(),
    ratings: {},        // { personId: { variableId: { v, at } } }
    history: [],        // [{ p, v, val, at }]
    interactions: [],   // [{ id, p, date, kind, place, summary, vibe, next }]
    settings: { lockTimeout: 0, theme: 'system', backupPassword: null, lastBackup: 0 }
  };
}

/** Fills in anything missing from older or partial data. */
export function normalize(s) {
  const base = emptyState();
  const out = { ...base, ...s, settings: { ...base.settings, ...(s?.settings || {}) } };
  for (const k of ['persons', 'variables', 'history', 'interactions']) if (!Array.isArray(out[k])) out[k] = [];
  if (!out.ratings || typeof out.ratings !== 'object') out.ratings = {};
  return out;
}

export function newPerson() {
  const now = Date.now();
  return {
    id: crypto.randomUUID(), name: '', nickname: '', status: 'Acquaintance',
    metWhere: '', metDate: '', context: '', contact: '', age: '', occupation: '',
    appearance: '', features: '', personality: '', interests: '', background: '',
    likes: '', dislikes: '', talkingPoints: '', notes: '', nextFollowUp: '',
    archived: false, hasPhoto: false, createdAt: now, updatedAt: now
  };
}
