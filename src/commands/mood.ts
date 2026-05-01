import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ensureNotesDir } from '../utils';
import { notesDir } from '../config';

export function registerMood(program: Command): void {
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
}
