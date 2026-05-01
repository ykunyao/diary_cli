import { Command } from 'commander';
import * as fs from 'fs/promises';
import { readFileSync } from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { CONFIG_PATH, DiaryConfig, saveConfig, notesDir, timezone, editorCmd } from '../config';

export function registerConfigCmd(program: Command): void {
  const configCmd = program
    .command('config')
    .description('查看或修改配置');

  configCmd
    .command('set')
    .description('设置配置项')
    .argument('<key>', '配置键名 (notesDir | timezone | editor)')
    .argument('<value>', '配置值')
    .action(async (key: string, value: string) => {
      const validKeys = ['notesDir', 'timezone', 'editor'];

      if (!validKeys.includes(key)) {
        console.log(chalk.red(`无效的配置项 "${key}"，可选: ${validKeys.join(', ')}`));
        return;
      }

      // Load current config from file
      let config: DiaryConfig;
      try {
        const raw = readFileSync(CONFIG_PATH, 'utf-8');
        config = JSON.parse(raw);
      } catch {
        config = {
          notesDir: path.join(__dirname, '..', '..', 'notes'),
          timezone: 'Asia/Shanghai',
          editor: 'auto',
        };
      }

      const oldValue = config[key as keyof DiaryConfig];

      // Special handling for notesDir: warn if old notes exist
      if (key === 'notesDir') {
        const oldDir = config.notesDir;
        if (oldDir !== value) {
          // Check if old dir has notes
          try {
            const oldFiles = await fs.readdir(oldDir);
            const hasNotes = oldFiles.some(f => f.endsWith('.md'));
            if (hasNotes) {
              console.log(chalk.yellow(`⚠ 警告: 旧目录 ${oldDir} 中仍有日记文件，切换后这些日记将不可见`));
              console.log(chalk.gray('  你可以手动迁移文件到新目录，或使用导出功能备份'));
            }
          } catch {
            // Old dir doesn't exist or can't be read — no warning needed
          }
        }
      }

      // Assign value to the correct config key
      if (key === 'notesDir') config.notesDir = value;
      else if (key === 'timezone') config.timezone = value;
      else if (key === 'editor') config.editor = value;
      await saveConfig(config);

      // Update in-memory values (mutate module-level vars)
      (notesDir as string) = config.notesDir;
      (timezone as string) = config.timezone;
      (editorCmd as string) = config.editor;

      console.log(chalk.green(`✓ 已设置 ${key} = ${value}`));
      console.log(chalk.gray(`  旧值: ${oldValue}`));
    });

  configCmd.action(async () => {
    // Display current config
    let config: DiaryConfig;
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      config = JSON.parse(raw);
    } catch {
      config = {
        notesDir: path.join(__dirname, '..', '..', 'notes'),
        timezone: 'Asia/Shanghai',
        editor: 'auto',
      };
    }

    // Check if config file exists
    const configExists = (() => {
      try {
        readFileSync(CONFIG_PATH, 'utf-8');
        return true;
      } catch {
        return false;
      }
    })();

    console.log(chalk.cyan.bold('\n⚙ 配置\n'));
    console.log(`  ${chalk.white('配置路径')}  ${chalk.gray(CONFIG_PATH)}`);
    if (!configExists) {
      console.log(chalk.gray('  (使用默认配置，文件尚未创建)\n'));
    }
    console.log(`  ${chalk.white('notesDir')}   ${chalk.yellow(config.notesDir)}`);
    console.log(`  ${chalk.white('timezone')}   ${chalk.yellow(config.timezone)}`);
    console.log(`  ${chalk.white('editor')}     ${chalk.yellow(config.editor)}`);
    console.log();
  });
}
