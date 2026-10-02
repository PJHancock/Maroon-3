// mock.js — an in-browser fake of the backend, used with ?mock=1 and by tests.
// Mirrors backend/main.py and backend/seed.json (DEMO_MODE responses). If the
// real backend changes, update this so the mock keeps matching the real thing.

export const SEED = {
  user: {
    name: "Alex", school: "BYU", major: "Computer Science", target_roles: ["Data Engineer"],
    xp: 340, streak: 4, last_active: "2026-10-01", today_connection_done: false,
  },
  contacts: [
    {
      id: "c1", name: "Sarah", how_met: "Mom's friend", company: "BYU", role: "Research scientist",
      notes: ["Grant deadline mid-October", "Lab website is outdated"], last_contact: "2026-09-10",
    },
    {
      id: "c2", name: "Priya", how_met: "TA for CS 452", company: "BYU", role: "Graduate TA",
      notes: ["Interned at Domo on the data platform team", "Recommended learning Airflow"],
      last_contact: "2026-09-22",
    },
    {
      id: "c3", name: "Jordan", how_met: "Career fair", company: "Pluralsight", role: "Analytics engineer",
      notes: ["Hiring summer interns in January", "Likes hiking in American Fork Canyon"],
      last_contact: "2026-09-18",
    },
  ],
  tasks: [
    { id: "t1", title: "Attend the Qualtrics info session", description: "Go to one event and leave with one specific detail about someone's work.", type: "in_person", difficulty: "medium", location: "Real-world connection", xp: 75, status: "open" },
    { id: "t2", title: "Set up a 15-minute personal chat", description: "Invite a mentor, classmate, professor, or former coworker to a short conversation.", type: "personal_chat", difficulty: "medium", location: "Coffee, walk, or video chat", xp: 60, status: "open" },
    { id: "t3", title: "Reach out to one new person online", description: "Find someone whose work interests you and send a specific, low-pressure question.", type: "online_outreach", difficulty: "easy", location: "LinkedIn or community forum", xp: 30, status: "open" },
    { id: "t4", title: "Call someone you have been meaning to contact", description: "Make a real phone call and leave a clear reason for reconnecting if they miss it.", type: "call", difficulty: "medium", location: "Phone call", xp: 45, status: "open" },
    { id: "t5", title: "Attend a nearby data or tech event", description: "Find a relevant meetup, campus event, or hack night and talk to one person there.", type: "event", difficulty: "hard", location: "Nearby event · AI search later", event_search: true, xp: 100, status: "open" },
    { id: "t6", title: "Follow up on a recent conversation", description: "Send one person a message grounded in something they actually told you.", type: "follow_up", difficulty: "easy", location: "Message or email", xp: 40, status: "open" },
  ],
  game_sessions: [
    { id: "g1", game: "coffee_chat", date: "2026-09-30", scores: { curiosity: 4, specificity: 2, rapport: 3 }, xp: 15 },
  ],
};

// Mirrors backend/games.py.
export const MOCK_GAMES = {
  elevator_pitch: { title: "Elevator Pitch", max_turns: 1, xp: 10, rubric: ["clarity", "memorability", "relevance"],
    goal: "Introduce yourself: who you are, something you've built, and what you are looking for.",
    opening_line: "Hi, I have about 30 seconds before the next student arrives. What are you working on?" },
  coffee_chat: { title: "Coffee Chat", max_turns: 4, xp: 15, rubric: ["curiosity", "specificity", "rapport"],
    goal: "Learn about their work and leave with a natural reason to follow up.",
    opening_line: "Thanks for making time. I work on data platforms and enjoy meeting students who are curious about the work." },
  follow_up: { title: "Follow-Up", max_turns: 1, xp: 10, rubric: ["specificity", "value_to_them", "low_pressure"],
    goal: "Write a follow-up message that gives them a genuine reason to reply.",
    opening_line: "Hey, good to hear from you. I remember we talked about your team moving to dbt." },
  cold_call: { title: "Cold Outreach", max_turns: 3, xp: 20, rubric: ["hook", "respect_for_time", "clear_ask"],
    goal: "Earn a reply and a small, specific next step without wasting their time.",
    opening_line: "I have a minute before my next meeting. What made you reach out?" },
};

let db = structuredClone(SEED);
let delayMs = 400;

export function resetMock() {
  db = structuredClone(SEED);
}

// Tests set this to 0; the browser keeps a little latency so loading states show.
export function setMockDelay(ms) {
  delayMs = ms;
}

export function getMockDb() {
  return db;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// backend award_connection_xp: real-world tasks add XP and move the streak
// (yesterday +1, today unchanged, otherwise reset to 1). Games add XP only.
export function awardConnectionXp(user, xp, todayStr = today()) {
  const yesterday = new Date(todayStr + "T00:00:00Z");
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  user.xp += xp;
  user.today_connection_done = true;
  if (user.last_active === todayStr) return;
  user.streak = user.last_active === yStr ? user.streak + 1 : 1;
  user.last_active = todayStr;
}

function reminders() {
  const out = [{
    contact_id: "c1", headline: "Sarah's grant deadline just passed",
    reason: "Sarah was racing a mid-October grant deadline. Now's a good moment to ask how it went.",
    suggested_action: "Congratulate her and offer to help refresh the lab website.",
  }];
  const marcus = db.contacts.find((c) => c.name === "Marcus");
  if (marcus) {
    out.unshift({
      contact_id: marcus.id, headline: "Show Marcus a small dbt project",
      reason: "Marcus said his team is moving to dbt. A tiny dbt model on a public dataset gives you a real reason to follow up.",
      suggested_action: "Build a 2-model dbt project this weekend and send it to him next week.",
      tip: "Your coffee chats score low on specificity. Mention one concrete detail from your conversation.",
    });
  }
  return { reminders: out.slice(0, 3) };
}

function newContactId() {
  return `c${db.contacts.length + 1}`;
}

function route(method, path, body) {
  const p = path.split("?")[0];
  let m;

  if (method === "GET" && p === "/api/state") {
    return { ...db, open_tasks: db.tasks.filter((t) => t.status === "open") };
  }
  if (method === "POST" && p === "/api/reset") {
    resetMock();
    return db;
  }
  if (method === "POST" && p === "/api/coach/reminders") return reminders();
  if (method === "POST" && p === "/api/coach/draft") {
    const c = db.contacts.find((x) => x.id === body?.contact_id);
    if (!c) throw httpError(404, "Contact not found");
    const note = c.notes?.[0] ?? "what you're working on";
    return {
      message: `Hi ${c.name}! I've been thinking about what you mentioned about ${note.charAt(0).toLowerCase() + note.slice(1)}. ` +
        "I'd love to hear how it's going. Would you be open to a quick coffee sometime next week?",
    };
  }
  if (method === "POST" && p === "/api/contacts") {
    if (!String(body?.name ?? "").trim()) throw httpError(422, "name is required");
    if (body?.last_contact && body.last_contact > today()) throw httpError(422, "last_contact can't be in the future");
    const contact = {
      id: newContactId(), name: body.name, how_met: body?.how_met ?? "",
      company: body?.company ?? "", role: body?.role ?? "",
      phone: body?.phone ?? "", email: body?.email ?? "",
      notes: Array.isArray(body?.notes) ? body.notes : [], last_contact: body?.last_contact || today(),
    };
    db.contacts.unshift(contact);
    return contact;
  }
  if (method === "POST" && (m = p.match(/^\/api\/tasks\/([^/]+)\/complete$/))) {
    const task = db.tasks.find((t) => t.id === decodeURIComponent(m[1]));
    if (!task) throw httpError(404, "Task not found");
    if (task.status === "complete") throw httpError(409, "Task already completed");
    if (!String(body?.met_name ?? "").trim() || !String(body?.hook ?? "").trim()) throw httpError(422, "met_name and hook are required");
    const contact = {
      id: newContactId(), name: body.met_name, how_met: task.title,
      company: body?.company ?? "", role: body?.role ?? "", notes: [body.hook], last_contact: today(),
    };
    db.contacts.unshift(contact);
    task.status = "complete";
    awardConnectionXp(db.user, task.xp);
    return { contact, xp_earned: task.xp, streak: db.user.streak };
  }
  if (method === "POST" && (m = p.match(/^\/api\/games\/([^/]+)\/(start|turn|score)$/))) {
    const game = MOCK_GAMES[decodeURIComponent(m[1])];
    if (!game) throw httpError(404, "Unknown game");
    if (m[2] === "start") return { title: game.title, goal: game.goal, opening_line: game.opening_line, max_turns: game.max_turns };
    if (m[2] === "turn") return { reply: "That's interesting. What part of that would you want to learn more about?" };
    const scores = Object.fromEntries(game.rubric.map((d, i) => [d, 3 + (i % 2)]));
    db.game_sessions.unshift({ id: `g${db.game_sessions.length + 1}`, game: m[1], date: today(), scores, xp: game.xp });
    db.user.xp += game.xp;
    return {
      scores, xp: game.xp,
      best_moment: "You asked what a normal week looks like, which got them talking.",
      one_fix: "Reference something specific they said before asking your next question.",
      rewrite_example: "You mentioned the dbt migration. What's been the hardest part of it?",
      recommended_follow_up: "Ask Sarah how her grant work connects to the Data Engineer roles you are exploring.",
    };
  }
  throw httpError(404, `Mock has no route for ${method} ${p}`);
}

export async function mockApi(method, path, body) {
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  // Return copies so callers can't mutate the mock db by accident.
  return structuredClone(route(method, path, body));
}
