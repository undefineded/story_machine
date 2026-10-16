---
name: story-to-speech
description: 将多角色故事清单转换为 MiMo TTS 分段 WAV，并用 FFmpeg 合并为完整故事音频。
---

# 故事转语音

将故事拆分为旁白和角色片段，为每个角色配置稳定音色，逐段调用 Node.js TTS 脚本生成 WAV，检查片段后合并为完整音频。

## 前置条件

- 在项目目录执行命令。
- Node.js 20 或更高版本。
- 项目依赖已通过 `npm install` 安装，包括 `openai` 和 `https-proxy-agent`。
- `ffmpeg` 已安装并可执行。
- MiMo API 凭据通过 `MIMO_API_KEY` 环境变量或项目支持的本地配置提供。绝不把密钥写入技能、故事清单、日志或提交内容。
- 使用仓库已有 checkout，不创建额外 worktree。

## 故事清单格式

故事清单通常位于 `stories/*.json`，包含 `roles` 和有序片段。每个角色至少包含显示名及音色配置；旁白可使用固定预置音色，其他角色可使用 voicedesign 和 `voicePrompt`。

每个片段至少包含：

- `id`：建议使用 `001`、`002` 这类三位编号。
- `role`：必须对应 `roles` 中的角色 ID。
- `text`：实际朗读文本，不要加入角色名、备注或舞台说明。
- `direction`：可选的情绪和表演指导。
- `pauseAfterMs`：可选的片段后停顿，单位为毫秒。

说话人改变时必须拆分片段；明显的情绪变化或过长文本也应拆分。每个说话人（包括旁白）必须在其现有的 `voicePrompt`、`voiceDesc` 或 `style` 描述中明确写出单一的性别和年龄，并保留原有的身份、音高、音色、语速、情绪和普通话要求；不得只新增独立的 `gender` 或 `age` 字段来替代、删减或覆盖既有描述。禁止使用“混合性别”“混合音色”“群体声线”“男女均可”等不固定的设定；即使角色代表一群动物，也必须指定一个单一、固定、可复现的声线。结构化 `gender` 与 `age` 字段可以作为补充，但生成语音时仍须使用包含全部设定的完整描述。上述要求写入说话人配置，不得混入 `text`。

## 生成流程

项目现已提供 `synthesize-story.js` 编排脚本和 `package.json`。`mimo-tts.js` 是库模块，不提供命令行入口；它导出 `generateTts()`。将上传的 `mimo-tts.js` 放在仓库根目录后执行：

```bash
npm install
npm run story -- story_config
```

编排脚本应当校验清单，合并角色音色提示与片段指导，并调用：

```js
import { generateTts } from "./mimo-tts.js";

await generateTts({
  text: segment.text,
  voicePrompt: `${role.voicePrompt}\n${segment.direction ?? ""}`,
  outputPath: clipPath,
  format: "wav",
  model: role.model ?? "mimo-v2.5-tts-voicedesign",
  voice: role.voice,
});
```

`generateTts()` 会调用 MiMo、解码返回的 Base64 音频并原子写入目标文件。它支持 `wav` 和 `pcm16`，默认模型为 `mimo-v2.5-tts-voicedesign`，默认 API 地址为 `https://api.xiaomimimo.com/v1`，并为请求设置 120 秒超时和最多两次重试。编排脚本应按片段 ID 和角色 ID 写入 `clips/`，再次运行时复用非空已有片段；全部重生成时使用：

Node.js 客户端通过 `HTTPS_PROXY` 使用云环境代理；不要删除该代理配置，也不要把代理地址写入项目文件。

```bash
npm run story -- stories/<story-file>.json --force
```

编排脚本支持 `--force` 强制重新生成全部片段：

```bash
npm run story -- story_config --force
```

它读取仓库现有的 `speakers` 和 `segments` 字段，逐段生成 `audio/<title>/clips/`，默认在片段之间插入 350 ms 静音，并输出完整 WAV、`concat.ffconcat` 和 `synthesis-report.json`。上传的 `mimo-tts.js` 需要保存为仓库根目录的同名文件，并安装其 `openai` 依赖。

## MiMo 配置

优先通过环境变量提供凭据：

- `MIMO_API_KEY`：API 密钥。
- `MIMO_BASE_URL`：可选的 OpenAI 兼容 API 地址。
- `MIMO_CONFIG_PATH`：可选的本地 JSON 配置路径。

本地配置 JSON 只允许包含 `apiKey` 和 `baseURL`。不要把真实密钥提交到 Git、写入 `SKILL.md`、故事 JSON、shell 历史或日志。执行前检查变量名称和存在性，不输出变量值。

## 生成后的检查

逐段试听并对照清单，确认没有漏字、重复、自行补充、错误角色、异常发音、噪声或不自然衔接。检查片段文件名、编号和角色是否一致；必要时只删除对应 WAV，再不带 `--force` 重跑该片段。

脚本应生成类似以下结果：

```text
output/<story-name>/
├── clips/
├── silence/
├── concat.ffconcat
├── synthesis-report.json
└── <story-name>.wav
```

最终合并音频应为 24 kHz、单声道、16-bit PCM WAV。完整试听一次，确认顺序、停顿、音量、衔接以及开头和结尾均正常。

## 交付物提交约束

完成音频任务后，必须确认并提交原始 `故事.txt`、对应的 `故事分镜.json`、`音频分镜.json`、所有音频碎片 `*.wav` 以及完整故事 `*.wav`。音频和分镜 JSON 必须保存到仓库目录，不能只留在临时目录或对话附件中；检查文件非空、格式正确后，全部纳入 Git 提交。只有 `node_modules/`、本地密钥配置和明确的缓存文件可以加入 `.gitignore`。

## 当前仓库的输入

仓库根目录已有 `story_config` 和四个中文故事文本文件。`story_config` 是有效 JSON，包含角色、模型、音色描述和 71 个片段；它使用 `title`、`speakers`、`segments` 字段，与本文档描述的 `stories/*.json` 格式不同。使用现有配置时，应先让 Node.js 脚本适配这一字段结构，或生成一个不修改原始内容的临时故事清单。

