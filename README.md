# Machine Madlibs

Workshop activities for **field:work (Lab #2)**, a jo+kapi event. Write with a language model, make visual poetry from its words, then play a game that shows what the "temperature" setting really does.

Everything runs on one computer. The language model runs locally through [Ollama](https://ollama.com), so nothing is sent to the internet. Other people join from their own phones, tablets and laptops over Wi-Fi, without installing anything.

## The activities

| Activity | What you do |
|---|---|
| **01 Micro-fictions** | Take turns with the machine writing a story, one sentence each. Draw wild cards for twists. The story runs to 350 words, then you can download it. |
| **02 Visual Poetry** | Ask for words on a theme, drag them around a canvas, style them (colours can be described in plain language), then download the image or send it to the shared screen. |
| **03 Temp Check** | Everyone types one word to complete a sentence while the machine does the same 20 times. Play to match the machine, or to beat it, and watch what raising the temperature does. At high temperatures the machine sometimes produces garbled text; the app filters it out and the host screen says how many replies were thrown out. |

Every page has a **Peek at the system prompt** panel that shows the real instructions and settings the machine is given.

---

## Quick start: run it yourself

You need three things: **Node.js**, **Ollama**, and **this project**. This takes about 15 minutes, mostly waiting for a download.

You'll type a few commands into a terminal. On a Mac, open the app called **Terminal**. On Windows, open **PowerShell**.

### 1. Install Node.js

Download the **LTS** version from [nodejs.org](https://nodejs.org) and run the installer. Then check it worked:

```bash
node --version
```

It should print `v20.12` or higher.

### 2. Install Ollama and download the models

Download Ollama from [ollama.com/download](https://ollama.com/download) and run it. Then, in the terminal, download the two models the app uses (about 16 GB in total, so this takes a while). One writes and makes poetry, the other plays Temp Check:

```bash
ollama pull mistral-small:24b
ollama pull llama3.2
```

**Short on space or memory?** Download only `llama3.2` (about 2 GB) and use it for everything: create a file named `.env` in the project folder containing the line `MODEL=llama3.2` (see [Settings](#settings)). The writing is plainer than with the larger model, but everything works.

### 3. Get the project

Either [download the ZIP](https://github.com/jo-kapi/machine_madlibs-fieldwork/archive/refs/heads/main.zip) and unzip it, or, if you use git:

```bash
git clone https://github.com/jo-kapi/machine_madlibs-fieldwork.git
```

### 4. Install and start

In the terminal, go into the project folder (the one containing this README), then:

```bash
npm install
npm start
```

`npm install` is only needed the first time. When it's running you'll see the web addresses to use.

### 5. Open it

Go to [http://localhost:3000](http://localhost:3000). Enter your name and you're in.

To stop the app, press `Ctrl+C` in the terminal.

**Want a friend on your Wi-Fi to join?** Give them the address `npm start` prints under "Participants join".

### If something goes wrong

| Problem | Try this |
|---|---|
| `Can't reach Ollama` | Open the Ollama app, or run `ollama serve` in another terminal window. |
| `Model … isn't installed` | Run the `ollama pull` command from step 2. |
| `Port 3000 is already in use` | Another program is using it. Add a line `PORT=3001` to a file named `.env` (see [Settings](#settings)) and start again. |
| Replies are very slow | The first reply after starting loads the model into memory. Later ones are quicker. A smaller model also helps (see [Settings](#settings)). |
| The page says it can't reach the server | Make sure the terminal running `npm start` is still open. |
| Nothing happens in Activity 03 | It's a group game. The host starts it from the host page (see below), so on your own, open `http://localhost:3000/host` in one window and Activity 03 in another. |

---

## Facilitator guide

### Before the event

1. **Install and pull the model** as above, on the computer that will host (ideally a recent Apple Silicon Mac or a machine with a good GPU).
2. **Start Ollama with two settings**, so the model stays in memory and can answer several people at once. Quit the Ollama app first, then in a terminal:

   ```bash
   OLLAMA_KEEP_ALIVE=-1 OLLAMA_NUM_PARALLEL=4 OLLAMA_MAX_LOADED_MODELS=2 ollama serve
   ```

   On Windows PowerShell, set them first with `$env:OLLAMA_KEEP_ALIVE="-1"` and so on, then run `ollama serve`.
   Start with `OLLAMA_NUM_PARALLEL=4`, then raise it if the load test below shows slow replies. Keep `MAX_PARALLEL` in your `.env` the same number.
3. **Settle the network.**
   - Everyone must be on the same Wi-Fi as the host computer, and the Wi-Fi must allow devices to talk to each other. Some venues block this, so test it.
   - Ask the venue to reserve a fixed IP address for the host computer (a "DHCP reservation"), so the address on your slides can't change.
   - Fallback: bring your own router, or turn on a hotspot on your phone and join the host computer to it.
   - If the address printed by `npm start` isn't the right one, set `PUBLIC_URL` in `.env`.
4. **Run the pre-flight check:**

   ```bash
   npm run check
   ```

   It confirms Ollama and the model are ready, warms the model up, and prints the address people will join at.
5. **Run the load test** (with `npm start` running in another terminal):

   ```bash
   npm run loadtest
   ```

   It pretends to be 20 people using every activity at once and prints how long replies took. Temp Check results should appear within about 3 seconds of the clock stopping.
6. **Try it on real devices.** Join from at least one phone and one laptop, and check that the phone **cannot** open `http://<host-address>:3000/host`.
7. Keep the host computer **plugged in, awake, and with the screen saver off**.

### Running the session

Start the app on the host computer with `npm start`. Participants type in the address it prints. The first time they open any page they enter a name and, optionally, pronouns. They join the Temp Check game by opening **Activity 03**, and appear on the host screen as they arrive.

On the host computer, open **`http://localhost:3000/host`** and put it on the projector. This page only works on the host computer.

**Host screen controls**

| Key | Does |
|---|---|
| `Space` | Next step: start the round, start the clock, show results, next round |
| `↑` / `→`, `↓` / `←` | Raise or lower the temperature by 0.1 (hold `Shift` for 0.5) before the clock starts |
| `R` | Redo the current round (same sentence, new answers) |
| `P` | Show the system prompt and settings on screen |
| `G` / `T` | Switch between the gallery and Temp Check |
| `F` | Full screen |

Temp Check runs about twelve rounds, ending with a finale where everyone's Hot and Cold taps set the temperature together. The bottom of the host screen has buttons for the same controls, plus **Restart game**.

**Gallery.** Participants press **Send to screen** in Activity 02. Their poem appears in the host's gallery with their name and pronouns. Press `G`, then `Enter` or click to enlarge, the arrow keys to browse, and `Delete` to remove one.

**If someone's phone drops out** they reconnect on their own and land back in the current round. If the host page is refreshed it picks up where the game is.

### Changing the content

| To change | Edit |
|---|---|
| Wild cards for Activity 01 | `public/data/wildcards.json` (`human` is shown to the writer, `ai` is the twist given to the machine) |
| Temp Check sentences | `public/data/stems.json` (use `___` for the blank) |
| Temp Check rounds, temperatures, timer and scoring mode | `public/data/rounds.json` |
| What the machine is told | `server/prompts.js` |
| Colours and fonts | `public/css/tokens.css` (the font files are in `public/css/fonts/`) |

The data files are read each time a game starts or a card is drawn, so you don't need to restart the server. Restart the game from the host page to pick up changes to the rounds or stems.

### Privacy

- Nothing is saved to disk. Names, pronouns, images and scores live in the server's memory and disappear when you stop it.
- Pronouns are shown only next to a poem in the gallery, never on the leaderboard, and are never logged.
- Participants' devices never talk to Ollama directly, and they can't change the prompts or settings the machine is given.
- The app makes no requests to the internet while running.

---

## Settings

Settings go in a file named `.env` in the project folder. Copy `.env.example` to `.env` and edit it. Every setting is optional.

| Setting | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port the app listens on. |
| `MODEL` | `mistral-small:24b` | The Ollama model for Activities 01 and 02 (writing, poetry, colours). Run `ollama pull <model>` first. |
| `TEMP_MODEL` | `llama3.2` | The Ollama model for Activity 03. It's separate because Temp Check needs a model whose answers visibly spread out as temperature rises. Set it equal to `MODEL` to use one model for everything. |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Where Ollama is listening. |
| `PUBLIC_URL` | detected | The address shown to participants instead of the detected one, for example `http://192.168.100.100:3000`. |
| `MAX_PARALLEL` | `4` | How many requests run at once. Match Ollama's `OLLAMA_NUM_PARALLEL`. |
| `MAX_QUEUE` | `100` | How many may wait before new ones are refused. |
| `REQUEST_TIMEOUT_MS` | `60000` | How long to wait for one reply. |
| `NUM_CTX` | `4096` | Context window per request. Keeps memory use low. |
| `GOOGLE_FORM_URL` | none | A link shown at the end of Temp Check. |

---

## How it works

The browser pages never talk to Ollama. A small [Express](https://expressjs.com) server sits in between: it serves the pages, holds each activity's system prompt, limits how many requests run at once, tidies up the machine's replies, and keeps the Temp Check game in memory. Live updates in Temp Check use server-sent events, so a phone that loses Wi-Fi catches up when it reconnects.

```
public/            Pages for participants
  index.html         Join screen (name and pronouns)
  activity_01.html   Micro-fictions
  activity_02.html   Visual Poetry
  activity_03.html   Temp Check (player screen)
  css/, js/          Styles (design tokens in css/tokens.css) and scripts
  data/              Wild cards, Temp Check stems and rounds
host/              The host screen and gallery (served to the host computer only)
server/            The Node server
  prompts.js         The system prompts and settings the machine is given
  game.js            The Temp Check game
scripts/           check.mjs (pre-flight) and loadtest.mjs
```

Handy commands:

| Command | Does |
|---|---|
| `npm start` | Start the app |
| `npm run dev` | Start the app and restart it when code changes |
| `npm run check` | Pre-flight check |
| `npm run loadtest` | Simulate a full room |

## Contributing

Issues and pull requests are welcome. [`AGENTS.md`](AGENTS.md) describes how the code is organised and the conventions it follows, for people and AI coding assistants alike.

## License

[GNU General Public License v3.0](LICENSE).

## Credits

- Created by [Kapilan Naidu](https://github.com/kapilan-naidu).
- Made for **field:work (Lab #2)**, a jo+kapi event.
- Built with [Ollama](https://ollama.com), [Express](https://expressjs.com), and [p5.js](https://p5js.org).
