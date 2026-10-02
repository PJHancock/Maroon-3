(function (root) {
  "use strict";

  const Buddy = root.NetworkingBuddy;
  const home = document.querySelector("#screen-home");
  const dailyTasks = document.querySelector("#daily-tasks");
  const game = document.querySelector("#screen-game");
  const score = document.querySelector("#screen-score");
  const task = document.querySelector("#screen-task");
  const status = document.querySelector("#app-status");

  function showOnly(target) {
    [home, game, score, task].forEach((screen) => { if (screen) screen.hidden = screen !== target; });
  }

  function setStatus(message, kind) {
    if (!status) return;
    status.textContent = message || "";
    status.dataset.kind = kind || "";
    status.hidden = !message;
  }

  function options() {
    return {
      gameContainer: game,
      scoreContainer: score,
      taskContainer: task,
      status,
      onHome: () => { showOnly(home); Buddy.renderDailyTasks({ listContainer: dailyTasks, onSelect: selectTask }); },
      onStatus: setStatus,
    };
  }

  function selectTask(selectedTask) {
    showOnly(task);
    Buddy.renderTask(selectedTask.id, { ...options(), task: selectedTask });
  }

  document.querySelectorAll("[data-game]").forEach((button) => button.addEventListener("click", () => {
    showOnly(game);
    Buddy.renderGame(button.dataset.game, options());
  }));
  document.querySelector("[data-back]")?.addEventListener("click", () => { showOnly(home); Buddy.renderDailyTasks({ listContainer: dailyTasks, onSelect: selectTask }); });
  root.addEventListener("networking-buddy:state-changed", () => { if (!home.hidden) Buddy.renderDailyTasks({ listContainer: dailyTasks, onSelect: selectTask }); });
  Buddy.renderDailyTasks({ listContainer: dailyTasks, onSelect: selectTask });
})(window);
