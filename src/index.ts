#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfigSync } from './config';
import { registerAdd } from './commands/add';
import { registerList } from './commands/list';
import { registerTags } from './commands/tags';
import { registerToday } from './commands/today';
import { registerRead } from './commands/read';
import { registerSearch } from './commands/search';
import { registerStats } from './commands/stats';
import { registerEdit } from './commands/edit';
import { registerRandom } from './commands/random';
import { registerCalendar } from './commands/calendar';
import { registerExport } from './commands/export';
import { registerWeekly } from './commands/weekly';
import { registerUndo } from './commands/undo';
import { registerConfigCmd } from './commands/configCmd';
import { registerMood } from './commands/mood';

// Load config once at startup
loadConfigSync();

// Assemble CLI
const program = new Command();

program
  .name('diary')
  .description('终端日记本 — 在命令行里记录日常')
  .version('1.0.0');

registerAdd(program);
registerList(program);
registerTags(program);
registerToday(program);
registerRead(program);
registerSearch(program);
registerStats(program);
registerEdit(program);
registerRandom(program);
registerCalendar(program);
registerExport(program);
registerWeekly(program);
registerUndo(program);
registerConfigCmd(program);
registerMood(program);

program.parse();
