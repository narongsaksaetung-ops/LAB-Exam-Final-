#!/bin/sh
set -e
# Fix uploads directory ownership at runtime.
# Docker named volumes are created by the daemon as root; this ensures
# our non-root app user can always write to /app/uploads even on first run.
mkdir -p /app/uploads
chown nodejs:nodejs /app/uploads
chmod 755 /app/uploads
# Drop privileges and exec the Node process as nodejs user
exec su-exec nodejs "$@"
