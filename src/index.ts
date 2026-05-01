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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const program = new Command();

program
  .name('diary')
  .description('终端日记本 — 在命令行里记录日常')
  .version('1.0.0');

// diary add <content...>
const addCmd = program
  .command('add')
  .description('添加一条日记')
  .option('-m, --mood <emoji>', '心情标记 (如 😊😢😡😴)')
  .argument('<text...>', '日记内容');

addCmd.action(async (textParts: string[]) => {
    const opts = addCmd.opts();
    await ensureNotesDir();

    // 校验心情值：必须是 emoji 或单字符，防止 -m oon 这种手滑
    if (opts.mood) {
      const moodVal = opts.mood as string;
      // emoji 通常长度 1-2 (含零宽连接符可能更长)，但至少不该全是 ASCII 字母
      const isAsciiWord = /^[a-zA-Z]+$/.test(moodVal);
      if (isAsciiWord && moodVal.length > 1) {
        console.log(chalk.yellow(`⚠ 心情 "${moodVal}" 看起来不太对，是不是把 --mood 写成 -mood 了？`));
        console.log(chalk.gray('  正确用法: diary add --mood 😊 内容'));
        return;
      }
    }

    const content = textParts.join(' ');
    const filePath = getFullPath();
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const prefix = opts.mood ? `${opts.mood} ` : '';
    const entry = `- ${prefix}${timestamp}\n  ${content}\n`;

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

// diary random
program
  .command('random')
  .description('随机看一篇旧日记')
  .action(async () => {
    await ensureNotesDir();
    const files = await fs.readdir(NOTES_DIR);
    const diaryFiles = files
      .filter(f => f.endsWith('.md'));

    if (diaryFiles.length === 0) {
      console.log(chalk.yellow('还没有日记，用 diary add 写第一条吧~'));
      return;
    }

    // Collect all entries from all files
    interface ParsedEntry {
      date: string;
      timestampLine: string;
      body: string;
    }
    const allEntries: ParsedEntry[] = [];

    for (const file of diaryFiles) {
      const filePath = path.join(NOTES_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      let currentStart = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();
        // Entry line: starts with "- " and not indented further
        if (trimmed.startsWith('- ') && !line.startsWith('  - ')) {
          if (currentStart >= 0) {
            allEntries.push({
              date: file.replace('.md', ''),
              timestampLine: lines[currentStart],
              body: lines.slice(currentStart + 1, i).join('\n'),
            });
          }
          currentStart = i;
        }
      }
      // Last entry in file
      if (currentStart >= 0) {
        allEntries.push({
          date: file.replace('.md', ''),
          timestampLine: lines[currentStart],
          body: lines.slice(currentStart + 1).join('\n'),
        });
      }
    }

    if (allEntries.length === 0) {
      console.log(chalk.yellow('还没有日记条目，用 diary add 写第一条吧~'));
      return;
    }

    const entry = allEntries[Math.floor(Math.random() * allEntries.length)];
    console.log(chalk.cyan.bold(`\n📅 ${entry.date} — 随机回顾\n`));
    console.log(chalk.white(`  ${entry.timestampLine.trimStart()}`));
    if (entry.body.trim()) {
      console.log(chalk.gray(entry.body));
    }
    console.log();
  });

// diary calendar [year-month]
program
  .command('calendar')
  .description('日历视图，查看当月日记分布')
  .argument('[year-month]', '年月，如 2026-05，默认当月')
  .action(async (ym?: string) => {
    await ensureNotesDir();
    let year: number;
    let month: number;

    if (ym) {
      const parts = ym.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        console.log(chalk.red('日期格式错误，请使用 2026-05 或 2026-5'));
        return;
      }
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    // Build set of existing dates from filenames for O(1) lookup
    const files = await fs.readdir(NOTES_DIR);
    const dateSet = new Set(
      files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
    );

    const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sunday
    const daysInMonth = new Date(year, month, 0).getDate();
    const todayStr = getFilename().replace('.md', '');

    // Header
    console.log(chalk.bold(`\n      ${year}年 ${month}月\n`));
    console.log(' 日  一  二  三  四  五  六');

    let row = '';
    // Leading blanks for first week
    for (let i = 0; i < firstDay; i++) {
      row += '   ';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const hasDiary = dateSet.has(dateStr);

      let display: string;
      if (isToday) {
        display = chalk.cyan(String(day).padStart(2, ' '));
      } else if (hasDiary) {
        display = chalk.green(String(day).padStart(2, ' '));
      } else {
        display = chalk.gray(String(day).padStart(2, ' '));
      }

      row += display + ' ';

      if ((firstDay + day) % 7 === 0 || day === daysInMonth) {
        console.log(row.trimEnd());
        row = '';
      }
    }
    console.log();
  });

// diary export [format]
program
  .command('export')
  .description('导出日记')
  .argument('[format]', '导出格式: md 或 html', 'md')
  .action(async (format: string) => {
    await ensureNotesDir();
    const files = await fs.readdir(NOTES_DIR);
    const diaryFiles = files
      .filter(f => f.endsWith('.md'))
      .sort(); // oldest first

    if (diaryFiles.length === 0) {
      console.log(chalk.yellow('还没有日记，用 diary add 写第一条吧~'));
      return;
    }

    if (format === 'md') {
      let output = '';
      for (let i = 0; i < diaryFiles.length; i++) {
        const file = diaryFiles[i];
        const content = await fs.readFile(path.join(NOTES_DIR, file), 'utf-8');
        output += content + '\n---\n';
        if (i < diaryFiles.length - 1) {
          output += '\n';
        }
      }
      const outPath = path.join(process.cwd(), 'diary-export.md');
      await fs.writeFile(outPath, output, 'utf-8');
      const stat = await fs.stat(outPath);
      console.log(chalk.green('✓ 已导出到 diary-export.md'));
      console.log(chalk.gray(`  文件大小: ${(stat.size / 1024).toFixed(1)} KB`));
    } else if (format === 'html') {
      let bodyHtml = '';
      for (const file of diaryFiles) {
        const date = file.replace('.md', '');
        const content = await fs.readFile(path.join(NOTES_DIR, file), 'utf-8');
        // Skip header line (# title)
        const lines = content.split('\n');
        const filtered = lines.filter((_l, i) => i !== 0 || !lines[0].startsWith('#'));
        const entryContent = filtered.join('\n').trim();
        bodyHtml += `<div class="day">\n<h2>${escapeHtml(date)}</h2>\n<pre>${escapeHtml(entryContent)}</pre>\n</div>\n`;
      }

      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>日记导出 - Diary Export</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
.day { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.day h2 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 8px; }
pre { white-space: pre-wrap; font-family: inherit; line-height: 1.8; color: #555; }
</style>
</head>
<body>
<h1>📖 日记导出</h1>
<p>导出日期: ${escapeHtml(new Date().toLocaleString('zh-CN'))}</p>
${bodyHtml}
</body>
</html>`;

      const outPath = path.join(process.cwd(), 'diary-export.html');
      await fs.writeFile(outPath, html, 'utf-8');
      const stat = await fs.stat(outPath);
      console.log(chalk.green('✓ 已导出到 diary-export.html'));
      console.log(chalk.gray(`  文件大小: ${(stat.size / 1024).toFixed(1)} KB`));
    } else {
      console.log(chalk.red('格式错误，请使用 md 或 html'));
    }
  });

// diary mood (心情追踪)
const moodCmd = program
  .command('mood')
  .description('心情追踪');

moodCmd
  .command('stats')
  .description('心情统计')
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

    interface MoodEntry {
      emoji: string;
      date: string;
      timestamp: string;
    }

    const moodEntries: MoodEntry[] = [];

    for (const file of diaryFiles) {
      const date = file.replace('.md', '');
      const filePath = path.join(NOTES_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trimStart();
        // Match: "- [word] YYYY/M/D HH:MM"
        // Normal entry: "- 2026/5/1 15:30"  (first word is year)
        // Mood entry:   "- 😊 2026/5/1 15:30" (first word is emoji)
        const match = trimmed.match(/^- (\S+)\s+(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})/);
        if (match && !/^\d/.test(match[1])) {
          moodEntries.push({
            emoji: match[1],
            date,
            timestamp: match[2],
          });
        }
      }
    }

    if (moodEntries.length === 0) {
      console.log(chalk.yellow('还没有心情记录，用 diary add --mood 😊 来记录心情吧~'));
      return;
    }

    // Count moods
    const moodCount: Record<string, number> = {};
    for (const e of moodEntries) {
      moodCount[e.emoji] = (moodCount[e.emoji] || 0) + 1;
    }

    console.log(chalk.cyan.bold('\n📊 心情统计\n'));
    console.log(chalk.white('  心情分布:'));
    const total = moodEntries.length;
    const sorted = Object.entries(moodCount).sort((a, b) => b[1] - a[1]);
    for (const [emoji, count] of sorted) {
      const pct = ((count / total) * 100).toFixed(0);
      const bar = '█'.repeat(Math.round((count / total) * 20));
      console.log(`  ${emoji}  ${chalk.yellow(String(count).padStart(2, ' '))}  ${bar} ${pct}%`);
    }

    // Recent mood trend (last 7 days)
    console.log(chalk.white('\n  最近 7 天心情趋势:'));
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;

      const dayMoods = moodEntries.filter(e => e.date === dateStr);
      const moodStr = dayMoods.length > 0
        ? dayMoods.map(e => e.emoji).join(' ')
        : chalk.gray('—');

      const dayLabel = `${m}/${day}`;
      console.log(`  ${chalk.white(dayLabel)}  ${moodStr}`);
    }
    console.log();
  });

// Default: show help when no mood subcommand is given
moodCmd.action(() => {
  moodCmd.outputHelp();
});

program.parse();
