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
```

所有日记保存在 `notes/` 目录下，每天一个 Markdown 文件。

## 技术栈

- TypeScript
- Commander.js（命令行参数解析）
- chalk（终端彩色输出）

## License

ISC
