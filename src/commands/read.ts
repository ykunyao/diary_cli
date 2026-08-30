import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ensureNotesDir, getFilename, resolveDateArg } from '../utils';
import { notesDir } from '../config';

export function registerRead(program: Command): void {
  program
    .command('read')
    .description('查看某天的日记')
    .argument('[date]', '日期，格式 YYYY-MM-DD，默认今天')
    .action(async (date?: string) => {
      await ensureNotesDir();
      const d = resolveDateArg(date);
      if (!d) {
        console.log(chalk.red('日期格式错误，请使用 YYYY-MM-DD，如 diary read 2026-05-01'));
        return;
      }
      const filename = getFilename(d);
      const filePath = path.join(notesDir, filename);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        console.log(chalk.cyan.bold(`\n📅 ${filename}\n`));
        console.log(content);
      } catch {
        console.log(chalk.yellow(`没有 ${filename} 的日记`));
      }
    });
}
