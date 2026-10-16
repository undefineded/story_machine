import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { HttpsProxyAgent } from "https-proxy-agent";

const DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1";
const DEFAULT_MODEL = "mimo-v2.5-tts-voicedesign";

async function configFile(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

export async function generateTts({ text, voicePrompt, outputPath, format = "wav", model = DEFAULT_MODEL, voice, timeoutMs = 120000 } = {}) {
  if (!text?.trim() || !voicePrompt?.trim()) throw new TypeError("text and voicePrompt are required");
  if (!["wav", "pcm16"].includes(format)) throw new TypeError("format must be wav or pcm16");
  const local = await configFile(path.resolve(process.env.MIMO_CONFIG_PATH ?? "config.local.json"));
  const client = new OpenAI({
    apiKey: process.env.MIMO_API_KEY ?? local.apiKey,
    baseURL: process.env.MIMO_BASE_URL ?? local.baseURL ?? DEFAULT_BASE_URL,
    timeout: timeoutMs,
    maxRetries: 2,
    httpAgent: process.env.HTTPS_PROXY ? new HttpsProxyAgent(process.env.HTTPS_PROXY) : undefined,
  });
  const audio = { format };
  if (voice) audio.voice = voice;
  if (model === DEFAULT_MODEL) audio.optimize_text_preview = true;
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: voicePrompt }, { role: "assistant", content: text }],
    audio,
  });
  const data = completion?.choices?.[0]?.message?.audio?.data;
  if (!data) throw new Error("MiMo response did not contain audio data");
  const bytes = Buffer.from(data, "base64");
  const destination = path.resolve(outputPath ?? path.join("output", `tts-${Date.now()}.${format === "pcm16" ? "pcm" : format}`));
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, bytes, { flag: "wx" }); await rename(temporary, destination); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
  return { ok: true, outputPath: destination, bytes: bytes.length, format, model, voice: voice ?? null, requestId: completion.id ?? null };
}
