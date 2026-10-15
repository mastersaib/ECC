#!/usr/bin/env node
'use strict';

/**
 * Run the Android project's Gradle wrapper on any OS (gradlew.bat on
 * Windows, ./gradlew elsewhere), so npm scripts work from cmd.exe too.
 *
 *   node scripts/gradle.js assembleDebug
 */

const { spawnSync } = require('child_process');
const path = require('path');

const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'gradlew.bat' : './gradlew', process.argv.slice(2), {
  cwd: path.join(__dirname, '..', 'android'),
  stdio: 'inherit',
  shell: windows
});
if (result.error) console.error(`[gradle] ${result.error.message}`);
process.exit(result.status === null ? 1 : result.status);
