// Helpers shared by every page: talking to the server, who you are,
// on-page messages and small helpers.
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

  // ---------- dialogs ----------

  // Closes a <dialog> after its fade-out has played. Adding "dialog--closing" starts the
  // closing animations in the CSS; the dialog is closed when they are done. People who
  // prefer less motion get no animation, so there is nothing to wait for.
  function closeDialog(dialog) {
    const prefersLessMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersLessMotion || !dialog.open) {
      dialog.close();
      return;
    }
    if (dialog.classList.contains("dialog--closing")) return;

    dialog.classList.add("dialog--closing");
    const finish = (event) => {
      // Animations on the backdrop also report here; the dialog's own one is the cue.
      if (event?.pseudoElement) return;
      dialog.removeEventListener("animationend", finish);
      clearTimeout(fallback);
      dialog.classList.remove("dialog--closing");
      dialog.close();
    };
    const fallback = setTimeout(finish, 600); // in case no animation ever runs
    dialog.addEventListener("animationend", finish);
  }

  // A styled stand-in for the browser's confirm(). Resolves to true if the person picks
  // the confirm button, and to false if they cancel, press Esc or click outside it.
  // The safer choice (cancel) has the focus when it opens.
  function confirmDialog({
    title,
    message,
    confirmLabel = "OK",
    cancelLabel = "Cancel",
  }) {
    return new Promise((resolve) => {
      const dialog = el("dialog", "confirm");

      const cancel = el("button", "btn", cancelLabel);
      cancel.type = "button";
      cancel.autofocus = true;
      const confirm = el("button", "btn btn--primary", confirmLabel);
      confirm.type = "button";
      const actions = el("div", "confirm__actions");
      actions.append(cancel, confirm);

      const card = el("div", "confirm__card");
      card.append(
        el("h2", "confirm__title", title),
        el("p", "confirm__message", message),
        actions
      );
      dialog.append(card);

      const answer = (result) => {
        resolve(result);
        closeDialog(dialog);
      };
      cancel.addEventListener("click", () => answer(false));
      confirm.addEventListener("click", () => answer(true));
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        answer(false);
      });
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) answer(false);
      });
      dialog.addEventListener("close", () => dialog.remove()); // once it has faded out

      document.body.append(dialog);
      dialog.showModal();
    });
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
    closeDialog,
    confirm: confirmDialog,
    timestamp,
    el,
  };
})();
