#!/usr/bin/env node

import { Command } from 'commander';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';

// ========== Config ==========
const CONFIG_PATH = path.join(os.homedir(), '.diaryrc.json');

interface DiaryConfig {
  notesDir: string;
  timezone: string;
  editor: string;
}

let notesDir: string;
let timezone: string;
let editorCmd: string;

function loadConfigSync(): void {
  const defaults: DiaryConfig = {
    notesDir: path.join(__dirname, '..', 'notes'),
    timezone: 'Asia/Shanghai',
    editor: 'auto',
  };
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const merged = { ...defaults, ...parsed };
    notesDir = merged.notesDir;
    timezone = merged.timezone;
    editorCmd = merged.editor;
  } catch {
    notesDir = defaults.notesDir;
    timezone = defaults.timezone;
    editorCmd = defaults.editor;
  }
}

loadConfigSync();

async function saveConfig(config: DiaryConfig): Promise<void> {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// ========== Helpers ==========
async function ensureNotesDir(): Promise<void> {
  await fs.mkdir(notesDir, { recursive: true });
}

function getFilename(date?: string): string {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}.md`;
}

function getFullPath(date?: string): string {
  return path.join(notesDir, getFilename(date));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractTags(content: string): string[] {
  const matches = content.match(/#[\u4e00-\u9fa5\w]+/g);
  if (!matches) return [];
  return [...new Set(matches.map(t => t.slice(1)))];
}

/**
 * Parse a diary file into entry blocks.
 * Returns an array of entries; each entry has the index of the "- " timestamp line
 * and the list of body lines that belong to it.
 */
interface EntryBlock {
  /** Line index of the "- " timestamp line within the file's lines array */
  timestampIdx: number;
  /** All lines that belong to this entry (including the timestamp line) */
  lines: string[];
}

function parseEntries(lines: string[]): EntryBlock[] {
  const entries: EntryBlock[] = [];
  let currentStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    // A top-level "- " line (not indented sub-list) starts a new entry
    if (trimmed.startsWith('- ') && !line.startsWith('  - ') && !line.startsWith('\t')) {
      if (currentStart >= 0) {
        entries.push({
          timestampIdx: currentStart,
          lines: lines.slice(currentStart, i),
        });
      }
      currentStart = i;
    }
  }
  // Last entry
  if (currentStart >= 0) {
    entries.push({
      timestampIdx: currentStart,
      lines: lines.slice(currentStart),
    });
  }
  return entries;
}

/**
 * Check if an entry (its joined lines text) contains the given tag.
 */
function entryHasTag(entryLines: string[], tag: string): boolean {
  const text = entryLines.join('\n');
  return text.includes(`#${tag}`);
}

// ========== CLI Setup ==========
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
    const isAsciiWord = /^[a-zA-Z]+$/.test(moodVal);
    if (isAsciiWord && moodVal.length > 1) {
      console.log(chalk.yellow(`⚠ 心情 "${moodVal}" 看起来不太对，是不是把 --mood 写成 -mood 了？`));
      console.log(chalk.gray('  正确用法: diary add --mood 😊 内容'));
      return;
    }
  }

  const content = textParts.join(' ');
  const filePath = getFullPath();
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: timezone });
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

  // 检测并显示标签
  const tags = extractTags(content);
  if (tags.length > 0) {
    console.log(chalk.gray(`  🏷 标签: ${tags.join(', ')}`));
  }
});

// diary list
const listCmd = program
  .command('list')
  .description('列出所有日记文件')
  .option('-t, --tag <tag>', '按标签筛选');

listCmd.action(async () => {
  const opts = listCmd.opts();
  await ensureNotesDir();
  const files = await fs.readdir(notesDir);
  const diaries = files
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();

  if (diaries.length === 0) {
    console.log(chalk.yellow('还没有日记，用 diary add 写第一条吧~'));
    return;
  }

  if (opts.tag) {
    // Filter by tag — show only files that have entries with this tag
    const tag = opts.tag as string;
    console.log(chalk.cyan.bold(`\n📖 标签 #${tag} 的日记\n`));

    let totalMatches = 0;
    for (const file of diaries) {
      const filePath = path.join(notesDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const entries = parseEntries(lines);
      const matchingEntries = entries.filter(e => entryHasTag(e.lines, tag));

      if (matchingEntries.length > 0) {
        const date = file.replace('.md', '');
        console.log(`  ${chalk.white(date)}  ${chalk.gray(`(${matchingEntries.length} 条)`)}`);
        totalMatches += matchingEntries.length;
      }
    }

    if (totalMatches === 0) {
      console.log(chalk.yellow(`没有找到包含标签 #${tag} 的日记`));
    } else {
      console.log(chalk.gray(`\n  共 ${totalMatches} 条`));
    }
  } else {
    console.log(chalk.cyan.bold('📖 日记列表\n'));
    for (const file of diaries) {
      const filePath = path.join(notesDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter((l: string) => l.trim());
      const count = lines.length - (lines[0]?.startsWith('#') ? 1 : 0);
      const date = file.replace('.md', '');
      console.log(`  ${chalk.white(date)}  ${chalk.gray(`(${count} 条)`)}`);
    }
  }
});

// diary tags
program
  .command('tags')
  .description('列出所有标签及使用次数')
  .action(async () => {
    await ensureNotesDir();
    const files = await fs.readdir(notesDir);
    const diaryFiles = files
      .filter(f => f.endsWith('.md'));

    if (diaryFiles.length === 0) {
      console.log(chalk.yellow('还没有日记，用 diary add 写第一条吧~'));
      return;
    }

    const tagCount: Record<string, number> = {};

    for (const file of diaryFiles) {
      const filePath = path.join(notesDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const entries = parseEntries(lines);

      for (const entry of entries) {
        const text = entry.lines.join('\n');
        const tags = extractTags(text);
        for (const tag of tags) {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        }
      }
    }

    if (Object.keys(tagCount).length === 0) {
      console.log(chalk.yellow('还没有标签，用 diary add 内容 #标签 来添加标签吧~'));
      return;
    }

    const sorted = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);

    console.log(chalk.cyan.bold('\n🏷 标签列表\n'));
    for (const [tag, count] of sorted) {
      console.log(`  ${chalk.yellow('#' + tag)}  ${chalk.gray(`${count} 条`)}`);
    }
    console.log();
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
const searchCmd = program
  .command('search')
  .description('搜索所有日记中的关键词')
  .option('-t, --tag <tag>', '限定标签')
  .argument('<keyword...>', '搜索关键词');

searchCmd.action(async (keywordParts: string[]) => {
  const opts = searchCmd.opts();
  await ensureNotesDir();
  const keyword = keywordParts.join(' ').toLowerCase();
  const files = await fs.readdir(notesDir);
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
    const filePath = path.join(notesDir, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    if (opts.tag) {
      // Only search within entries that have the specified tag
      const entries = parseEntries(lines);
      const tag = opts.tag as string;

      for (const entry of entries) {
        if (!entryHasTag(entry.lines, tag)) continue;

        const entryMatches: string[] = [];
        for (const line of entry.lines) {
          if (line.toLowerCase().includes(keyword)) {
            const highlighted = line.replace(
              new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
              (m) => chalk.yellow(m),
            );
            entryMatches.push(highlighted);
          }
        }
        if (entryMatches.length > 0) {
          const date = file.replace('.md', '');
          results.push({ date, filename: file, lines: entryMatches });
        }
      }
    } else {
      // Original behavior: search all lines
      const matches: string[] = [];
      for (const line of lines) {
        if (line.toLowerCase().includes(keyword)) {
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
  }

  if (results.length === 0) {
    const tagInfo = opts.tag ? ` (限定标签 #${opts.tag})` : '';
    console.log(chalk.yellow(`没有找到包含 "${keywordParts.join(' ')}" 的日记${tagInfo}`));
    return;
  }

  const tagInfo = opts.tag ? ` | 标签: #${opts.tag}` : '';
  console.log(chalk.cyan.bold(`\n🔍 搜索: "${keywordParts.join(' ')}"${tagInfo}\n`));
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
    const files = await fs.readdir(notesDir);
    const diaryFiles = files
      .filter(f => f.endsWith('.md'))
      .sort(); // oldest first

    if (diaryFiles.length === 0) {
      console.log(chalk.yellow('还没有日记，用 diary add 写第一条吧~'));
      return;
    }

    let totalEntries = 0;

    for (const file of diaryFiles) {
      const filePath = path.join(notesDir, file);
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

    if (editorCmd !== 'auto') {
      // Use configured editor
      command = `"${editorCmd}" "${filePath}"`;
    } else if (platform === 'win32') {
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
    const files = await fs.readdir(notesDir);
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
      const filePath = path.join(notesDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const entries = parseEntries(lines);

      for (const entry of entries) {
        allEntries.push({
          date: file.replace('.md', ''),
          timestampLine: entry.lines[0],
          body: entry.lines.slice(1).join('\n'),
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
    const files = await fs.readdir(notesDir);
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
    const files = await fs.readdir(notesDir);
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
        const content = await fs.readFile(path.join(notesDir, file), 'utf-8');
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
        const content = await fs.readFile(path.join(notesDir, file), 'utf-8');
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

// diary weekly [date]
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

program
  .command('weekly')
  .description('查看本周日记概览')
  .argument('[date]', '参考日期 YYYY-MM-DD，默认今天')
  .action(async (dateStr?: string) => {
    await ensureNotesDir();

    // Determine which week: the week containing `dateStr` (or today)
    const refDate = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(refDate.getTime())) {
      console.log(chalk.red('日期格式错误，请使用 YYYY-MM-DD'));
      return;
    }

    // Calculate Monday of that week
    const dayOfWeek = refDate.getDay(); // 0=Sun
    const monday = new Date(refDate);
    monday.setDate(refDate.getDate() - ((dayOfWeek + 6) % 7)); // shift to Monday

    // Pre-load existing diary files
    const files = await fs.readdir(notesDir);
    const dateSet = new Set(files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')));

    const todayStr = getFilename().replace('.md', '');

    // Format the week range
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const formatShort = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    console.log(chalk.cyan.bold(`\n📅 周报  ${formatShort(monday)} ~ ${formatShort(sunday)}\n`));

    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      const dateStr2 = formatShort(day);
      const weekday = WEEKDAY_NAMES[day.getDay()];
      const isToday = dateStr2 === todayStr;

      const dateLabel = isToday
        ? chalk.cyan.bold(`${dateStr2} ${weekday}`)
        : chalk.white(`${dateStr2} ${weekday}`);

      if (!dateSet.has(dateStr2)) {
        console.log(`  ${dateLabel}  ${chalk.gray('无日记')}`);
        continue;
      }

      // Read the file and extract entry info
      const filePath = path.join(notesDir, `${dateStr2}.md`);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const entries = parseEntries(lines);

      if (entries.length === 0) {
        console.log(`  ${dateLabel}  ${chalk.gray('无日记')}`);
        continue;
      }

      // First entry's first body line as preview
      const firstEntry = entries[0];
      const bodyLines = firstEntry.lines.slice(1); // skip timestamp line
      const firstBodyLine = bodyLines.find(l => l.trim()) || '';
      const preview = firstBodyLine.trim().slice(0, 40);
      const previewText = preview.length >= 40 ? preview + '...' : preview;
      const displayPreview = previewText ? chalk.gray(`  ${previewText}`) : '';

      console.log(`  ${dateLabel}  ${chalk.yellow(`${entries.length} 条`)}${displayPreview}`);
    }
    console.log();
  });

// diary undo [count]
program
  .command('undo')
  .description('撤销今天的最后 N 条日记')
  .argument('[count]', '要撤销的条目数，默认 1', '1')
  .action(async (countStr: string) => {
    await ensureNotesDir();
    const count = parseInt(countStr, 10);

    if (isNaN(count) || count < 1) {
      console.log(chalk.red('请输入有效的数字（≥1）'));
      return;
    }

    const filePath = getFullPath();
    const filename = getFilename();

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      console.log(chalk.yellow(`今天（${filename}）还没有日记`));
      return;
    }

    const lines = content.split('\n');
    const entries = parseEntries(lines);

    if (entries.length === 0) {
      console.log(chalk.yellow(`今天（${filename}）还没有日记条目`));
      return;
    }

    const toRemove = Math.min(count, entries.length);
    const removed = entries.slice(entries.length - toRemove);

    // Show what will be removed
    console.log(chalk.yellow(`\n⚠ 将撤销 ${toRemove} 条日记：\n`));
    for (const entry of removed) {
      const tsLine = entry.lines[0].trimStart();
      const bodyPreview = entry.lines.slice(1).find(l => l.trim())?.trim().slice(0, 60) || '';
      console.log(chalk.gray(`  ${tsLine}`));
      if (bodyPreview) {
        console.log(chalk.gray(`    ${bodyPreview}${bodyPreview.length >= 60 ? '...' : ''}`));
      }
      console.log();
    }

    // Rebuild the file without the removed entries
    const remainingEntries = entries.slice(0, entries.length - toRemove);
    const headerLines: string[] = [];
    // Keep lines before the first entry (header, blank lines)
    if (entries.length > 0) {
      for (let i = 0; i < entries[0].timestampIdx; i++) {
        headerLines.push(lines[i]);
      }
    } else {
      // Shouldn't reach here since we checked entries.length > 0
      headerLines.push(...lines.filter(l => l.startsWith('#') || l === ''));
    }

    const newContent = [
      ...headerLines,
      ...remainingEntries.flatMap(e => e.lines),
    ].join('\n');

    // Ensure trailing newline
    const finalContent = newContent.endsWith('\n') ? newContent : newContent + '\n';
    await fs.writeFile(filePath, finalContent, 'utf-8');

    console.log(chalk.green(`✓ 已撤销 ${toRemove} 条日记`));
  });

// diary config
const configCmd = program
  .command('config')
  .description('查看或修改配置');

configCmd
  .command('set')
  .description('设置配置项')
  .argument('<key>', '配置键名 (notesDir | timezone | editor)')
  .argument('<value>', '配置值')
  .action(async (key: string, value: string) => {
    const validKeys = ['notesDir', 'timezone', 'editor'];

    if (!validKeys.includes(key)) {
      console.log(chalk.red(`无效的配置项 "${key}"，可选: ${validKeys.join(', ')}`));
      return;
    }

    // Load current config from file
    let config: DiaryConfig;
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      config = JSON.parse(raw);
    } catch {
      config = {
        notesDir: path.join(__dirname, '..', 'notes'),
        timezone: 'Asia/Shanghai',
        editor: 'auto',
      };
    }

    const oldValue = config[key as keyof DiaryConfig];

    // Special handling for notesDir: warn if old notes exist
    if (key === 'notesDir') {
      const oldDir = config.notesDir;
      if (oldDir !== value) {
        // Check if old dir has notes
        try {
          const oldFiles = await fs.readdir(oldDir);
          const hasNotes = oldFiles.some(f => f.endsWith('.md'));
          if (hasNotes) {
            console.log(chalk.yellow(`⚠ 警告: 旧目录 ${oldDir} 中仍有日记文件，切换后这些日记将不可见`));
            console.log(chalk.gray('  你可以手动迁移文件到新目录，或使用导出功能备份'));
          }
        } catch {
          // Old dir doesn't exist or can't be read — no warning needed
        }
      }
    }

    // Assign value to the correct config key
    if (key === 'notesDir') config.notesDir = value;
    else if (key === 'timezone') config.timezone = value;
    else if (key === 'editor') config.editor = value;
    await saveConfig(config);

    // Update in-memory values
    notesDir = config.notesDir;
    timezone = config.timezone;
    editorCmd = config.editor;

    console.log(chalk.green(`✓ 已设置 ${key} = ${value}`));
    console.log(chalk.gray(`  旧值: ${oldValue}`));
  });

configCmd.action(async () => {
  // Display current config
  let config: DiaryConfig;
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    config = JSON.parse(raw);
  } catch {
    config = {
      notesDir: path.join(__dirname, '..', 'notes'),
      timezone: 'Asia/Shanghai',
      editor: 'auto',
    };
  }

  // Check if config file exists
  const configExists = (() => {
    try {
      readFileSync(CONFIG_PATH, 'utf-8');
      return true;
    } catch {
      return false;
    }
  })();

  console.log(chalk.cyan.bold('\n⚙ 配置\n'));
  console.log(`  ${chalk.white('配置路径')}  ${chalk.gray(CONFIG_PATH)}`);
  if (!configExists) {
    console.log(chalk.gray('  (使用默认配置，文件尚未创建)\n'));
  }
  console.log(`  ${chalk.white('notesDir')}   ${chalk.yellow(config.notesDir)}`);
  console.log(`  ${chalk.white('timezone')}   ${chalk.yellow(config.timezone)}`);
  console.log(`  ${chalk.white('editor')}     ${chalk.yellow(config.editor)}`);
  console.log();
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
    const files = await fs.readdir(notesDir);
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
      const filePath = path.join(notesDir, file);
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
