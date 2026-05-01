import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ensureNotesDir, parseEntries } from '../utils';
import { notesDir } from '../config';

export function registerRandom(program: Command): void {
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
}
