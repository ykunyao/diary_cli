# diary

> 命令行日记工具 — 在终端里记录日常

## 安装

```bash
git clone git@github.com:ykunyao/diary_cli.git
cd diary_cli
npm install
npm run build
npm link
```

## 使用

```bash
# 写日记（自动加时间戳）
diary add 今天学了 Rust 的所有权机制 有点绕但很有意思

# 查看今天日记
diary today

# 查看所有日记
diary list

# 查看某天的日记
diary read 2026-05-01

# 搜索关键词（支持中文，大小写不敏感）
diary search Rust

# 统计数据
diary stats

# 用系统编辑器打开今天日记
diary edit

# 随机回顾一篇旧日记
diary random

# 日历视图（写了日记的日期标绿）
diary calendar
diary calendar 2026-04

# 导出所有日记
diary export md
diary export html

# 记心情
diary add --mood 😊 今天心情不错

# 看心情统计
diary mood stats

# 写日记带标签
diary add "学了 Rust 所有权 #学习 #Rust"

# 查看所有标签
diary tags

# 按标签筛选
diary list --tag 学习

# 周报视图
diary weekly
diary weekly 2026-04-27

# 撤回上一条
diary undo
diary undo 3

# 查看/修改配置
diary config
diary config set editor code
```

所有日记保存在 `notes/` 目录下，每天一个 Markdown 文件。

## 配置

配置文件 `~/.diaryrc.json`（Windows: `%USERPROFILE%\.diaryrc.json`）：

```json
{
  "notesDir": "F:/Note_CLI/notes",
  "timezone": "Asia/Shanghai",
  "editor": "auto"
}
```

可通过 `diary config set <key> <value>` 修改。

## 技术栈

- TypeScript
- Commander.js（命令行参数解析）
- chalk（终端彩色输出）

## License

ISC
