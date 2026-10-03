// Temp Check, player side. The server holds the game; this page shows whatever
// phase it is in and sends back this player's word (or Hot/Cold votes).
//
// Screens are built once per phase and then updated in place, so typing is
// never wiped by other players' activity.
const stage = document.querySelector(".temp__stage");
const statusLine = document.querySelector(".temp__status");

let view = null; // the latest state from the server
let clockOffset = 0; // server time minus this device's clock, in ms
let stageKey = ""; // which screen is currently built
let refs = {}; // elements that are updated in place

const MODE_TITLES = { match: "Be the machine", beat: "Beat the machine" };
const MODE_RULES = {
  match:
    "Type the word the machine is most likely to say. The more of its tries match yours, the more points you get.",
  beat: "Type a word the machine won't say, and nobody else will either. Unique words score 100.",
};
const BEAT_OUTCOMES = {
  unique: "Nobody said it, not even the machine.",
  machine: "The machine said it too.",
  player: "Someone else said it too.",
  none: "You didn't answer.",
};

function init() {
  if (!MM.requireIdentity()) return;
  Peek.init();
  Instructions.init("activity-03");
  setInterval(tick, 100);
  connect();
}

// ---------- connection ----------

function connect() {
  const id = encodeURIComponent(MM.getIdentity().id);
  const source = new EventSource(`/api/temp/events?id=${id}`);

  source.onopen = () => MM.clearNotice();

  source.onmessage = (event) => {
    view = JSON.parse(event.data);
    clockOffset = view.now - Date.now();
    render();
  };

  // The browser retries dropped connections by itself. If it gave up, the
  // server refused us (for example it restarted and forgot who we are), so
  // join again and reconnect.
  source.onerror = () => {
    MM.notice("Reconnecting…", "warn");
    if (source.readyState !== EventSource.CLOSED) return;
    source.close();
    setTimeout(async () => {
      try {
        await MM.joinSession(MM.getIdentity());
      } catch {
        // Try again on the next round of reconnecting.
      }
      connect();
    }, 1500);
  };
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

// Fills in everything that changes while a screen is showing.
function updateStage() {
  const { you, round, phase } = view;
  statusLine.textContent = round
    ? `${you.name} · ${round.crowd ? "Finale" : `Round ${round.index + 1} of ${round.total}`}`
    : you.name;

  if (refs.count) refs.count.textContent = `${view.playersConnected} here so far`;
  if (refs.temperature) setTemperature(round.temperature);
  if (refs.pips) setPips(you.level);

  if (phase === "input" && refs.input) {
    if (you.answer) {
      refs.locked.textContent = `Locked in: ${you.answer}`;
      // Restores the word after a reconnect or reload.
      if (!refs.input.value) refs.input.value = you.answer;
    }
  }
}

function setTemperature(temperature) {
  refs.temperature.textContent = temperature.toFixed(1);
  // The track runs from 0 to 2.
  refs.marker.style.left = `${Math.min(100, (temperature / 2) * 100)}%`;
}

// Runs ten times a second to keep the countdown smooth.
function tick() {
  if (!view || view.phase !== "input" || !refs.countdown) return;
  const seconds = Math.max(0, (view.endsAt - (Date.now() + clockOffset)) / 1000);
  refs.countdown.textContent = Math.ceil(seconds);
  refs.bar.style.width = `${(seconds / view.inputSeconds) * 100}%`;

  // A word typed but not sent is sent just before time runs out.
  if (seconds < 0.4 && refs.input.value.trim() && refs.sent !== refs.input.value.trim()) {
    submitAnswer();
  }
}

// ---------- pieces ----------

// The sentence, with the blank drawn as a gap.
function stemElement(stem) {
  const paragraph = MM.el("p", "stem");
  stem.split("___").forEach((part, index) => {
    if (index > 0) paragraph.append(MM.el("span", "stem__blank", " "));
    paragraph.append(part);
  });
  return paragraph;
}

function modeBadge(round) {
  return MM.el("p", `mode mode--${round.mode}`, MODE_TITLES[round.mode]);
}

function temperatureGauge() {
  const gauge = MM.el("div", "gauge");
  const label = MM.el("p", "gauge__label label");
  label.append("Temperature ", (refs.temperature = MM.el("strong")));
  const track = MM.el("div", "gauge__track");
  refs.marker = MM.el("div", "gauge__marker");
  track.append(refs.marker);
  gauge.append(label, track);
  return gauge;
}

// ---------- screens ----------

function buildLobby() {
  refs.count = MM.el("p", "temp__muted");
  stage.append(
    MM.el("h2", "temp__title", "Waiting for the host…"),
    MM.el("p", "temp__text", "Look up at the big screen. The game starts soon."),
    refs.count
  );
}

function buildIntro() {
  const { round } = view;
  stage.append(
    modeBadge(round),
    MM.el("p", "temp__text", MODE_RULES[round.mode]),
    stemElement(round.stem),
    temperatureGauge()
  );

  if (round.crowd) buildVoting();
  else
    stage.append(
      MM.el("p", "temp__muted", "Get ready. Typing starts when the host says.")
    );
}

// Finale: the room sets the temperature together.
function buildVoting() {
  stage.append(
    MM.el(
      "p",
      "temp__text",
      "The room sets the temperature. Tap as many times as you like."
    )
  );

  const buttons = MM.el("div", "vote");
  for (const direction of ["cold", "hot"]) {
    const button = MM.el(
      "button",
      `btn btn--large vote__button vote__button--${direction}`
    );
    button.type = "button";
    button.textContent = direction === "hot" ? "Hotter ▲" : "Colder ▼";
    button.addEventListener("click", () => vote(direction));
    buttons.append(button);
  }

  refs.pips = MM.el("div", "pips");
  for (let level = -5; level <= 5; level++) {
    const pip = MM.el("span", "pips__pip");
    pip.dataset.level = level;
    refs.pips.append(pip);
  }
  stage.append(buttons, refs.pips);
}

// Lights the pips from the middle out to this player's Hot/Cold level.
function setPips(level) {
  for (const pip of refs.pips.children) {
    const value = Number(pip.dataset.level);
    const reached =
      value === 0 ||
      (level > 0 && value > 0 && value <= level) ||
      (level < 0 && value < 0 && value >= level);
    pip.classList.toggle("pips__pip--on", reached);
    pip.classList.toggle("pips__pip--hot", value > 0);
    pip.classList.toggle("pips__pip--cold", value < 0);
  }
}

async function vote(direction) {
  try {
    await MM.api("temp/vote", { id: MM.getIdentity().id, direction });
  } catch (error) {
    MM.notice(error.message, "error");
  }
}

function buildInput() {
  const { round } = view;
  refs.countdown = MM.el("p", "countdown");
  refs.bar = MM.el("div", "countdown__bar");
  const track = MM.el("div", "countdown__track");
  track.append(refs.bar);

  const form = MM.el("form", "answer");
  refs.input = MM.el("input", "input answer__input");
  refs.input.type = "text";
  refs.input.maxLength = 30;
  refs.input.autocomplete = "off";
  refs.input.autocapitalize = "none";
  refs.input.spellcheck = false;
  refs.input.setAttribute("aria-label", "Your word");
  refs.input.setAttribute("enterkeyhint", "send");
  const button = MM.el("button", "btn btn--primary btn--large", "Lock in");
  button.type = "submit";
  form.append(refs.input, button);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAnswer();
  });

  refs.locked = MM.el(
    "p",
    "temp__muted",
    "One word. You can change it until time runs out."
  );
  stage.append(
    modeBadge(round),
    stemElement(round.stem),
    refs.countdown,
    track,
    form,
    refs.locked
  );
  refs.input.focus();
  tick();
}

async function submitAnswer() {
  const text = refs.input.value.trim();
  if (!text) return;
  refs.sent = text;
  try {
    const { word } = await MM.api("temp/answer", { id: MM.getIdentity().id, word: text });
    refs.locked.textContent = `Locked in: ${word}`;
  } catch (error) {
    refs.sent = null;
    MM.notice(error.message, "error");
  }
}

function buildThinking() {
  const title = MM.el("h2", "temp__title", "The machine is thinking");
  title.append(" ", MM.dots());
  stage.append(title, stemElement(view.round.stem));
}

function buildReveal() {
  const { you, results, round } = view;
  const result = you.result;
  const word = result?.word;
  const own = results.players.find((entry) => entry.word === word);

  stage.append(
    MM.el("h2", "temp__title", word ? `You said “${word}”` : "You didn't answer"),
    MM.el("p", "points", `+${result?.points ?? 0}`)
  );

  if (results.received === 0) {
    stage.append(MM.el("p", "temp__text", "The machine didn't answer this round."));
  } else if (round.mode === "match") {
    if (word) {
      stage.append(
        MM.el(
          "p",
          "temp__text",
          `The machine said it ${own?.machineCount ?? 0} of ${results.received} times.`
        )
      );
    }
  } else {
    stage.append(MM.el("p", "temp__text", BEAT_OUTCOMES[result?.outcome ?? "none"]));
  }

  const words = results.machine
    .slice(0, 5)
    .map((entry) => `${entry.word} ×${entry.count}`);
  if (words.length > 0) {
    stage.append(MM.el("p", "temp__muted", `The machine's words: ${words.join(" · ")}`));
  }
  stage.append(
    MM.el(
      "p",
      "temp__text",
      `Total ${you.total} · Rank ${you.rank} of ${view.playerCount}`
    )
  );
}

function buildStandings() {
  const { you, leaderboard, phase } = view;
  const ended = phase === "ended";
  stage.append(MM.el("h2", "temp__title", ended ? "That's the game!" : "Leaderboard"));

  const list = MM.el("ol", "board");
  for (const row of leaderboard) {
    const item = MM.el("li", row.you ? "board__row board__row--you" : "board__row");
    item.append(
      MM.el("span", "board__rank", row.rank),
      MM.el("span", "board__name", row.name),
      MM.el("span", "board__total", row.total)
    );
    list.append(item);
  }
  stage.append(list);

  if (!leaderboard.some((row) => row.you)) {
    stage.append(MM.el("p", "temp__text", `You: rank ${you.rank} with ${you.total}`));
  }

  if (ended) addThanks();
}

// After the game: a link to the post-session form, if the host set one up.
async function addThanks() {
  stage.append(MM.el("p", "temp__text", "Thanks for playing."));
  try {
    const { googleFormUrl } = await MM.api("config");
    if (!googleFormUrl) return;
    const link = MM.el("a", "temp__link", "Share your stories and poems");
    link.href = googleFormUrl;
    link.target = "_blank";
    link.rel = "noopener";
    stage.append(link);
  } catch {
    // The link is a nicety; the page works without it.
  }
}

init();
