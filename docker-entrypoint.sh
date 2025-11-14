#!/bin/sh

# Use PORT environment variable if set, otherwise default to 8080
PORT=${PORT:-8080}

# Replace the port in nginx configuration
sed -i "s/listen 8080;/listen ${PORT};/g" /etc/nginx/conf.d/default.conf

# Start nginx in foreground
nginx -g "daemon off;"
