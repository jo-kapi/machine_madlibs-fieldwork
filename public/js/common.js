// Helpers shared by every page: talking to the server, who you are,
// on-page messages and the collapsible info panels.
// Everything lives on one global object, MM, so it works next to p5's globals.
const MM = (() => {
  const IDENTITY_KEY = "mm-identity";

  // ---------- server ----------

  // Calls the app's own API. Sends JSON when `body` is given, otherwise a GET
  // (or whichever `method` is named).
  async function api(path, body, method) {
    let response;
    try {
      response = await fetch(`/api/${path}`, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error("Can't reach the server. Check your Wi-Fi connection.");
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      // The body wasn't JSON; fall through to the generic message below.
    }
    if (!response.ok) {
      throw new Error(data?.error || `Something went wrong (${response.status}).`);
    }
    return data;
  }

  // ---------- identity ----------
  // Name and optional pronouns are asked for once, then kept in this browser.

  function getIdentity() {
    try {
      const identity = JSON.parse(localStorage.getItem(IDENTITY_KEY));
      return identity?.name ? identity : null;
    } catch {
      return null;
    }
  }

  function saveIdentity(identity) {
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    } catch {
      // Storage can be blocked (private windows); the join page reports this.
    }
  }

  // Registers (or refreshes) this person with the server and stores the result.
  async function joinSession({ name, pronouns }) {
    const existing = getIdentity();
    const session = await api("join", { id: existing?.id, name, pronouns });
    saveIdentity(session);
    return session;
  }

  // Sends people to the join page the first time they open any other page.
  // Returning visitors are re-registered quietly, which also recovers from a
  // server restart.
  function requireIdentity() {
    const identity = getIdentity();
    if (!identity) {
      const next = location.pathname + location.search;
      location.replace(`/?next=${encodeURIComponent(next)}`);
      return null;
    }
    joinSession(identity).catch(() => {});
    return identity;
  }

  // ---------- messages ----------

  // Shows a message in the page's .notice element.
  // kind: "info" fades after a few seconds; "warn" and "error" stay until
  // replaced or cleared.
  let noticeTimer;
  function notice(message, kind = "info") {
    const element = document.querySelector(".notice");
    if (!element) return;
    clearTimeout(noticeTimer);
    element.textContent = message;
    element.classList.toggle("notice--error", kind === "error");
    element.hidden = false;
    if (kind === "info") noticeTimer = setTimeout(clearNotice, 4000);
  }

  function clearNotice() {
    const element = document.querySelector(".notice");
    if (element) element.hidden = true;
  }

  // ---------- info panels ----------

  function remember(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch {
      return null;
    }
  }

  // Draws one activity's system prompts and sampling options into `body`.
  function renderPrompts(body, data) {
    body.replaceChildren();

    const model = document.createElement("p");
    model.textContent = `Model: ${data.model}`;
    body.append(model);

    // Values that change while the app runs, such as Temp Check's temperature.
    if (data.live) {
      const live = document.createElement("p");
      live.textContent = Object.entries(data.live)
        .map(([name, value]) => `Current ${name}: ${value ?? "not set yet"}`)
        .join(" · ");
      body.append(live);
    }

    for (const prompt of Object.values(data.prompts)) {
      const heading = document.createElement("h4");
      heading.textContent = prompt.label;
      const system = document.createElement("pre");
      system.textContent = prompt.system;
      body.append(heading, system);

      if (prompt.twist) {
        const twist = document.createElement("pre");
        twist.textContent = `With a wild card, this is added after the story:\n${prompt.twist}`;
        body.append(twist);
      }

      const options = document.createElement("dl");
      for (const [name, value] of Object.entries(prompt.options)) {
        const term = document.createElement("dt");
        term.textContent = name;
        const detail = document.createElement("dd");
        detail.textContent = value;
        options.append(term, detail);
      }
      body.append(options);
    }
  }

  // Wires up the <details class="info__panel"> elements on a page:
  //  - data-remember="key": reopen or stay closed, as the person left it.
  //  - data-peek="activity": load the live system prompt when first opened.
  function initInfoPanels() {
    for (const panel of document.querySelectorAll(".info__panel")) {
      const key = panel.dataset.remember;
      if (key && remember(`mm-panel-${key}`) === "closed") panel.open = false;

      panel.addEventListener("toggle", async () => {
        if (key) remember(`mm-panel-${key}`, panel.open ? "open" : "closed");

        const activity = panel.dataset.peek;
        if (!activity || !panel.open || panel.dataset.loaded) return;
        const body = panel.querySelector(".info__body");
        body.textContent = "Loading…";
        try {
          renderPrompts(body, await api(`prompts/${activity}`));
          panel.dataset.loaded = "true";
        } catch (error) {
          body.textContent = error.message;
        }
      });
    }
  }

  // ---------- helpers ----------

  // Filename-safe timestamp, e.g. 2026-10-03T14-05-09.
  function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  }

  // Creates an element. The text is added as text, never as HTML.
  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  return {
    api,
    getIdentity,
    joinSession,
    requireIdentity,
    notice,
    clearNotice,
    initInfoPanels,
    timestamp,
    el,
  };
})();
