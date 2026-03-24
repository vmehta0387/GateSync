module.exports = {
  apps: [
    {
      name: 'gatesync-backend',
      cwd: '/var/www/gatesync/backend',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
  ],
};
