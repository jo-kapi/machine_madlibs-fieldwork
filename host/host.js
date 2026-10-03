// Host screen for Temp Check. It shows whatever the server's game is doing and
// sends the host's commands back. Nothing here keeps game state, so reloading
// the page picks up exactly where the game is.
const stage = document.querySelector(".host__stage");
const roundLabel = document.querySelector(".host__round");
const notice = document.querySelector(".host__notice");
const peek = document.querySelector(".host__peek");

let view = null; // the latest state from the server
let clockOffset = 0; // server time minus this computer's clock, in ms
let stageKey = ""; // which screen is currently built
let refs = {}; // elements that are updated in place
let joinInfo = null; // the addresses people type in to join
let currentView = "game"; // "game" or "gallery"

const MODE_TITLES = { match: "Be the machine", beat: "Beat the machine" };

// The dial's artwork is fixed markup (no user text), so it is safe to insert as HTML.
const DIAL_SVG = `
  <svg class="dial__svg" viewBox="0 0 220 125" aria-hidden="true">
    <defs>
      <linearGradient id="dial-gradient" x1="0" x2="1">
        <stop offset="0" style="stop-color: var(--color-cold)" />
        <stop offset="0.5" style="stop-color: var(--color-host-text)" />
        <stop offset="1" style="stop-color: var(--color-hot)" />
      </linearGradient>
    </defs>
    <path d="M 20 110 A 90 90 0 0 1 200 110" fill="none" stroke="url(#dial-gradient)"
      stroke-width="14" stroke-linecap="round" />
    <g class="dial__needle" style="transform: rotate(-90deg)">
      <line x1="110" y1="110" x2="110" y2="34" stroke="white" stroke-width="5"
        stroke-linecap="round" />
    </g>
    <circle cx="110" cy="110" r="9" fill="white" />
  </svg>`;

// ---------- connection ----------

function init() {
  const source = new EventSource("/api/host/events");
  source.onmessage = (event) => {
    view = JSON.parse(event.data);
    clockOffset = view.now - Date.now();
    render();
  };
  source.onerror = () => showNotice("Lost the connection to the server. Reconnecting…");
  source.onopen = () => notice.setAttribute("hidden", "");

  setInterval(tick, 100);
  document.addEventListener("keydown", handleKey);

  Gallery.init(showGalleryCount);
  for (const tab of document.querySelectorAll(".host__tab")) {
    tab.addEventListener("click", () => {
      tab.blur();
      setView(tab.dataset.view);
    });
  }
  document.querySelector(".host__buttons").addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action) return;
    event.target.blur();
    if (action === "reset" && !confirm("Restart the game? Scores will be cleared."))
      return;
    send(action);
  });
}

async function send(action, extra = {}) {
  try {
    await MM.api("host/command", { action, ...extra });
  } catch (error) {
    showNotice(error.message);
  }
}

let noticeTimer;
function showNotice(message) {
  notice.textContent = message;
  notice.removeAttribute("hidden");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.setAttribute("hidden", ""), 4000);
}

// ---------- keyboard ----------

// Switches between the game and the gallery of images sent to the screen.
function setView(name) {
  currentView = name;
  stage.hidden = name !== "game";
  Gallery.element.hidden = name !== "gallery";
  roundLabel.hidden = name !== "game";
  document.querySelector(".host__hint--game").hidden = name !== "game";
  document.querySelector(".host__hint--gallery").hidden = name !== "gallery";
  document.querySelector(".host__buttons").hidden = name !== "game";
  for (const tab of document.querySelectorAll(".host__tab")) {
    tab.classList.toggle("host__tab--active", tab.dataset.view === name);
  }
}

function showGalleryCount(count) {
  const badge = document.querySelector(".host__badge");
  badge.textContent = count;
  badge.hidden = count === 0;
}

function handleKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const step = event.shiftKey ? 0.5 : 0.1;

  // Views can be switched from anywhere.
  if (event.key === "g" || event.key === "G") return setView("gallery");
  if (event.key === "t" || event.key === "T") return setView("game");
  if (event.key === "f" || event.key === "F") return toggleFullscreen();

  // In the gallery, the game's keys are off so nothing advances by accident.
  if (currentView === "gallery") {
    if (Gallery.handleKey(event)) event.preventDefault();
    return undefined;
  }

  switch (event.key) {
    case " ":
      event.preventDefault();
      return send("next");
    case "ArrowUp":
    case "ArrowRight":
      event.preventDefault();
      return send("temperature", { delta: step });
    case "ArrowDown":
    case "ArrowLeft":
      event.preventDefault();
      return send("temperature", { delta: -step });
    case "r":
    case "R":
      return send("redo");
    case "p":
    case "P":
      return togglePeek();
    case "Escape":
      peek.setAttribute("hidden", "");
      return undefined;
    default:
      return undefined;
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
}

// Shows the real system prompt and sampling options, straight from the server.
async function togglePeek() {
  if (!peek.hasAttribute("hidden")) return peek.setAttribute("hidden", "");

  const body = peek.querySelector(".host__peek-body");
  body.replaceChildren(MM.el("p", "", "Loading…"));
  peek.removeAttribute("hidden");
  try {
    const data = await MM.api("prompts/temp");
    const { system, options } = data.prompts.sample;
    const temperature = view?.round?.temperature ?? data.live?.temperature;

    const settings = MM.el("dl");
    const rows = {
      model: data.model,
      temperature: temperature ?? "set per round",
      ...options,
    };
    for (const [name, value] of Object.entries(rows)) {
      settings.append(MM.el("dt", "", name), MM.el("dd", "", String(value)));
    }
    body.replaceChildren(
      MM.el("h2", "host__title", "System prompt"),
      MM.el("pre", "", system),
      settings
    );
  } catch (error) {
    body.replaceChildren(MM.el("p", "", error.message));
  }
  return undefined;
}

// ---------- rendering ----------

function render() {
  const key = `${view.phase}:${view.round?.index ?? "-"}:${view.thinking}`;
  if (key !== stageKey) {
    stageKey = key;
    stage.replaceChildren();
    refs = {};
    buildStage();
  }
  updateStage();
}

function buildStage() {
  switch (view.phase) {
    case "lobby":
      return buildLobby();
    case "intro":
      return buildIntro();
    case "input":
      return buildInput();
    case "reveal":
      return view.thinking ? buildThinking() : buildReveal();
    default:
      return buildStandings();
  }
}

// Updates everything that changes while a screen is showing.
function updateStage() {
  const { round } = view;
  roundLabel.textContent = round
    ? `${round.crowd ? "Finale" : `Round ${round.index + 1} of ${round.total}`} · ${MODE_TITLES[round.mode]}`
    : "";

  if (refs.dial) refs.dial.set(round.temperature);
  if (refs.names) fillNames();
  if (refs.answers) {
    refs.answers.textContent = `${view.answersIn} of ${view.playersConnected} answers in`;
  }
  if (refs.voters) {
    refs.voters.textContent = `${view.voters} voting · tap Hotter or Colder on your devices`;
  }
}

// Runs ten times a second to keep the countdown smooth.
function tick() {
  if (!view || view.phase !== "input" || !refs.timer) return;
  const seconds = Math.max(0, (view.endsAt - (Date.now() + clockOffset)) / 1000);
  refs.timer.textContent = Math.ceil(seconds);
  refs.bar.style.width = `${(seconds / view.inputSeconds) * 100}%`;
}

// ---------- pieces ----------

function stemElement(stem, className = "stem") {
  const paragraph = MM.el("p", className);
  stem.split("___").forEach((part, index) => {
    if (index > 0) paragraph.append(MM.el("span", "stem__blank", " "));
    paragraph.append(part);
  });
  return paragraph;
}

function modeLabel(round) {
  const label = round.crowd
    ? `Finale · ${MODE_TITLES[round.mode]}`
    : MODE_TITLES[round.mode];
  return MM.el("p", `mode mode--${round.mode}`, label);
}

function createDial() {
  const element = MM.el("div", "dial");
  element.innerHTML = DIAL_SVG;
  const needle = element.querySelector(".dial__needle");
  const value = MM.el("p", "dial__value");
  element.append(value, MM.el("p", "dial__label", "Temperature"));

  let first = true;
  return {
    element,
    set(temperature) {
      value.textContent = temperature.toFixed(1);
      const turn = () => {
        needle.style.transform = `rotate(${-90 + (temperature / 2) * 180}deg)`;
      };
      // The first value waits a moment so the needle swings into place.
      if (first) setTimeout(turn, 50);
      else turn();
      first = false;
    },
  };
}

// ---------- screens ----------

function buildLobby() {
  refs.url = MM.el("p", "lobby__url");
  refs.names = MM.el("div", "lobby__names");

  const lobby = MM.el("div", "lobby");
  lobby.append(
    MM.el("h1", "host__title", "Temp Check"),
    MM.el("p", "host__sub", "Open this address on your device, then choose Activity 03:"),
    refs.url,
    refs.names
  );
  stage.append(lobby);
  showJoinInfo();
}

function fillNames() {
  const names = view.names.map((name) => MM.el("span", "chip", name));
  if (names.length === 0) names.push(MM.el("span", "host__sub", "Nobody here yet"));
  refs.names.replaceChildren(...names);
}

async function showJoinInfo() {
  try {
    joinInfo ??= await MM.api("host/join");
  } catch {
    return;
  }
  if (!refs.url) return; // the screen has changed meanwhile
  refs.url.textContent =
    joinInfo.urls.join("\n") || "No network found. Connect to Wi-Fi.";
}

function buildIntro() {
  const { round } = view;
  const main = MM.el("div", "intro__main");
  main.append(modeLabel(round), stemElement(round.stem));

  if (round.crowd) {
    refs.voters = MM.el("p", "host__sub");
    main.append(MM.el("p", "host__sub", "The room sets the temperature."), refs.voters);
  } else {
    main.append(MM.el("p", "host__sub", "Press space to start the clock."));
  }

  refs.dial = createDial();
  const intro = MM.el("div", "intro");
  intro.append(main, refs.dial.element);
  stage.append(intro);
}

function buildInput() {
  const { round } = view;
  refs.timer = MM.el("p", "timer");
  refs.bar = MM.el("div", "timer__bar");
  const track = MM.el("div", "timer__track");
  track.append(refs.bar);
  refs.answers = MM.el("p", "counter");

  const main = MM.el("div", "intro__main");
  main.append(modeLabel(round), stemElement(round.stem), refs.timer, track, refs.answers);

  refs.dial = createDial();
  const intro = MM.el("div", "intro");
  intro.append(main, refs.dial.element);
  stage.append(intro);
  tick();
}

function buildThinking() {
  stage.append(
    modeLabel(view.round),
    stemElement(view.round.stem),
    MM.el("h2", "host__title thinking", "The machine is thinking…")
  );
}

function buildReveal() {
  const { round, results } = view;

  const head = MM.el("div", "reveal__head");
  const kinds = results.machine.length + (results.machineOther > 0 ? "+" : "");
  const words = results.machine.length === 1 && !results.machineOther ? "word" : "words";
  let summary = "The machine didn't answer. Press R to run the round again.";
  if (results.received > 0) {
    const thrownOut =
      results.garbled > 0 ? `, ${results.garbled} garbled thrown out` : "";
    summary =
      `The machine tried ${results.requested} times · ${results.received} usable${thrownOut} · ` +
      `${kinds} different ${words} · temperature ${round.temperature.toFixed(1)}`;
  }
  head.append(
    modeLabel(round),
    stemElement(round.stem, "reveal__stem"),
    MM.el("p", "host__sub", summary)
  );

  const chart = MM.el("div", "chart");
  const chartRows = MM.el("div", "chart__rows");
  chart.append(chartRows);
  const playersByWord = new Map(results.players.map((entry) => [entry.word, entry]));
  const bars = [];

  results.machine.forEach((entry, index) => {
    const row = MM.el("div", "chart__row");
    const lane = MM.el("div", "chart__lane");
    const delay = index * 0.08;

    const bar = MM.el("div", "chart__bar");
    bar.style.setProperty("--delay", `${delay}s`);
    bars.push([bar, (entry.count / results.received) * 100]);

    const dots = MM.el("div", "chart__dots");
    const said = playersByWord.get(entry.word)?.count ?? 0;
    for (let i = 0; i < said; i++) {
      const dot = MM.el("span", round.mode === "beat" ? "dot dot--bad" : "dot");
      dot.style.setProperty("--delay", `${1 + delay + i * 0.06}s`);
      dots.append(dot);
    }

    lane.append(bar, MM.el("span", "chart__count", entry.count), dots);
    row.append(MM.el("span", "chart__word", entry.word), lane);
    chartRows.append(row);
  });

  // Words the machine never said, which only people did.
  const onlyPeople = results.players.filter((entry) => entry.machineCount === 0);
  if (onlyPeople.length > 0) {
    const only = MM.el("div", "chart__only");
    only.append(MM.el("span", "chart__only-label", "Only people said:"));
    onlyPeople.forEach((entry, index) => {
      const label = entry.count > 1 ? `${entry.word} ×${entry.count}` : entry.word;
      const status = entry.status ? ` tag--${entry.status}` : "";
      const tag = MM.el(
        "span",
        `tag${status}`,
        entry.status === "unique" ? `${label} ✓` : label
      );
      tag.style.setProperty("--delay", `${1.2 + index * 0.08}s`);
      only.append(tag);
    });
    chart.append(only);
  }

  const points = MM.el("div", "points");
  points.append(MM.el("p", "points__title", "Points this round"));
  if (results.points.length === 0)
    points.append(MM.el("p", "host__sub", "Nobody scored."));
  results.points.forEach((entry, index) => {
    const row = MM.el("p", "points__row");
    row.style.setProperty("--delay", `${1.5 + index * 0.12}s`);
    row.append(MM.el("span", "points__value", `+${entry.points}`), entry.name);
    points.append(row);
  });

  const left = MM.el("div", "reveal__left");
  left.append(head, chart);
  const reveal = MM.el("div", "reveal");
  reveal.append(left, points);
  stage.append(reveal);

  // Bars start at zero width and grow once the screen is in place.
  setTimeout(() => {
    for (const [bar, percent] of bars) bar.style.width = `${percent * 0.8}%`;
  }, 50);
}

function buildStandings() {
  const ended = view.phase === "ended";
  const top = Math.max(1, ...view.leaderboard.map((row) => row.total));

  const list = MM.el("ol", "board");
  const bars = [];
  for (const row of view.leaderboard) {
    const item = MM.el("li", "board__row");
    const bar = MM.el("div", "board__bar");
    bar.style.width = "0";
    bars.push([bar, (row.total / top) * 100]);
    item.append(
      MM.el("span", "board__rank", row.rank),
      MM.el("span", "board__name", row.name),
      bar,
      MM.el("span", "board__total", row.total)
    );
    list.append(item);
  }

  stage.append(
    MM.el("h1", "host__title", ended ? "Final standings" : "Leaderboard"),
    list
  );
  setTimeout(() => {
    for (const [bar, percent] of bars) bar.style.width = `${percent}%`;
  }, 50);
}

init();
