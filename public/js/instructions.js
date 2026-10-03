// The "?" instructions card: a short card shown the first time someone opens an
// activity, and again whenever they press the ? button in the header.
// The wording lives in data/instructions.json, so it can be edited without code.
const Instructions = (() => {
  const SEEN_PREFIX = "mm-seen-";

  // If storage is blocked we can't remember, so don't pop the card up on every
  // page load; the ? button still works.
  function hasSeen(key) {
    try {
      return localStorage.getItem(SEEN_PREFIX + key) === "yes";
    } catch {
      return true;
    }
  }

  function markSeen(key) {
    try {
      localStorage.setItem(SEEN_PREFIX + key, "yes");
    } catch {
      // Not remembering is fine.
    }
  }

  // Swaps {name} markers in the wording for values from the page, such as the
  // story's word limit, so numbers are only ever set in one place.
  function fill(text, values) {
    return text.replace(/\{(\w+)\}/g, (marker, name) => values[name] ?? marker);
  }

  // Builds the card. All text is added as text, never as HTML.
  function build(content, values) {
    const dialog = MM.el("dialog", "help");
    const card = MM.el("form", "help__card");
    card.method = "dialog"; // pressing the button closes the dialog

    const steps = MM.el("ol", "help__steps");
    for (const step of content.steps) steps.append(MM.el("li", "", fill(step, values)));

    const close = MM.el("button", "help__close", "Got it");
    card.append(
      MM.el("h2", "help__title", content.title),
      MM.el("p", "help__intro", fill(content.intro, values)),
      steps
    );
    // An optional closing line, such as a tip.
    if (content.note) card.append(MM.el("p", "help__note", fill(content.note, values)));
    card.append(close);
    dialog.append(card);

    // Clicking the dimmed area around the card closes it.
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    return dialog;
  }

  // `key` picks the wording from data/instructions.json.
  async function init(key, values = {}) {
    const button = document.querySelector(".help-btn");

    let content;
    try {
      const response = await fetch("data/instructions.json");
      content = (await response.json())[key];
    } catch {
      content = null;
    }
    if (!content) {
      if (button) button.hidden = true;
      return;
    }

    const dialog = build(content, values);
    document.body.append(dialog);
    button?.addEventListener("click", () => dialog.showModal());
    dialog.addEventListener("close", () => markSeen(key));
    if (!hasSeen(key)) dialog.showModal();
  }

  return { init };
})();
