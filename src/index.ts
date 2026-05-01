#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

// 日记存放目录：F:\Note_CLI\notes
const NOTES_DIR = path.join(__dirname, '..', 'notes');

async function ensureNotesDir(): Promise<void> {
  await fs.mkdir(NOTES_DIR, { recursive: true });
}

function getFilename(date?: string): string {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}.md`;
}

function getFullPath(date?: string): string {
  return path.join(NOTES_DIR, getFilename(date));
}

const program = new Command();

program
  .name('diary')
  .description('终端日记本 — 在命令行里记录日常')
  .version('1.0.0');

// diary add <content...>
program
  .command('add')
  .description('添加一条日记')
  .argument('<text...>', '日记内容')
  .action(async (textParts: string[]) => {
    await ensureNotesDir();
    const content = textParts.join(' ');
    const filePath = getFullPath();
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const entry = `- ${timestamp}\n  ${content}\n`;

    // 如果文件不存在，先写标题
    let existing = '';
    try {
      existing = await fs.readFile(filePath, 'utf-8');
    } catch {
      existing = `# ${getFilename()}\n\n`;
    }

    await fs.writeFile(filePath, existing + entry, 'utf-8');
    console.log(chalk.green('✓ 已记录'));
    console.log(chalk.gray(`  ${getFilename()}`));
  });

// diary list
program
  .command('list')
  .description('列出所有日记文件')
  .action(async () => {
    await ensureNotesDir();
    const files = await fs.readdir(NOTES_DIR);
    const diaries = files
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();

    if (diaries.length === 0) {
      console.log(chalk.yellow('还没有日记，用 diary add 写第一条吧~'));
      return;
    }

    console.log(chalk.cyan.bold('📖 日记列表\n'));
    for (const file of diaries) {
      const filePath = path.join(NOTES_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter((l: string) => l.trim());
      const count = lines.length - (lines[0]?.startsWith('#') ? 1 : 0);
      const date = file.replace('.md', '');
      console.log(`  ${chalk.white(date)}  ${chalk.gray(`(${count} 条)`)}`);
    }
  });

// diary today
program
  .command('today')
  .description('查看或创建今天的日记')
  .action(async () => {
    await ensureNotesDir();
    const filePath = getFullPath();
    const filename = getFilename();

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(chalk.cyan.bold(`\n📅 ${filename}\n`));
      console.log(content);
    } catch {
      // 文件不存在，创建它
      const header = `# ${filename}\n\n`;
      await fs.writeFile(filePath, header, 'utf-8');
      console.log(chalk.green(`✓ 已创建今天的日记：${filename}`));
      console.log(chalk.gray('用 diary add <内容> 来写点什么吧~'));
    }
  });

// diary read <date>
program
  .command('read')
  .description('查看某天的日记')
  .argument('[date]', '日期，格式 YYYY-MM-DD，默认今天', getFilename())
  .action(async (date: string) => {
    await ensureNotesDir();
    const filePath = getFullPath(date);
    const filename = getFilename(date);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(chalk.cyan.bold(`\n📅 ${filename}\n`));
      console.log(content);
    } catch {
      console.log(chalk.yellow(`没有 ${filename} 的日记`));
    }
  });

program.parse();
