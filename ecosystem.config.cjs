// pm2 process definition for the Session Manager.
//
// Runs the built single-process server (Fastify API + static Vue client) under
// pm2 so it stays alive after you close your terminal, restarts on crash, and —
// once `pm2 startup` is configured — comes back after a reboot. Works the same
// on macOS, Linux, and Windows.
//
// PORT / HOST can be overridden at start time, e.g.:
//   PORT=9000 npm run service:install
module.exports = {
  apps: [
    {
      name: 'claude-codex-session-manager',
      script: 'server/dist/server/src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // Don't hammer-restart on a crash loop (e.g. a missing build):
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '8787',
        HOST: process.env.HOST || '127.0.0.1',
      },
    },
  ],
};
