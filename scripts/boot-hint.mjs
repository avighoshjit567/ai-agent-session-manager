#!/usr/bin/env node
// Printed after `service:install`. The one part of "stay running forever" that
// can't be fully automated is start-on-reboot: pm2's startup hook needs a
// one-time elevated step that differs per OS. This prints the right command.
const port = process.env.PORT || '8787';
const host = process.env.HOST || '127.0.0.1';

const line = '─'.repeat(64);
console.log(`\n${line}`);
console.log('✓ Server is running under pm2 and will survive closing this terminal.');
console.log(`  URL:    http://${host}:${port}`);
console.log('  Status: npm run service:status     Logs: npm run service:logs');
console.log(line);
console.log('To also start it automatically after a REBOOT, run this once:\n');

if (process.platform === 'win32') {
  console.log('  Windows (PowerShell):');
  console.log('    npm i -g pm2 pm2-windows-startup');
  console.log('    pm2-startup install');
  console.log('    pm2 save');
  console.log('\n  (Windows boot-start needs the global pm2 + pm2-windows-startup helper.)');
} else if (process.platform === 'darwin') {
  console.log('  macOS:');
  console.log('    npx pm2 startup     # prints a sudo command — copy/paste & run it');
  console.log('    npx pm2 save');
} else {
  console.log('  Linux (systemd):');
  console.log('    npx pm2 startup     # prints a sudo command — copy/paste & run it');
  console.log('    npx pm2 save');
}
console.log(`\n${line}\n`);
