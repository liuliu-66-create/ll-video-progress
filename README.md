# LL Video Progress

独立的视频章节进度条 Skill，包含五款样式、专用 Playground、内置走路人物及透明 MOV 导出。无需 Video Motion 或 Remotion 仓库。

## 使用流程

字幕仅使用用户在当前对话上传或明确指定路径的 SRT；未提供时先索要并等待，不自动搜索本机或历史项目。

提供 SRT → 确认分段及原话范围 → 确认视频比例（4:3 / 16:9 / 3:4）→ Playground 按名称选样 → 必要时选择自定义人物 → 生成并检查透明 MOV。

## 环境

Node.js 18+、Python 3.10+、Pillow、ffmpeg / ffprobe，以及中文字体（Windows 默认微软雅黑）。

```powershell
git clone https://github.com/liuliu-66-create/ll-video-progress.git
cd ll-video-progress
py -m pip install -r requirements.txt
node scripts/playground_server.mjs
```

打开终端本次返回的 `progressUrl`，默认从 4174 端口开始。脚本会复用已运行的同版本进度条服务；遇到其他程序或旧版本占用时自动尝试后续端口，不关闭已有程序。拉取新版后请重新运行启动命令并使用新返回的链接，避免继续打开旧页面。需要指定起始端口时使用 `LL_VIDEO_PROGRESS_PLAYGROUND_PORT`。页面支持颜色设置；新增三款支持字号设置。预览底色不导出，交付窄条 ProRes 4444 MOV。

## 样式

朦胧白底、人物领走、圆点连线、分段短线、文字领走。

## 安装 Skill

将本仓库整体放入 Agent 的 skills/ll-video-progress 目录，或将其映射到该位置。SKILL.md 是入口；本仓库同时包含 Playground，因此安装时请保留完整目录。

详细流程见 [SKILL.md](SKILL.md)，配置和生成命令见 [rendering.md](references/rendering.md)。

```powershell
node scripts/check_catalog.mjs
node scripts/test_playground_server.mjs
py -B scripts/test_progress.py
```

## 本机个人默认人物

选带人物的样式时，首次自定义并确认走路效果后，可保存为以后自动沿用的人物；无人物样式不触发这个流程。原图、动作帧和配置保存在安装目录的 `user-data/characters/`，已被 Git 忽略，不上传 GitHub。更新或重装时保留该目录。详情见 [characters.md](references/characters.md)。
