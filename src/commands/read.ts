import { Command } from 'commander';
import * as fs from 'fs/promises';
import chalk from 'chalk';
import { ensureNotesDir, getFullPath, getFilename } from '../utils';

export function registerRead(program: Command): void {
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
}
