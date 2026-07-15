module.exports = {
  apps: [{
    name: 'abyssdungeons',
    script: './boot.js',
    cwd: '/mnt/data/abyssdungeons',
    env: { NODE_ENV: 'production', PORT: '3000' },
    instances: 1, autorestart: true, watch: false, max_memory_restart: '512M'
  }]
}
