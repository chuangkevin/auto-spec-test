module.exports = {
  apps: [
    {
      name: 'autospec-server',
      cwd: './packages/server',
      script: 'npx',
      args: 'tsx src/index.ts',
      env: {
        NODE_ENV: 'development',
      },
      watch: ['src'],
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'data', 'uploads', 'screenshots'],
      max_restarts: 10,
      restart_delay: 2000,
      autorestart: true,
    },
    {
      name: 'autospec-web',
      cwd: './packages/web',
      script: 'npx',
      args: 'next dev',
      env: {
        NODE_ENV: 'development',
      },
      autorestart: true,
      max_restarts: 5,
      restart_delay: 3000,
    },
  ],
};
