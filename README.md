# LL Video Progress

独立的视频章节进度条 Skill，包含五款样式、专用 Playground、内置走路人物及透明 MOV 导出。无需 Video Motion 或 Remotion 仓库。

## 使用流程

提供 SRT → 确认分段及原话范围 → 确认视频比例（4:3 / 16:9 / 3:4）→ Playground 按名称选样 → 必要时选择自定义人物 → 生成并检查透明 MOV。

## 环境

Node.js 18+、Python 3.10+、Pillow、ffmpeg / ffprobe，以及中文字体（Windows 默认微软雅黑）。

```powershell
git clone https://github.com/liuliu-66-create/ll-video-progress.git
cd ll-video-progress
py -m pip install -r requirements.txt
node scripts/playground_server.mjs
```

打开终端返回的地址，默认 http://127.0.0.1:4174/index.html?category=progress。页面支持颜色设置；新增三款支持字号设置。预览底色不导出，交付窄条 ProRes 4444 MOV。

## 样式

朦胧白底、人物领走、圆点连线、分段短线、文字领走。

## 安装 Skill

将本仓库整体放入 Agent 的 skills/ll-video-progress 目录，或将其映射到该位置。SKILL.md 是入口；本仓库同时包含 Playground，因此安装时请保留完整目录。

详细流程见 [SKILL.md](SKILL.md)，配置和生成命令见 [rendering.md](references/rendering.md)。

```powershell
node scripts/check_catalog.mjs
py -B scripts/test_progress.py
```
