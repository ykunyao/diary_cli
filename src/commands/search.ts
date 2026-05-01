import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ensureNotesDir, parseEntries, entryHasTag } from '../utils';
import { notesDir } from '../config';

export function registerSearch(program: Command): void {
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
}
