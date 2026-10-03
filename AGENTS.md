# AGENTS.md

Guidance for anyone working on this repository, human or AI assistant.

## What this is

Machine Madlibs is a workshop kit: three activities that use a local language model
(through Ollama) with a room of people on their own devices. One computer hosts; everyone
else opens a web page. It is built for teaching and released as open source (GPL-3.0). Most
users are artists and designers rather than developers, so **readable beats clever**.

## Commands

| Command       | Does                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `npm install` | Install the one dependency (Express)                                       |
| `npm start`   | Run the app on port 3000 (`http://localhost:3000`, host screen at `/host`) |
| `npm run dev` | Same, restarting when server code changes                                  |

Needs Node 20.12 or newer and a running Ollama with the models named by `MODEL`
(Activities 1 and 2) and `TEMP_MODEL` (Activity 3); see `.env.example`. Settings come from environment variables or a `.env` file.

## Where things live

```
server/            Node server (ES modules). Start reading at index.js, then app.js
  prompts.js         Every system prompt and sampling option. Edit prompts here.
  activities.js      Activities 1 and 2: build the request, call the model, tidy the reply
  game.js            The Temp Check game (phases, scoring, what each screen is sent)
  scoring.js         Pure scoring maths
  ollama.js          The only code that talks to Ollama, behind a concurrency limiter
  game-routes.js     Temp Check and host routes (host routes are localhost-only)
public/            What participants load (plain HTML, CSS and browser JavaScript)
  css/tokens.css     Every colour, font and size. Re-theme here.
  data/              Wild cards, Temp Check stems and rounds: content, not code
host/              The projector screen and gallery; served only to the host machine
```

## Conventions

**JavaScript.** Vanilla only: no TypeScript, no framework, no bundler, no build step.
The server uses ES modules. Browser scripts are classic scripts, because p5.js runs in
global mode; shared helpers live on the `MM` object in `public/js/common.js`. Add a
dependency only when the project truly needs one.

**CSS.** Vanilla CSS with native nesting. Name components with BEM where it helps
(`.block__element--modifier`). Take colours, fonts and sizes from `tokens.css`; don't
hard-code them. Layouts target small tablets (about 768px wide) and up; there is no
phone-specific layout.

**Formatting.** Prettier, configured in `.prettierrc` (90 columns, 2 spaces, double
quotes, semicolons). Run `npx prettier --write <the files you changed>`. Never format
`public/js/p5.min.js` or `normalize.css` (both are in `.prettierignore`).

**Comments.** Short, in plain language, saying _why_ rather than restating the code.
Write them as public documentation: no working notes, no references to conversations.

**Writing for beginners.** Prefer small files and small functions with obvious names.
Put the explanation next to the code that needs it. Avoid tricks a newcomer would have
to look up.

## Rules that must keep holding

These are the privacy and safety promises the README makes to participants.

- Nothing is written to disk. Names, pronouns, images and scores live in memory only.
- Never log user text or pronouns. Pronouns appear only beside a poem in the gallery.
- Browsers never talk to Ollama. They call this app's `/api` routes, and system prompts
  and sampling options are set on the server so a client cannot change them.
- `/host` and `/api/host/*` answer only to the machine running the server. The check uses
  the connection's address, never a header the client controls.
- No analytics and no third-party requests at runtime. Fonts, p5.js and everything else
  are served locally, because the venue may have no internet.
- User text is added to the page as text (`textContent`), never as HTML.

## Recipes

- **Change what the machine is told:** edit `server/prompts.js`. The "peek at the system
  prompt" panels read from the same object, so they stay accurate.
- **Edit wild cards, stems or Temp Check rounds:** edit the JSON files in `public/data/`.
  They are read when used, so no restart is needed.
- **Change the look:** edit `public/css/tokens.css`.
- **Add an activity:** add a page in `public/`, add its prompts to `prompts.js`, add a
  function in `server/activities.js` and a route in `server/api.js`, then add a nav link
  and a peek panel on the page.
- **Add or change a setting:** add it to `server/config.js` with a default, then to
  `.env.example` and the settings table in the README.

## Things that are easy to get wrong

- Ollama reloads the model if `num_ctx` changes between requests, which causes long
  pauses. The server sets one fixed value (`NUM_CTX`) on every request. Don't vary it.
- Requests send `think: false` so reasoning models don't spend time on hidden tokens.
- Temp Check uses its own model (`TEMP_MODEL`), because instruction-tuned models differ
  hugely in how much their answers spread out as temperature rises. Some barely change.
- At high temperature models glue junk onto words. `looksLikeWord` in `server/words.js`
  filters machine replies; it only catches the obvious cases, by design.
- Temp Check compares whole words, never tokens. Always normalise with
  `server/words.js` before comparing.
- p5.js 2.x delivers touch input through `mousePressed`, `mouseDragged` and
  `mouseReleased`. There are no `touchStarted` handlers.
- Temp Check state lives in `server/game.js`. Pages only display it, which is why
  refreshing a page or reconnecting a phone resumes the current phase.

## Testing

There is no committed test suite. To check a change, run `npm start`, which reports whether
Ollama and the models are ready, and try the pages in a browser, including the host screen
at `/host` and Activity 03 in a second window. Logic that is easy to get subtly wrong
(scoring, game phases, request validation) is worth testing with Node's built-in `node:test`
runner.

## Working with git

Don't commit or push unless asked. Keep personal notes and assistant settings in the
files `.gitignore` already excludes (`HANDOFF.md`, `CLAUDE.md`, `.claude/` and similar).
