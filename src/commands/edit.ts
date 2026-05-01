import { Command } from 'commander';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import chalk from 'chalk';
import { ensureNotesDir, getFullPath, getFilename } from '../utils';
import { editorCmd } from '../config';

export function registerEdit(program: Command): void {
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
}
