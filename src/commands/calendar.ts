import { Command } from 'commander';
import * as fs from 'fs/promises';
import chalk from 'chalk';
import { ensureNotesDir, getFilename, tzNow } from '../utils';
import { notesDir } from '../config';

export function registerCalendar(program: Command): void {
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
        const now = tzNow();
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
}
