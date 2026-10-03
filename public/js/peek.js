// The "peek at the system prompt" sheet: a panel that slides in from the right and shows
// what the machine is told for an activity, and how it is set up.
// The prompts come from the server, so they can't drift from what is really used. The
// explanations come from data/peek.json, so they can be edited without code.
const Peek = (() => {
  let dialog;
  let titleElement;
  let bodyElement;
  let wordsLoading = null; // the wording from data/peek.json, fetched on first use
  let openCount = 0; // goes up with each opening, so a late reply to an old one is ignored

  async function loadWords() {
    try {
      const response = await fetch("data/peek.json");
      return await response.json();
    } catch {
      return {}; // the sheet still works, just without the explanations
    }
  }

  // Wires up every trigger button: <button class="peek__trigger" data-peek="writer">.
  // A trigger can name several activities, separated by spaces, to show them together.
  function init() {
    const triggers = document.querySelectorAll(".peek__trigger");
    if (triggers.length === 0) return;

    build();
    for (const trigger of triggers) {
      trigger.addEventListener("click", () => open(trigger.dataset.peek.split(" ")));
    }
  }

  // Builds the (empty) sheet once. All text is added as text, never as HTML.
  function build() {
    dialog = MM.el("dialog", "peek");
    dialog.setAttribute("aria-labelledby", "peek-title");

    titleElement = MM.el("h2", "peek__title");
    titleElement.id = "peek-title";
    const heading = MM.el("div");
    heading.append(MM.el("p", "peek__eyebrow", "Under the hood"), titleElement);

    const close = MM.el("button", "btn btn--close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => MM.closeDialog(dialog));

    const header = MM.el("header", "peek__header");
    header.append(heading, close);
    bodyElement = MM.el("div", "peek__body");
    const footer = MM.el("p", "peek__footer");
    footer.hidden = true; // until the version is known
    MM.showVersion(footer);
    const sheet = MM.el("div", "peek__sheet");
    sheet.append(header, bodyElement, footer);
    dialog.append(sheet);

    // Esc and a click on the dimmed area both close it, with the slide-out.
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      MM.closeDialog(dialog);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) MM.closeDialog(dialog);
    });
    document.body.append(dialog);
  }

  // The prompts are asked for each time the sheet opens, because some values change
  // while the app runs (Temp Check's current temperature).
  async function open(activities) {
    const thisOpening = ++openCount;
    titleElement.textContent = "System prompt";
    bodyElement.replaceChildren(MM.el("p", "peek__status", "Loading…"));
    bodyElement.scrollTop = 0;
    if (!dialog.open) dialog.showModal();

    try {
      wordsLoading ??= loadWords();
      const [words, ...replies] = await Promise.all([
        wordsLoading,
        ...activities.map((activity) => MM.api(`prompts/${activity}`)),
      ]);
      if (thisOpening === openCount) render(activities, replies, words);
    } catch (error) {
      if (thisOpening === openCount) {
        bodyElement.replaceChildren(MM.el("p", "peek__status", error.message));
      }
    }
  }

  // ---------- drawing the content ----------

  function render(activities, replies, words) {
    const sections = [];
    const groups = new Set();
    replies.forEach((reply, index) => {
      for (const [key, prompt] of Object.entries(reply.prompts)) {
        const { group, name } = splitLabel(prompt.label);
        if (group) groups.add(group);
        const hint = words.prompts?.[activities[index]]?.[key];
        sections.push(promptSection(name, hint, prompt, words));
      }
    });

    titleElement.textContent = [...groups].join(" · ") || "System prompt";
    const intro = words.intro ? [MM.el("p", "peek__intro", words.intro)] : [];
    bodyElement.replaceChildren(...intro, metaRow(replies), ...sections);
  }

  // The server's labels look like "Micro-fiction: opening line": the activity, then
  // the part of it that this prompt is for.
  function splitLabel(label) {
    const [group, ...rest] = label.split(": ");
    if (rest.length === 0) return { group: "", name: capitalize(label) };
    return { group, name: capitalize(rest.join(": ")) };
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // The model, and any values that change while the app runs.
  function metaRow(replies) {
    const row = MM.el("div", "peek__meta");
    row.append(MM.el("span", "peek__meta-label", "Model"));
    for (const model of new Set(replies.map((reply) => reply.model))) {
      row.append(MM.el("span", "peek__tag", model));
    }
    for (const reply of replies) {
      for (const [name, value] of Object.entries(reply.live ?? {})) {
        const text = `Current ${name}: ${value ?? "not set yet"}`;
        row.append(MM.el("span", "peek__tag peek__tag--live", text));
      }
    }
    return row;
  }

  function promptSection(name, hint, prompt, words) {
    const section = MM.el("section", "peek__section");
    section.append(MM.el("h3", "peek__label", name));
    if (hint) section.append(MM.el("p", "peek__hint", hint));
    section.append(MM.el("pre", "peek__text", prompt.system));

    if (prompt.lengths) {
      section.append(
        extraBlock("Added at random", words.lengths, prompt.lengths.join("\n"))
      );
    }
    if (prompt.twist) {
      section.append(extraBlock("Added with a wild card", words.twist, prompt.twist));
    }
    section.append(settingsBlock(prompt.options, words.settings ?? {}));
    return section;
  }

  // A smaller block under a prompt: a label, a line of explanation, then the text.
  function extraBlock(label, hint, text) {
    const block = MM.el("div", "peek__extra");
    block.append(MM.el("h4", "peek__sublabel", label));
    if (hint) block.append(MM.el("p", "peek__hint", hint));
    block.append(MM.el("pre", "peek__text", text));
    return block;
  }

  // The sampling options, each as a small chip with a plain-language note beside it.
  function settingsBlock(options, hints) {
    const block = MM.el("div", "peek__extra");
    block.append(MM.el("h4", "peek__sublabel", "Settings"));

    const list = MM.el("dl", "peek__settings");
    for (const [name, value] of Object.entries(options)) {
      const chip = MM.el("dt", "peek__chip");
      chip.append(
        MM.el("span", "peek__chip-name", name),
        MM.el("span", "", String(value))
      );
      list.append(chip, MM.el("dd", "peek__hint", hints[name] ?? ""));
    }
    block.append(list);
    return block;
  }

  return { init };
})();
