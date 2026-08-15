module.exports = {
  apps: [{
    name: 'lingualeap-api',
    script: './api/index.js',
    cwd: 'C:\\Users\\唐鹏\\Documents\\123456',
    instances: 2,
    exec_mode: 'cluster',
    max_memory_restart: '500M',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    autorestart: true,
    max_restarts: 100,
    restart_delay: 2000,
    env: { NODE_ENV: 'production' },
    env_development: { NODE_ENV: 'development' },
  }]
};