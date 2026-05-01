import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ensureNotesDir, getFilename } from '../utils';
import { notesDir } from '../config';

export function registerStats(program: Command): void {
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
}
