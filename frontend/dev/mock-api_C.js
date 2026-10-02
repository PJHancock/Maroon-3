(function (root) {
  "use strict";

  const Buddy = (root.NetworkingBuddy = root.NetworkingBuddy || {});
  const initialState = {
    user: { name: "Alex", school: "BYU", major: "Computer Science", target_roles: ["Data Engineer"], xp: 340, streak: 4, last_active: "2026-10-01", today_connection_done: false },
    contacts: [{ id: "c1", name: "Sarah", how_met: "Mom's friend", company: "BYU", role: "Research scientist", notes: ["Grant deadline mid-October", "Lab website is outdated"], last_contact: "2026-09-10" }],
    tasks: [
      { id: "t1", title: "Attend the Qualtrics info session", description: "Go to one event and leave with one specific detail about someone’s work.", type: "in_person", difficulty: "medium", location: "Real-world connection", xp: 75, status: "open" },
      { id: "t2", title: "Set up a 15-minute personal chat", description: "Invite a mentor, classmate, professor, or former coworker to a short conversation.", type: "personal_chat", difficulty: "medium", location: "Coffee, walk, or video chat", xp: 60, status: "open" },
      { id: "t3", title: "Reach out to one new person online", description: "Find someone whose work interests you and send a specific, low-pressure question.", type: "online_outreach", difficulty: "easy", location: "LinkedIn or community forum", xp: 30, status: "open" },
      { id: "t4", title: "Call someone you have been meaning to contact", description: "Make a real phone call and leave a clear reason for reconnecting if they miss it.", type: "call", difficulty: "medium", location: "Phone call", xp: 45, status: "open" },
      { id: "t5", title: "Attend a nearby data or tech event", description: "Find a relevant meetup, campus event, or hack night and talk to one person there.", type: "event", difficulty: "hard", location: "Nearby event · AI search later", xp: 100, status: "open", event_search: true },
      { id: "t6", title: "Follow up on a recent conversation", description: "Send one person a message grounded in something they actually told you.", type: "follow_up", difficulty: "easy", location: "Message or email", xp: 40, status: "open" },
    ],
    game_sessions: [{ id: "g1", game: "coffee_chat", date: "2026-09-30", scores: { curiosity: 4, specificity: 2, rapport: 3 }, xp: 15 }],
  };

  const openingLines = {
    elevator_pitch: "Hi, I have about 30 seconds before the next student arrives. What are you working on?",
    coffee_chat: "Thanks for making time. I work on data platforms and enjoy meeting students who are curious about the work.",
    follow_up: "Hey, good to hear from you. I remember we talked about your team moving to dbt.",
    cold_call: "I have a minute before my next meeting. What made you reach out?",
  };

  const replies = {
    coffee_chat: ["That is a useful starting point. What part of data engineering are you most curious about?", "Our team recently moved more transformation work into dbt. What have you tried so far?", "That project sounds promising. What would you want to understand before building something similar?"],
    cold_call: ["That is specific enough to catch my attention. What are you hoping to learn from our team?", "I can share one resource. What would be the most useful next step for you?"],
  };

  const scoreResults = {
    elevator_pitch: { scores: { clarity: 4, memorability: 3, relevance: 4 }, best_moment: "You connected your interest to a real project.", one_fix: "Lead with the kind of problem you want to solve.", rewrite_example: "I build small data tools and I am looking for a team where I can make messy information useful.", xp: 10 },
    coffee_chat: { scores: { curiosity: 4, specificity: 2, rapport: 3 }, best_moment: "You asked about how dbt changed the team's workflow.", one_fix: "Ask one more specific follow-up instead of switching topics.", rewrite_example: "What changed for your team after adopting dbt?", xp: 15 },
    follow_up: { scores: { specificity: 4, value_to_them: 3, low_pressure: 5 }, best_moment: "You referenced the exact detail they shared.", one_fix: "Offer a small update before asking your question.", rewrite_example: "I tried the dbt tutorial you mentioned and noticed one modeling pattern I want to understand better.", xp: 10 },
    cold_call: { scores: { hook: 4, respect_for_time: 5, clear_ask: 3 }, best_moment: "You made the ask small and easy to answer.", one_fix: "Make the requested next step more concrete.", rewrite_example: "Would you be open to one 10-minute question about how your team hires junior engineers?", xp: 20 },
  };

  let state = structuredClone(initialState);
  const controls = { errorMode: false, latency: 80 };

  function decodeBody(options) {
    if (!options || options.body === undefined) return {};
    if (typeof options.body === "string") return JSON.parse(options.body);
    return options.body;
  }

  function clone(value) { return structuredClone(value); }
  function wait() { return new Promise((resolve) => setTimeout(resolve, controls.latency)); }
  function errorIfEnabled() { if (controls.errorMode) throw new Error("Mock API error: simulate retry behavior."); }

  function personalizedMockReply(game, context, replyIndex) {
    const user = context?.user || {};
    const role = user.target_roles?.[0] || "the kind of work you want next";
    const contact = context?.contacts?.[0];
    if (game === "coffee_chat" && replyIndex === 0) {
      return `Since you are exploring ${role}, what part of this work would you most like to understand from someone doing it?`;
    }
    if (game === "coffee_chat" && replyIndex === 1 && contact?.notes?.[0]) {
      return `You have been keeping track of ${contact.name}'s work. What question could connect what they mentioned to this team's day-to-day?`;
    }
    return (replies[game] || ["That is interesting. Tell me a little more."])[replyIndex] || "That gives me a helpful picture. What would you try next?";
  }

  function awardXp(amount, countsForConnection) {
    const today = "2026-10-02";
    const yesterday = "2026-10-01";
    state.user.xp += Number(amount || 0);
    if (!countsForConnection) return;
    if (state.user.last_active === today) {
      state.user.today_connection_done = true;
      return;
    }
    state.user.streak = state.user.last_active === yesterday ? Number(state.user.streak || 0) + 1 : 1;
    state.user.last_active = today;
    state.user.today_connection_done = true;
  }

  async function mockApi(path, options) {
    await wait();
    errorIfEnabled();
    const body = decodeBody(options);

    if (path === "/api/state") return clone({ ...state, open_tasks: state.tasks.filter((task) => task.status === "open") });

    const start = path.match(/^\/api\/games\/([^/]+)\/start$/);
    if (start) {
      const game = decodeURIComponent(start[1]);
      const configs = Buddy.gameConfigs || {};
      return { title: configs[game]?.title || game, goal: game === "coffee_chat" ? "Learn about their work and leave with a natural reason to follow up." : "Practice one specific networking skill.", opening_line: openingLines[game] || "Hi, nice to meet you.", max_turns: configs[game]?.maxTurns || 1 };
    }

    const turn = path.match(/^\/api\/games\/([^/]+)\/turn$/);
    if (turn) {
      const game = decodeURIComponent(turn[1]);
      const history = body.history || [];
      const replyIndex = Math.max(0, history.filter((message) => message.role === "user").length - 1);
      return { reply: personalizedMockReply(game, body.context || {}, replyIndex) };
    }

    const score = path.match(/^\/api\/games\/([^/]+)\/score$/);
    if (score) {
      const game = decodeURIComponent(score[1]);
      const result = clone(scoreResults[game] || scoreResults.coffee_chat);
      const context = body.context || {};
      const contact = context.contacts?.[0];
      result.recommended_follow_up = contact
        ? `Ask ${contact.name} how their experience with ${contact.notes?.[0] || "their current work"} connects to the kind of ${context.user?.target_roles?.[0] || "role"} you are exploring.`
        : `Ask one person how their day-to-day work connects to the ${context.user?.target_roles?.[0] || "role"} you are exploring.`;
      state.game_sessions.unshift({ id: `g${Date.now()}`, game, date: "2026-10-02", scores: result.scores, xp: result.xp });
      awardXp(result.xp, false);
      return result;
    }

    const complete = path.match(/^\/api\/tasks\/([^/]+)\/complete$/);
    if (complete) {
      const task = state.tasks.find((item) => item.id === decodeURIComponent(complete[1]));
      if (!task) throw new Error("Task not found.");
      const contact = { id: `c${Date.now()}`, name: body.met_name, role: body.role, company: body.company, how_met: task.title, notes: [body.hook], last_contact: "2026-10-02" };
      state.contacts.unshift(contact);
      task.status = "complete";
      awardXp(task.xp, true);
      return { contact: clone(contact), xp_earned: Number(task.xp || 0), streak: state.user.streak };
    }

    throw new Error(`Mock route not implemented: ${path}`);
  }

  function resetMock() { state = structuredClone(initialState); controls.errorMode = false; }
  Buddy.mockState = () => clone(state);
  Buddy.mockControls = controls;
  Buddy.resetMock = resetMock;
  Buddy.mockApi = mockApi;
  Buddy.api = mockApi;
})(window);
