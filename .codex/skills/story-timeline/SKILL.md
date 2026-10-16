---
name: story-timeline
description: 根据故事音频分镜、插画分镜和实际 WAV 时长，生成插画出现时间轴 JSON 与 LRC 文件。
---

# 故事插画时间轴

将已经生成的故事音频与插画绑定，计算每张插画在完整音频中的开始时间、结束时间和持续时长。输出 JSON 供 HTML、播放器或其他程序使用，同时输出类似歌词的 LRC 文件，便于人工查看或简单播放器读取。

## 适用范围

使用本 skill 的前提是故事目录中已经存在：

- 故事文本，例如 `故事名-新.txt`；
- 插画分镜 JSON，例如 `故事名-新.分镜.json`；
- 音频分镜 JSON，例如 `故事名-新.音频分镜.json`；
- 完整故事 WAV，例如 `音频/故事名/故事名.wav`；
- 每段角色音频，例如 `音频/故事名/clips/001-旁白.wav`；
- 每段停顿音频，例如 `音频/故事名/silence/001.wav`。

如果只有完整 WAV 而没有分段 WAV，不能准确推算每张插画的边界；应先补齐分段音频，或明确标注为估算时间轴。

## 输入和映射规则

1. 先读取完整的插画分镜 JSON，确认插画数量、顺序、`summary`、`originalText` 和画面叙事范围。
2. 再读取完整的音频分镜 JSON，确认所有片段的编号、文本、说话人和顺序。
3. 按故事情节将连续的音频片段映射到插画。每个插画必须对应一个或多个连续的 `audioSegments`，不能跳号或交叉复用。
4. 映射应优先依据插画分镜的 `originalText` 和 `summary`，使画面与正在讲述的内容一致。
5. 如果音频中有插画 JSON 未单独表现的过渡内容，应归入最相关的相邻插画，并在该插画的 `summary` 中说明，不得丢弃音频内容。
6. 第一张插画必须从 `00:00.00` 开始，最后一张插画必须覆盖到完整音频结束；相邻插画之间不得有空隙或重叠。

## 时长计算

每个音频段的实际占用时间为：

```text
segmentDuration = duration(clips/NNN-role.wav) + duration(silence/NNN.wav)
```

按编号从 001 累加：

```text
start(001) = 0
end(n) = start(n) + segmentDuration(n)
start(n+1) = end(n)
```

必须使用 WAV 文件的实际时长，不要根据文字字数、默认语速或 `pauseAfterMs` 手工估算。可用 `ffprobe` 检查每个文件：

```bash
ffprobe -v error \
  -show_entries format=duration \
  -of default=nw=1:nk=1 path/to/file.wav
```

时间显示统一使用 `MM:SS.xx`，其中 `xx` 是百分之一秒；JSON 中的 `duration` 和总 `duration` 保留秒数，建议保留两位小数。累计计算时可以保留毫秒或更高精度，最终显示时再四舍五入，避免中间步骤累计误差。

## JSON 输出格式

保存为故事目录下的 `故事名-新.插画时间轴.json`：

```json
{
  "title": "故事名",
  "audio": "音频/故事名/故事名.wav",
  "duration": 975.2,
  "durationFormatted": "16:15.20",
  "timingBasis": "根据正式音频分段 WAV 与停顿文件的实际时长累计计算；每张插画对应连续的音频分段。",
  "items": [
    {
      "panel": "01",
      "image": "插画/01.png",
      "start": "00:00.00",
      "end": "00:20.35",
      "duration": 20.35,
      "audioSegments": [1, 2],
      "summary": "该插画对应的主要叙事内容"
    }
  ]
}
```

要求：

- `items` 数量必须等于插画分镜 JSON 的 panel 数量；
- `panel` 使用两位序号，和 `插画/01.png` 等文件一致；
- `audioSegments` 使用音频分镜中的数字编号；
- 所有音频片段编号必须恰好出现一次；
- `items[0].start` 必须是 `00:00.00`；
- 最后一个 `end` 必须等于完整 WAV 的实际时长；
- `duration` 应等于 `end - start`，允许最后显示位的四舍五入误差；
- `image` 使用相对于故事目录的路径，不能写成本机绝对路径。

## LRC 输出格式

同时保存为 `故事名-新.插画时间轴.lrc`。每行代表一张插画的开始时间：

```text
[00:00.00]01.png | 第一张插画的简短说明
[00:20.35]02.png | 第二张插画的简短说明
```

LRC 的时间点必须与 JSON 中对应 item 的 `start` 完全一致。LRC 不单独记录结束时间，播放器应使用下一行的时间作为当前插画的结束时间，最后一张使用完整音频时长。

## 校验清单

生成后必须检查：

```bash
jq empty 故事名-新.插画时间轴.json
ffprobe -v error -show_entries format=duration 故事目录/音频/故事名/故事名.wav
find 故事目录/插画 -maxdepth 1 -name '*.png' | wc -l
find 故事目录/音频/故事名/clips -maxdepth 1 -name '*.wav' | wc -l
```

还要程序化确认：

- 插画数量、JSON `items` 数量和 LRC 行数相同；
- `audioSegments` 覆盖音频分镜的全部编号且没有重复；
- 每个 item 的 `start` 等于前一个 item 的 `end`；
- 起点为零，终点等于完整 WAV 时长；
- 所有 WAV 非空，完整 WAV 为 24 kHz、单声道、16-bit PCM；
- 插画文件和音频文件均位于故事目录内。

## 交付和提交

时间轴 JSON、LRC、故事文本、插画分镜 JSON、音频分镜 JSON、全部插画和音频产物都必须保存在 Git 仓库中。不要提交 `node_modules/`、密钥、本地配置或缓存。完成校验后按项目约定提交并推送到 `main` 分支。
