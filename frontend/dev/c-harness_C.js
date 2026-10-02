(function (root) {
  "use strict";

  const Buddy = root.NetworkingBuddy;
  const status = document.querySelector("#c-status");
  const homeScreen = document.querySelector("#screen-home");
  const dailyTasks = document.querySelector("#daily-tasks");
  const gameScreen = document.querySelector("#screen-game");
  const scoreScreen = document.querySelector("#screen-score");
  const taskScreen = document.querySelector("#screen-task");

  function setStatus(message, kind) {
    status.textContent = message || "";
    status.dataset.kind = kind || "";
    status.hidden = !message;
  }

  function showOnly(target) {
    [homeScreen, gameScreen, scoreScreen, taskScreen].forEach((screen) => { if (screen) screen.hidden = screen !== target; });
  }

  function options() {
    return {
      gameContainer: gameScreen,
      scoreContainer: scoreScreen,
      taskContainer: taskScreen,
      status,
      onHome: () => { showOnly(homeScreen); Buddy.renderDailyTasks({ listContainer: dailyTasks, onSelect: selectTask }); setStatus("Returned to today's connection plan.", "success"); },
      onStatus: setStatus,
    };
  }

  function selectTask(task) {
    showOnly(taskScreen);
    setStatus("");
    Buddy.renderTask(task.id, { ...options(), task });
  }

  document.querySelectorAll("[data-game]").forEach((button) => button.addEventListener("click", () => { showOnly(gameScreen); setStatus(""); Buddy.renderGame(button.dataset.game, options()); }));
  document.querySelector("[data-reset]")?.addEventListener("click", () => { Buddy.resetMock(); Buddy.resetGame(); showOnly(homeScreen); Buddy.renderDailyTasks({ listContainer: dailyTasks, onSelect: selectTask }); setStatus("Mock state reset.", "success"); });
  document.querySelector("[data-error]")?.addEventListener("click", (event) => { Buddy.mockControls.errorMode = !Buddy.mockControls.errorMode; event.currentTarget.textContent = Buddy.mockControls.errorMode ? "Disable mock errors" : "Enable mock errors"; setStatus(Buddy.mockControls.errorMode ? "Mock errors enabled. Open a game or task to test recovery." : "Mock errors disabled.", Buddy.mockControls.errorMode ? "warning" : "success"); });
  document.querySelector("[data-back]")?.addEventListener("click", () => { showOnly(homeScreen); Buddy.renderDailyTasks({ listContainer: dailyTasks, onSelect: selectTask }); setStatus(""); });
  root.addEventListener("networking-buddy:state-changed", () => {
    // State updates should refresh the home data when home is visible, but
    // must not interrupt feedback or task-success screens.
    if (!homeScreen.hidden) Buddy.renderDailyTasks({ listContainer: dailyTasks, onSelect: selectTask });
  });
  Buddy.renderDailyTasks({ listContainer: dailyTasks, onSelect: selectTask });
})(window);
