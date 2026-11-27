#!/bin/bash
# 深渊地城 Redis（账号/排行榜/聊天/邮件）每日备份
# 系统 Redis 数据在系统盘 /var/lib/redis，备份到数据盘 /mnt/data/backup/redis
set -e

DATE=$(date +%Y%m%d_%H%M%S)
DEST="/mnt/data/backup/redis/$DATE"
mkdir -p "$DEST"

# 先落盘再拷贝，保证一致性
redis-cli SAVE > /dev/null 2>&1 || true
cp -p /var/lib/redis/dump.rdb "$DEST/dump.rdb"
cp -rp /var/lib/redis/appendonlydir "$DEST/appendonlydir" 2>/dev/null || true
cp -p /var/lib/redis/appendonly.aof "$DEST/appendonly.aof" 2>/dev/null || true

tar czf "/mnt/data/backup/redis/redis_$DATE.tar.gz" -C "$DEST" .
rm -rf "$DEST"

# 保留最近 14 天
find /mnt/data/backup/redis -name "redis_*.tar.gz" -mtime +14 -delete

echo "[RedisBackup] redis_$DATE.tar.gz done"
