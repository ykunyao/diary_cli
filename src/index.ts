#!/usr/bin/env node

import { Command } from 'commander';
import { exec } from 'child_process';
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

// diary search <keyword...>
program
  .command('search')
  .description('搜索所有日记中的关键词')
  .argument('<keyword...>', '搜索关键词')
  .action(async (keywordParts: string[]) => {
    await ensureNotesDir();
    const keyword = keywordParts.join(' ').toLowerCase();
    const files = await fs.readdir(NOTES_DIR);
    const diaryFiles = files
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse(); // newest first

    if (diaryFiles.length === 0) {
      console.log(chalk.yellow('还没有日记，用 diary add 写第一条吧~'));
      return;
    }

    interface Match {
      date: string;
      filename: string;
      lines: string[];
    }

    const results: Match[] = [];

    for (const file of diaryFiles) {
      const filePath = path.join(NOTES_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const matches: string[] = [];

      for (const line of lines) {
        if (line.toLowerCase().includes(keyword)) {
          // highlight the keyword in yellow
          const highlighted = line.replace(
            new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
            (m) => chalk.yellow(m),
          );
          matches.push(highlighted);
        }
      }

      if (matches.length > 0) {
        results.push({
          date: file.replace('.md', ''),
          filename: file,
          lines: matches,
        });
      }
    }

    if (results.length === 0) {
      console.log(chalk.yellow(`没有找到包含 "${keywordParts.join(' ')}" 的日记`));
      return;
    }

    console.log(chalk.cyan.bold(`\n🔍 搜索: "${keywordParts.join(' ')}"\n`));
    for (const r of results) {
      console.log(chalk.white.bold(`📅 ${r.date}`));
      for (const line of r.lines) {
        console.log(`   ${line.trim()}`);
      }
      console.log();
    }
  });

// diary stats
program
  .command('stats')
  .description('日记统计信息')
  .action(async () => {
    await ensureNotesDir();
    const files = await fs.readdir(NOTES_DIR);
    const diaryFiles = files
      .filter(f => f.endsWith('.md'))
      .sort(); // oldest first

    if (diaryFiles.length === 0) {
      console.log(chalk.yellow('还没有日记，用 diary add 写第一条吧~'));
      return;
    }

    let totalEntries = 0;

    for (const file of diaryFiles) {
      const filePath = path.join(NOTES_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      // count lines that start with "- " (timestamp entries)
      for (const line of lines) {
        if (/^- \d/.test(line.trimStart())) {
          totalEntries++;
        }
      }
    }

    const firstDate = diaryFiles[0].replace('.md', '');
    const latestDate = diaryFiles[diaryFiles.length - 1].replace('.md', '');
    const totalDays = diaryFiles.length;

    // calculate current streak (consecutive days from today going backwards)
    let streak = 0;
    const today = new Date();
    // build a set of existing dates for fast lookup
    const dateSet = new Set(diaryFiles.map(f => f.replace('.md', '')));

    for (let i = 0; ; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;

      if (dateSet.has(dateStr)) {
        streak++;
      } else {
        break;
      }
    }

    console.log(chalk.cyan.bold('\n📊 日记统计\n'));
    console.log(`  ${chalk.white('总天数')}    ${chalk.yellow(String(totalDays))}`);
    console.log(`  ${chalk.white('总条目')}    ${chalk.yellow(String(totalEntries))}`);
    console.log(`  ${chalk.white('第一篇')}    ${chalk.yellow(firstDate)}`);
    console.log(`  ${chalk.white('最后一篇')}  ${chalk.yellow(latestDate)}`);
    if (streak > 0) {
      console.log(`  ${chalk.white('连续打卡')}  ${chalk.green(String(streak) + ' 天 🔥')}`);
    }
    console.log();
  });

// diary edit
program
  .command('edit')
  .description('用系统默认编辑器打开今天的日记')
  .action(async () => {
    await ensureNotesDir();
    const filePath = getFullPath();
    const filename = getFilename();

    // create the file if it doesn't exist (same header as today command)
    try {
      await fs.access(filePath);
    } catch {
      const header = `# ${filename}\n\n`;
      await fs.writeFile(filePath, header, 'utf-8');
      console.log(chalk.green(`✓ 已创建今天的日记：${filename}`));
    }

    const platform = process.platform;
    let command: string;

    if (platform === 'win32') {
      command = `start "" "${filePath}"`;
    } else if (platform === 'darwin') {
      command = `open "${filePath}"`;
    } else {
      command = `xdg-open "${filePath}"`;
    }

    exec(command, (error) => {
      if (error) {
        console.log(chalk.red(`无法打开编辑器: ${error.message}`));
      } else {
        console.log(chalk.green(`✓ 已打开 ${filename}`));
      }
    });
  });

program.parse();
