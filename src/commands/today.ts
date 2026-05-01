import { Command } from 'commander';
import * as fs from 'fs/promises';
import chalk from 'chalk';
import { ensureNotesDir, getFullPath, getFilename } from '../utils';

export function registerToday(program: Command): void {
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
}
