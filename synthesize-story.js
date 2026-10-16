import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { generateTts } from "./mimo-tts.js";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function nonEmpty(file) {
  try { return (await stat(file)).size > 0; } catch { return false; }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateClip(options, attempts = 10) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await generateTts(options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(`TTS attempt ${attempt}/${attempts} failed; retrying: ${error.message}`);
        await delay(attempt * 3000);
      }
    }
  }
  throw lastError;
}

const configPath = process.argv[2] ?? "story_config";
const force = hasFlag("force");
const config = JSON.parse(await readFile(configPath, "utf8"));
if (!config.title || !config.outputDir || !Array.isArray(config.segments)) throw new Error("story config requires title, outputDir and segments");

const safeTitle = config.title.replaceAll(/[\\/:*?"<>|]/g, "_");
const limit = Number(arg("limit", config.segments.length));
if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
const segments = config.segments.slice(0, limit);
const outputDir = path.resolve(arg("output-dir", config.outputDir), safeTitle);
const clipsDir = path.join(outputDir, "clips");
const silenceDir = path.join(outputDir, "silence");
await mkdir(clipsDir, { recursive: true });
await mkdir(silenceDir, { recursive: true });

const files = [];
const report = { title: config.title, segments: segments.length, generated: 0, reused: 0, clips: [] };
for (const [index, segment] of segments.entries()) {
  const speaker = config.speakers?.[segment.speaker];
  if (!speaker) throw new Error(`segment ${segment.id} references unknown speaker: ${segment.speaker}`);
  const id = String(segment.id ?? index + 1).padStart(3, "0");
  const role = segment.speaker.replaceAll(/[\\/:*?"<>|]/g, "_");
  const clip = path.join(clipsDir, `${id}-${role}.wav`);
  if (!force && await nonEmpty(clip)) {
    report.reused++;
  } else {
    await generateClip({
      text: segment.text,
      voicePrompt: [speaker.voiceDesc ?? speaker.style ?? "自然、清晰地朗读提供的文本。", segment.direction].filter(Boolean).join("\n"),
      outputPath: clip,
      format: "wav",
      model: speaker.model,
      voice: speaker.voice,
    });
    report.generated++;
  }
  files.push(clip);
  report.clips.push({ id: segment.id, speaker: segment.speaker, text: segment.text, path: clip });
  const pause = Number(segment.pauseAfterMs ?? 350);
  if (pause > 0) {
    const silence = path.join(silenceDir, `${id}.wav`);
    await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(pause / 1000), "-c:a", "pcm_s16le", silence]);
    files.push(silence);
  }
}

const concat = path.join(outputDir, "concat.ffconcat");
const lines = ["ffconcat version 1.0", ...files.map(file => `file '${path.resolve(file).replaceAll("'", "'\\''")}'`)];
await writeFile(concat, `${lines.join("\n")}\n`);
const finalPath = path.join(outputDir, `${safeTitle}.wav`);
await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concat, "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", finalPath]);
report.outputPath = finalPath;
report.bytes = (await stat(finalPath)).size;
await writeFile(path.join(outputDir, "synthesis-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, outputPath: finalPath, generated: report.generated, reused: report.reused }, null, 2));
