// Loads and checks the Temp Check schedule (public/data/rounds.json) and the
// sentence stems (public/data/stems.json). Both are read each time a game
// starts, so edits apply without restarting the server.
import fs from "node:fs/promises";
import path from "node:path";
import { publicDir } from "./paths.js";

const dataDir = path.join(publicDir, "data");

async function readJson(name) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, name), "utf8"));
  } catch (error) {
    throw new Error(`Couldn't read data/${name}: ${error.message}`);
  }
}

export function validateSchedule(schedule, stems) {
  if (!Array.isArray(schedule.rounds) || schedule.rounds.length === 0) {
    throw new Error('rounds.json needs a non-empty "rounds" list.');
  }
  schedule.rounds.forEach((round, index) => {
    const label = `Round ${index + 1}`;
    if (round.mode !== "match" && round.mode !== "beat") {
      throw new Error(`${label}: mode must be "match" or "beat".`);
    }
    if (!Array.isArray(stems[round.pool]) || stems[round.pool].length === 0) {
      throw new Error(`${label}: stems.json has no stems for pool "${round.pool}".`);
    }
    const hasTemperature = typeof round.temperature === "number";
    if (!hasTemperature && !round.crowd) {
      throw new Error(`${label}: needs a temperature, or "crowd": true.`);
    }
  });
}

export async function loadSchedule() {
  const [schedule, stems] = await Promise.all([
    readJson("rounds.json"),
    readJson("stems.json"),
  ]);
  validateSchedule(schedule, stems);
  return {
    inputSeconds: schedule.inputSeconds ?? 10,
    sampleCount: schedule.sampleCount ?? 20,
    leaderboardEvery: schedule.leaderboardEvery ?? 3,
    maxTemperature: schedule.maxTemperature ?? 1.5,
    rounds: schedule.rounds,
    stems,
  };
}
