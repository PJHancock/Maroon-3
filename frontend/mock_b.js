// mock_b.js — an in-browser fake of the backend, used with ?mock=1 and by tests.
// Shapes follow the API table in the build plan. If Jackson's real responses
// differ, update them here so the mock keeps matching the real thing.

export const SEED = {
  user: {
    name: "Alex", school: "BYU", major: "Computer Science",
    target_roles: ["Data Engineer"], xp: 340, streak: 4, last_active: "2026-10-01", location: "Provo, UT",
    onboarding_goal: "general",
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
  proposed_tasks: [],
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

const MOCK_OPPORTUNITIES = [
  {
    id: "mock-event", kind: "event", title: "A nearby data engineering meetup",
    summary: "A current event returned by the research provider.",
    why_it_fits: "Matches your target role and location.", source_name: "Research provider",
    source_url: "https://example.com/event", action_url: "https://example.com/event",
    starts_at: "2026-10-17T09:00:00-06:00", ends_at: "2026-10-17T17:00:00-06:00",
    location: "Near you", tags: ["data engineering"], on_radar: false,
  },
  {
    id: "mock-person", kind: "person", title: "Data engineers in your area",
    summary: "A public professional search path.",
    why_it_fits: "Creates a low-pressure way to find one person to learn from.", source_name: "Research provider",
    source_url: "https://example.com/people", action_url: "https://example.com/people",
    starts_at: null, ends_at: null, location: "Provo, UT", tags: ["data engineering"], on_radar: false,
  },
];

const MOCK_GUIDANCE = {
  in_person: {
    objective: "Have one genuine conversation and leave with one specific detail to remember.",
    steps: ["Choose a place where your target community gathers.", "Introduce yourself with a clear reason for being there.", "Ask one open question and listen for a detail.", "Name a low-pressure next step before leaving."],
    questions: ["What kind of work has your attention lately?", "How did you get into this field?", "What would you recommend I try next?"],
    script: "", external_hint: "Find a current campus, meetup, or professional event nearby.",
  },
  event: {
    objective: "Attend a relevant event and have one conversation with someone whose work interests you.",
    steps: ["Pick an event that fits your role interests and schedule.", "Prepare one specific question.", "Arrive early enough to introduce yourself.", "Write down one detail before you leave."],
    questions: ["What brought you to this event?", "What problem is your team working on?", "What skill helps someone contribute quickly?"],
    script: "", external_hint: "Find a current campus, meetup, or professional event within the next 90 days.",
  },
  personal_chat: {
    objective: "Set up a short conversation that creates a natural next step.",
    steps: ["Choose someone connected to your current goal.", "Invite them to a specific 15-minute window.", "Bring two questions and follow their answers.", "End by naming what you learned."],
    questions: ["What does a normal week look like?", "What helped you get started?", "What small project would you recommend?"],
    script: "Would you be open to a 15-minute chat next week? I’d love to ask about your path into this work.", external_hint: "Use a contact you already know or search a relevant community.",
  },
  call: {
    objective: "Make a real call with a clear reason for reconnecting and a small next step.",
    steps: ["Choose a contact with a genuine reason to call.", "Ask whether they have a minute.", "Ask one focused question.", "If they miss it, leave the reason and an easy reply path."],
    questions: ["What has changed since we last talked?", "Could I ask one quick question about your experience?"],
    script: "Hi, it’s [your name]. I was thinking about what you shared about [specific detail]. I had one quick question and would love to reconnect when you have a minute.", external_hint: "Choose a contact with a phone number to make this one tap away.",
  },
  online_outreach: {
    objective: "Send one specific, low-pressure message to someone whose work you want to understand.",
    steps: ["Choose someone connected to your target role.", "Read enough to reference one project or idea.", "Ask one focused question.", "Make the next step optional and easy to decline."],
    questions: ["What part of your work has been most interesting recently?", "What would you suggest a student build?"],
    script: "Hi! I’m a student exploring [role]. Your work on [specific project] caught my attention. Could I ask one quick question about how you got started?", external_hint: "Use personalized people results or search LinkedIn for a role and location.",
  },
  follow_up: {
    objective: "Reconnect using something the person actually shared instead of a generic check-in.",
    steps: ["Choose the person and reread your notes.", "Lead with the specific detail you remember.", "Share a small update, question, or resource.", "End with a low-pressure next step."],
    questions: ["How did the project or deadline turn out?", "Would it be useful if I sent the small project I mentioned?"],
    script: "Hi! I was thinking about what you shared about [specific detail]. I wanted to ask how it turned out and share a quick update.", external_hint: "Use the person’s saved notes to make the reason for reconnecting specific.",
  },
};

export function resetMock() {
  db = structuredClone(SEED);
  for (const item of MOCK_OPPORTUNITIES) item.on_radar = false;
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
      proposed_tasks: db.proposed_tasks ?? [],
      game_sessions: db.game_sessions.slice(-5),
      radar_ids: db.radar_ids ?? [],
    };
  }
  if (method === "GET" && (m = p.match(/^\/api\/tasks\/([^/]+)\/prep$/))) {
    const task = db.tasks.find((item) => item.id === m[1]);
    if (!task) throw Object.assign(new Error("Task not found"), { status: 404 });
    return { task, guidance: MOCK_GUIDANCE[task.type] ?? MOCK_GUIDANCE.in_person, contacts: db.contacts, source: "demo" };
  }
  if (method === "POST" && (m = p.match(/^\/api\/tasks\/([^/]+)\/context$/))) {
    const task = db.tasks.find((item) => item.id === m[1]);
    if (!task) throw Object.assign(new Error("Task not found"), { status: 404 });
    task.prep_context = structuredClone(body);
    return structuredClone(task.prep_context);
  }
  if (method === "DELETE" && (m = p.match(/^\/api\/tasks\/([^/]+)\/context$/))) {
    const task = db.tasks.find((item) => item.id === m[1]);
    if (!task) throw Object.assign(new Error("Task not found"), { status: 404 });
    task.prep_context = null;
    return structuredClone(task);
  }
  if (method === "POST" && p === "/api/reset") {
    resetMock();
    return { ok: true };
  }
  if (method === "POST" && p === "/api/coach/reminders") return reminders();
  if (method === "POST" && p === "/api/coach/suggest") {
    const c = db.contacts.find((x) => x.id === body?.contact_id);
    const name = c?.name ?? "them";
    return {
      suggestions: [
        `Ask ${name} about ${c?.notes?.[0]?.toLowerCase() ?? "their work"}`,
        "Ask what they're working on this week",
        `Ask how their experience connects to ${db.user.target_roles?.[0] ?? "your field"}`,
      ],
      contact_id: body?.contact_id,
      source: "demo",
    };
  }
  if (method === "POST" && p === "/api/coach/propose-tasks") {
    db.proposed_tasks = [
      { id: `pt${Date.now()}_1`, title: "Reach out to one new person this week", type: "online_outreach", xp: 35, status: "open", frequency: "weekly", skill: "outreach" },
      { id: `pt${Date.now()}_2`, title: "Attend a networking event", type: "event", xp: 80, status: "open", skill: "events" },
      { id: `pt${Date.now()}_3`, title: "Schedule an informational interview", type: "personal_chat", xp: 60, status: "open", skill: "informational interview" },
    ];
    return { proposed_tasks: db.proposed_tasks, source: "demo" };
  }
  if (method === "POST" && p === "/api/onboarding") {
    db.user.onboarding_goal = body?.goal || "general";
    const role = body?.target_role || db.user.target_roles?.[0] || "your target role";
    const company = body?.target_company || "a company";
    const templates = body?.goal === "company" ? [
      { title: `Research ${company}`, type: "online_outreach", xp: 30, skill: "research" },
      { title: `Find someone at ${company}`, type: "online_outreach", xp: 35, skill: "outreach" },
    ] : body?.goal === "job" ? [
      { title: `Research the ${role} role`, type: "online_outreach", xp: 30, skill: "research" },
      { title: "Schedule an informational interview", type: "personal_chat", xp: 60, skill: "informational interview" },
    ] : [
      { title: "Introduce yourself to someone new", type: "in_person", xp: 50, skill: "introductions" },
      { title: "Contact someone new every week", type: "online_outreach", xp: 35, frequency: "weekly", skill: "outreach" },
    ];
    db.tasks.push(...templates.map((task, i) => ({ id: `t${db.tasks.length + i + 1}`, status: "open", ...task })));
    return { user: db.user, contacts: db.contacts, tasks: db.tasks.filter((t) => t.status === "open"), proposed_tasks: db.proposed_tasks ?? [], game_sessions: db.game_sessions.slice(-5) };
  }
  if (method === "POST" && p === "/api/coach/draft") {
    const c = db.contacts.find((x) => x.id === body?.contact_id);
    const name = c?.name ?? "there";
    return {
      message: `Hi ${name}! I've been thinking about what you said about ${c?.notes?.[0]?.toLowerCase() ?? "your work"}. ` +
        `I'd love to hear how it turned out. Would you be up for a quick coffee sometime next week?`,
    };
  }
  if (method === "POST" && (m = p.match(/^\/api\/tasks\/([^/]+)\/accept$/))) {
    const idx = (db.proposed_tasks ?? []).findIndex((t) => t.id === m[1]);
    if (idx < 0) throw Object.assign(new Error("Proposed task not found"), { status: 404 });
    const task = db.proposed_tasks.splice(idx, 1)[0];
    task.frequency = body?.frequency || "once";
    db.tasks.push(task);
    return task;
  }
  if (method === "POST" && (m = p.match(/^\/api\/tasks\/([^/]+)\/reject$/))) {
    if (!(db.proposed_tasks ?? []).some((task) => task.id === m[1])) {
      throw Object.assign(new Error("Proposed task not found"), { status: 404 });
    }
    db.proposed_tasks = db.proposed_tasks.filter((task) => task.id !== m[1]);
    return { ok: true };
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
  if (method === "PUT" && (m = p.match(/^\/api\/contacts\/([^/]+)$/))) {
    const contact = db.contacts.find((c) => c.id === m[1]);
    if (!contact) throw Object.assign(new Error("Contact not found"), { status: 404 });
    Object.assign(contact, body ?? {});
    if (Array.isArray(body?.notes)) contact.notes = body.notes;
    return contact;
  }
  if (method === "DELETE" && (m = p.match(/^\/api\/contacts\/([^/]+)$/))) {
    const index = db.contacts.findIndex((c) => c.id === m[1]);
    if (index < 0) throw Object.assign(new Error("Contact not found"), { status: 404 });
    db.contacts.splice(index, 1);
    return { deleted: m[1] };
  }
  if (method === "GET" && p === "/api/opportunities") {
    return {
      profile_summary: "Research suggestions for this student's target role and location.",
      opportunities: structuredClone(MOCK_OPPORTUNITIES),
      searched_at: today(), window_ends: "2026-12-31", source: "demo",
    };
  }
  if (method === "GET" && p === "/api/radar") {
    const saved = new Set(db.radar_ids ?? []);
    const items = MOCK_OPPORTUNITIES.filter((x) => saved.has(x.id))
      .map(({ on_radar, ...item }) => ({ ...structuredClone(item), saved_at: today() }))
      .sort((a, b) => (a.kind !== "event") - (b.kind !== "event") || String(a.starts_at ?? "9999").localeCompare(String(b.starts_at ?? "9999")));
    return { items, today: today(), unavailable: 0 };
  }
  if (method === "POST" && (m = p.match(/^\/api\/opportunities\/([^/]+)\/radar$/))) {
    const item = MOCK_OPPORTUNITIES.find((x) => x.id === m[1]);
    if (!item) throw Object.assign(new Error("Research opportunity not found"), { status: 404 });
    item.on_radar = true;
    db.radar_ids = [...new Set([...(db.radar_ids ?? []), m[1]])];
    return { opportunity_id: m[1], saved: true, radar_ids: db.radar_ids };
  }
  if (method === "DELETE" && (m = p.match(/^\/api\/opportunities\/([^/]+)\/radar$/))) {
    const item = MOCK_OPPORTUNITIES.find((x) => x.id === m[1]);
    if (!item) throw Object.assign(new Error("Research opportunity not found"), { status: 404 });
    item.on_radar = false;
    db.radar_ids = (db.radar_ids ?? []).filter((id) => id !== m[1]);
    return { opportunity_id: m[1], saved: false, radar_ids: db.radar_ids };
  }
  if (method === "POST" && (m = p.match(/^\/api\/tasks\/([^/]+)\/complete$/))) {
    const task = db.tasks.find((t) => t.id === m[1]);
    if (!task) throw Object.assign(new Error("Task not found"), { status: 404 });
    task.status = "done";
    let contact = body?.contact_id
      ? db.contacts.find((c) => c.id === body.contact_id)
      : db.contacts.find((c) => c.name.toLowerCase() === String(body?.met_name ?? "").toLowerCase());
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
