# HANDOFF — Machine Madlibs for field:work (Lab #2)

> Written for Claude Code. Read this whole file before touching code. Where something is marked **ASK**, stop and ask Kapi instead of guessing. Delete or gitignore this file once the work is done.

## 1. Context

- **Event:** field:work (Lab #2), a jo+kapi event. Kapi (Kapilan Naidu) runs this workshop **solo**.
- **This repo:** the Machine Madlibs web app from "School of Alternate Internets" (SOAI 2025, hosted by Feelers). It is being adapted, not rewritten.
- **Run of show: 1h45 total** (original was 2h40):
  - Welcome / bio / objectives / warm-up Q&A / connect: ~12 min
  - Lecture: ~25 min
  - Activity 1, Micro-fiction: ~18 min
  - Activity 2, Visual Poetry: ~18 min
  - Show and tell of Visual Poetry (via in-app gallery): ~8 min
  - Activity 3, **Temp Check** (new): ~20 min
  - Close: ~4 min
- **Audience:** artists and designers, not developers. 18 signups, ~10–12 expected, **design for 20**.
- **Devices:** BYOD, phones and laptops. **Participants install nothing.** They join over the venue Wi-Fi by opening `http://<host-ip>:<port>` (currently `192.168.100.100`) served from Kapi's laptop.
- **Host machine:** MacBook Pro M2 Max, 96 GB RAM, running Ollama locally. Venue Wi-Fi allows device-to-device traffic (confirmed).
- **Slides are done** and are not part of this task. The deck tells participants: instructions live **in the app**, wild cards are **in the app**, and the quick-start guide is **this repo's README**.

## 2. Current code (as found)

```
public/
  activity_01.html, activity_02.html
  css/ normalize.css layout.css activity-01.css activity-02.css
  js/  config.js activity-01.js activity-02.js sketch.js p5.min.js
  images/ icon_bg.svg icon_text.svg icon_tile.svg
models/ mm_writer_modelfile  mm_poet_modelfile  mm_color_modelfile
README.md  LICENSE (GPL-3.0)
```

- Static site, served today with `python -m http.server` from `public/`.
- `js/config.js`: `const API = "http://localhost:11434/api/generate";`. Browsers call Ollama directly.
- **Three Ollama models** built from modelfiles: `mm_writer` (llama3.2), `mm_poet` and `mm_color` (both mistral). Each is just a base model plus a `SYSTEM` prompt.
- **Activity 1** (`activity-01.js`): `mm_writer` continues a story one sentence at a time. A hidden keyword `mm_writer_start` makes it open a new story. 200-word cap. "Download Text" exports a `.txt`. Story state is kept by parsing `innerHTML` back into text.
- **Activity 2** (`activity-02.js`, `sketch.js`): `mm_poet` returns 8 comma-separated words (or, for the keyword `mm_filler_words`, 5 articles/prepositions). Words become draggable tiles on a p5 canvas. `mm_color` turns a colour description into a hex code. Controls: canvas bg, text colour, tile bg, 5 sizes, serif/sans toggle. "Download Image" exports a PNG.

## 3. Decisions already made (do not relitigate)

| Decision | Why |
|---|---|
| Rebrand SOAI/Feelers to **field:work / jo+kapi** | New event |
| Activity 3 is called **"Temp Check"** | "Temperature check" pun, short |
| **One model for everything**; per-activity behaviour comes from system prompts **in code** (no modelfiles, no `ollama create`) | Simpler for Kapi; participants don't install anything |
| **Not gpt-oss** | Reasoning model, so hidden thinking tokens add latency across ~20 parallel requests, and temperature behaviour is muddier |
| Not Llama 4 | Smallest variant is ~67 GB; too heavy for 20 parallel requests alongside everything else |
| Model chosen by **taste test**, not specs (see 6) | Kapi prefers ChatGPT-style language quality; needs a blind read |
| Node server proxies Ollama and holds shared state | Fixes hard-coded `localhost`, CORS, and enables the group game |
| **In-app** instructions, wild cards and show-and-tell gallery | One place, no Notion |
| Identity (name + optional pronouns) collected **once at join**, reused | Kapi wants to address people properly |
| Post-session Google Form (made by Jo) is **out of scope** | Archive of stories and poems after the session |
| Nothing persisted to disk | Privacy; low risk with pronouns |

## 4. Task list

### 4.1 Rebrand
- Replace every SOAI / Feelers / "SOAI '25'" mention: README, `<title>` tags (e.g. "Machine Madlibs – SOAI '25' | Activity 01 – Micro-fictions"), README credits, repo name in clone instructions (currently `kapilan-naidu/machine_madlibs-soai`).
- New names: nav = **Activity 01 / Activity 02 / Temp Check**. Page titles: `Machine Madlibs – field:work | …`.
- Keep GPL-3.0 and Kapi's credit; add field:work / jo+kapi credit.
- **ASK:** new repo name/URL, and field:work visual identity (colours, type). Until then put design tokens in CSS custom properties so re-theming is one file.

### 4.2 Server (new)
- Small **Node** server (Express or Fastify, minimal deps). `npm start` does everything.
- Serves `public/`; binds `0.0.0.0`; prints the LAN URL(s) and a terminal QR code on start; also shows the QR on the host page lobby.
- **Proxy** `POST /api/generate` (or `/api/chat`) to Ollama at `127.0.0.1:11434`. Browsers must never call Ollama directly, so change `config.js` to relative paths. System prompts and options are **injected server-side** per activity, so clients cannot override them.
- **Concurrency limiter** in front of Ollama (e.g. p-limit), sized to `OLLAMA_NUM_PARALLEL`, with timeouts and clean error responses.
- **Realtime:** prefer **SSE + POST** (zero extra deps, reconnect-friendly). WebSocket is fine if you prefer. State lives in memory on the server; a dropped phone must be able to rejoin and resume.
- **Host page `/host` must only be reachable from localhost** (check the request IP), so a participant cannot take over the game.
- Config via env/`config` file: `PORT`, `MODEL`, `OLLAMA_URL`, `GOOGLE_FORM_URL` (optional, shown on a thank-you screen).

### 4.3 Single model + system prompts
- Replace the three modelfiles with three system prompts in code (writer, poet, colour) plus the Temp Check prompt. Port the existing text from `models/*_modelfile` first.
- Turn the magic keywords into explicit server modes: `mm_writer_start` → `mode: "start"`, `mm_filler_words` → `mode: "filler"`.
- Pass `think: false` (or the model's equivalent) if the chosen model has a thinking mode.
- Move `models/` out of the install path. It can stay under `legacy/` for people who want self-hosted modelfiles. **ASK** Kapi whether to keep it.
- Recommended Ollama env on the host: `OLLAMA_KEEP_ALIVE=-1`, `OLLAMA_NUM_PARALLEL` set deliberately (start at 4–8 and test), `OLLAMA_MAX_LOADED_MODELS=1`. Document in README.

### 4.4 Identity at join
- First-visit screen: **name (required)**, **pronouns (optional free text, may be blank)**. Store in `localStorage` and the server session; prefill later forms.
- Used for: Visual Poetry gallery captions (name + pronouns), Temp Check leaderboard (**name only**).
- Never log pronouns; never write them to disk; clear on server restart.
- Optional: a link to the post-session Google Form (`GOOGLE_FORM_URL`) with name/pronouns prefilled via URL params, if Kapi supplies the form's entry IDs.

### 4.5 Activity 1: Micro-fiction
- Keep the behaviour (alternating human/AI sentences, 200-word cap, "Download Text").
- **Wild cards in-app:** a "Draw a wild card" control. **ASK Kapi** for the card content and how a card should affect the story (twist instruction injected into the AI's turn? a prompt shown to the human?). Store cards in `public/data/wildcards.json` so he can edit them.
- **In-app instructions:** short collapsible panel. Placeholder copy is fine; Kapi will edit.
- **"Peek at the system prompt" toggle** (see 4.8).
- Fix while here: `options.max_tokens` is not an Ollama option on the native API (use `num_predict`), so the cap is currently ignored. Escape user text before inserting into the DOM (currently `innerHTML`). Prefer an array of messages as story state over parsing `innerHTML`.

### 4.6 Activity 2: Visual Poetry + show-and-tell gallery
- Keep behaviour. Add the in-app instructions panel and the peek toggle.
- Show an **on-page error** when generation fails (currently `console.error` only). The colour fallback to `#000000` is silent, so surface it.
- **"Send to screen" button:** exports the canvas PNG (downscale to ~1600 px longest side, cap payload ~5 MB), posts it with the participant's name and pronouns, and appears in the host gallery. Multiple submissions per person allowed. "Download Image" stays.
- **Host gallery** (`/host`, gallery view): grid, click to enlarge, next/prev with arrow keys, fullscreen, name + pronouns caption in small type, and a **host-only delete** button per item. In memory only (or a temp dir wiped on start).
- Verify touch support on phones: tile dragging in p5 and canvas sizing at phone widths.

### 4.7 Activity 3: Temp Check (spec)

**Pitch:** 20 people play individually together. The host screen shows a sentence stem and a temperature dial. Everyone types one word on their phone. The server asks the model for the same completion ~20 times at the dial's temperature, then reveals the distribution.

**Pages:** `/temp` (player, mobile-first) and `/host` (projector view; large type, high contrast). Join via the same QR/URL.

**Round state machine:** `LOBBY → INTRO (stem + temperature) → INPUT (10 s) → REVEAL → (LEADERBOARD every ~3 rounds) → next`. Start sampling **at the beginning of INPUT**, so results are ready when the timer ends. Target reveal ≤ 3 s after input closes. If sampling is slow, show "the machine is thinking…".

**Sampling:**
- N = 20 parallel requests per round, via the limiter.
- Prompt: system = "Complete the sentence with exactly one word. Output only that word, lowercase, no punctuation."; user = the stem.
- `options`: `temperature` = the dial, short `num_predict` (about 6, since some words span several tokens), and **disable top-p/top-k truncation** (`top_p: 1`, `top_k: 0`, or the model's equivalent) so that temperature does the visible work. Ollama's default top-k/top-p dampen the effect, so test that the spread visibly widens as temperature rises.
- At temperature 0 all samples should be (near-)identical. That's the point.
- **Normalise** words (lowercase, trim, strip punctuation, take the first word). Compare **whole words, never tokens**.
- If a request fails, drop it and show the actual N.

**Two modes, alternating:**
1. **Match ("be the machine"):** your score = % of the model's samples equal to your word.
2. **Beat ("beat the machine"):** 100 if neither the model's samples nor any other player said your word, otherwise 0. Ties handled by the same rule (anyone else typing it kills it).

**Stems:** two pools in `public/data/stems.json`. *Predictable* stems for Match (e.g. "Peanut butter and ___", "Once upon a ___", "Roses are red, violets are ___"). *Open* stems for Beat. Starter open stems:
- The last thing I expected to find in the fridge was ___
- The robot looked at the sunset and felt ___
- Nobody warned me the internet would become so ___
- At the end of the world, the last shop open sells ___
- In the future, all news will be written by ___
- The password was hidden inside a ___
- Poets and algorithms both love ___
- The ghost in the machine was actually just ___

**Default schedule** (`public/data/rounds.json`, editable): about 12 rounds. Early Match rounds step the temperature up (0 → ~0.7 → ~1.5) so the room feels the dial. Then Beat rounds at mixed temperatures. **Finale:** crowd-controlled temperature. Players tap Hot/Cold; the average maps to the dial; one last round. Keep the whole thing near 20 min.

**Host UI:** animated bar chart of the model's words with players' words dropping in; the dial; per-round points; leaderboard (top ~8, names only). Keyboard: space = next phase, arrows = set temperature manually, R = redo round. Show the join QR in the lobby.

**Player UI:** big input, countdown, then "your word / the machine said … X% / +points". Rejoin must resume the current phase.

### 4.8 "Peek at the system prompt" toggle
- On every activity page, a small toggle reveals the actual system prompt and the key sampling options (for Temp Check: the prompt, the current temperature, and top-k/top-p). Served from the server so it can't drift from what's really used. Supports the workshop's "critical awareness" goal and the slide on system instructions.

### 4.9 In-app instructions
- A short, collapsible instructions panel on each activity page. Draft sensible placeholder copy; **ASK** Kapi to review the wording.

### 4.10 Ops and docs
- **README rewrite**, two audiences:
  - *Facilitator:* run-the-workshop steps (`ollama pull <model>`, env vars, `npm start`, URLs, DHCP-reserve the laptop's IP, hotspot/own-router fallback, pre-flight checklist).
  - *Participant quick-start:* how to self-host afterwards. Slide 23 points here ("Quick-start guide available in the README"), so it must be clear and correct for non-developers.
- `npm run check` (pre-flight): Ollama reachable, model present, warm-up request, prints LAN IPs and the QR.
- `npm run loadtest`: simulates ~20 clients doing Activity 1/2 requests and a Temp Check round; reports latencies.

## 5. Model taste test (do this early; it decides `MODEL`)

`scripts/bakeoff.mjs`: for each candidate, run (a) 3 story openers × 3 turns at the writer temperature, and (b) 3 Temp Check stems × temperatures {0, 0.7, 1.5} × 20 samples. Write results to a markdown file with **candidate labels shuffled/anonymised** so Kapi can read blind. Also record latency for 20 parallel requests and memory use.

Candidates (verify exact tags with `ollama list` / ollama.com/library):
- **Gemma 4, 12B** (about 8 GB; has a thinking mode, so disable it)
- **Mistral Small 24B** (about 14 GB; non-reasoning, about a year old)
- **Llama 3.1 8B** (the safe fallback)

Selection criteria: language quality (Kapi's call), instruction-following with odd rules, and a distribution that visibly widens with temperature.

## 6. Privacy and data
- Nothing persisted to disk. Names, pronouns, submitted images and game state live in memory (images may use a temp dir wiped on start).
- No analytics, no third-party requests at runtime.
- Don't log user content or pronouns.
- Download buttons ("Download Text", "Download Image") stay. Participants use them to upload to the post-session Google Form, which is separate and out of scope.

## 7. Acceptance checklist
- [ ] `npm start` on the host Mac: one command; prints LAN URL and QR.
- [ ] From two real phones (iOS Safari and Android Chrome) and one laptop, on the venue-like router: join, enter identity, complete Activities 1, 2 and 3.
- [ ] No participant request reaches Ollama except through the server; clients cannot change system prompts or options.
- [ ] `/host` is not reachable from a phone.
- [ ] 20 simulated clients: no failures; Temp Check reveal ≤ 3 s after input closes.
- [ ] Dropping and rejoining a phone mid-round resumes cleanly.
- [ ] A refresh on the host page recovers the game state.
- [ ] No SOAI/Feelers strings remain (`grep -ri "soai\|feelers"`).
- [ ] README tells a non-developer how to run it themselves.

## 8. Open questions for Kapi (ASK, do not guess)
1. What are the **wild cards** (content and effect on the story)?
2. Final **model** after the taste test.
3. **Port** and whether the IP (`192.168.100.100`) is reserved on the router.
4. New **repo name/URL**, and whether to keep `legacy/` modelfiles.
5. field:work **visual identity** (colours, type) for the UI.
6. `GOOGLE_FORM_URL`, and the entry IDs if prefill is wanted.
7. Wording of the in-app **instructions**.
8. Confirm the **Temp Check** schedule, stems and scoring after a first playtest.
