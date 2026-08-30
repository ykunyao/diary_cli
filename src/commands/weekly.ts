import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ensureNotesDir, getFilename, parseEntries, resolveDateArg } from '../utils';
import { notesDir } from '../config';

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function registerWeekly(program: Command): void {
  program
    .command('weekly')
    .description('查看本周日记概览')
    .argument('[date]', '参考日期 YYYY-MM-DD，默认今天')
    .action(async (dateStr?: string) => {
      await ensureNotesDir();

      // Determine which week: the week containing `dateStr` (or today)
      const refDate = resolveDateArg(dateStr);
      if (!refDate) {
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
}
