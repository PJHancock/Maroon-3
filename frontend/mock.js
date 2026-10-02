// mock.js — an in-browser fake of the backend, used with ?mock=1 and by tests.
// Shapes follow the API table in the build plan. If Jackson's real responses
// differ, update them here so the mock keeps matching the real thing.

export const SEED = {
  user: {
    name: "Alex", school: "BYU", major: "Computer Science",
    target_roles: ["Data Engineer"], xp: 340, streak: 4, last_active: "2026-10-01",
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
    { id: "t1", title: "Attend the Qualtrics info session", type: "in_person", xp: 75, status: "open" },
    { id: "t2", title: "Introduce yourself to a professor after class", type: "in_person", xp: 50, status: "open" },
  ],
  game_sessions: [
    { id: "g1", game: "coffee_chat", date: "2026-09-30", scores: { curiosity: 4, specificity: 2, rapport: 3 }, xp: 15 },
  ],
};

export const MOCK_GAMES = {
  elevator_pitch: { title: "Elevator Pitch", xp: 10, rubric: ["clarity", "memorability", "relevance"],
    goal: "Introduce yourself: who you are, something you've built, what you're looking for.",
    opening: "Hi there! I've got about 30 seconds before the next person. Tell me about yourself?" },
  coffee_chat: { title: "Coffee Chat", xp: 15, rubric: ["curiosity", "specificity", "rapport"],
    goal: "Learn about their work and leave with a natural reason to follow up.",
    opening: "Hey, good to meet you! I grabbed us a table. So what made you want to chat?" },
  follow_up: { title: "Follow-Up", xp: 10, rubric: ["specificity", "value_to_them", "low_pressure"],
    goal: "Write a follow-up message that gives them a genuine reason to reply.",
    opening: "(You met this data engineer at an info session 10 days ago. Write your follow-up.)" },
  cold_call: { title: "Cold Outreach", xp: 20, rubric: ["hook", "respect_for_time", "clear_ask"],
    goal: "Earn a reply and a small, specific next step without wasting their time.",
    opening: "This is Dana. Who's this?" },
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

// The plan's streak rule.
export function applyXp(user, xp, todayStr = today()) {
  const yesterday = new Date(todayStr + "T00:00:00Z");
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  if (user.last_active === yStr) user.streak += 1;
  else if (user.last_active !== todayStr) user.streak = 1;
  user.last_active = todayStr;
  user.xp += xp;
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

function route(method, path, body) {
  const p = path.split("?")[0];
  let m;

  if (method === "GET" && p === "/api/state") {
    return {
      user: db.user, contacts: db.contacts,
      tasks: db.tasks.filter((t) => t.status === "open"),
      game_sessions: db.game_sessions.slice(-5),
    };
  }
  if (method === "POST" && p === "/api/reset") {
    resetMock();
    return { ok: true };
  }
  if (method === "POST" && p === "/api/coach/reminders") return reminders();
  if (method === "POST" && p === "/api/coach/draft") {
    const c = db.contacts.find((x) => x.id === body?.contact_id);
    const name = c?.name ?? "there";
    return {
      message: `Hi ${name}! I've been thinking about what you said about ${c?.notes?.[0]?.toLowerCase() ?? "your work"}. ` +
        `I'd love to hear how it turned out. Would you be up for a quick coffee sometime next week?`,
    };
  }
  if (method === "POST" && p === "/api/contacts") {
    const contact = {
      id: `c${db.contacts.length + 1}`, name: body?.name ?? "", how_met: body?.how_met ?? "",
      company: body?.company ?? "", role: body?.role ?? "",
      phone: body?.phone ?? "", email: body?.email ?? "",
      notes: Array.isArray(body?.notes) ? body.notes : [], last_contact: body?.last_contact || today(),
    };
    db.contacts.push(contact);
    return contact;
  }
  if (method === "POST" && (m = p.match(/^\/api\/tasks\/([^/]+)\/complete$/))) {
    const task = db.tasks.find((t) => t.id === m[1]);
    if (!task) throw Object.assign(new Error("Task not found"), { status: 404 });
    task.status = "done";
    let contact = db.contacts.find((c) => c.name.toLowerCase() === String(body?.met_name ?? "").toLowerCase());
    if (contact) {
      if (body?.hook) contact.notes.push(body.hook);
      contact.last_contact = today();
    } else {
      contact = {
        id: `c${db.contacts.length + 1}`, name: body?.met_name ?? "", how_met: task.title,
        company: body?.company ?? "", role: body?.role ?? "",
        notes: body?.hook ? [body.hook] : [], last_contact: today(),
      };
      db.contacts.push(contact);
    }
    applyXp(db.user, task.xp);
    return { contact, xp: task.xp };
  }
  if (method === "POST" && (m = p.match(/^\/api\/games\/([^/]+)\/(start|turn|score)$/))) {
    const game = MOCK_GAMES[m[1]];
    if (!game) throw Object.assign(new Error("Unknown game"), { status: 404 });
    if (m[2] === "start") return { opening: game.opening, goal: game.goal, title: game.title };
    if (m[2] === "turn") return { reply: "That's interesting. Tell me a bit more about that?" };
    const scores = Object.fromEntries(game.rubric.map((d, i) => [d, 3 + (i % 2)]));
    db.game_sessions.push({ id: `g${db.game_sessions.length + 1}`, game: m[1], date: today(), scores, xp: game.xp });
    applyXp(db.user, game.xp);
    return {
      scores, xp: game.xp,
      best_moment: "You asked what a normal week looks like, which got them talking.",
      one_fix: "Reference something specific they said before asking your next question.",
      rewrite_example: "You mentioned the dbt migration. What's been the hardest part of it?",
    };
  }
  throw Object.assign(new Error(`Mock has no route for ${method} ${p}`), { status: 404 });
}

export async function mockApi(method, path, body) {
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  // Return copies so callers can't mutate the mock db by accident.
  return structuredClone(route(method, path, body));
}
