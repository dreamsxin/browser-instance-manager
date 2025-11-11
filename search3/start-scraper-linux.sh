#!/bin/bash

# 启动脚本 for Linux 服务器

# 启动 Xvfb
echo "启动 Xvfb 虚拟显示..."
Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!

# 等待 Xvfb 启动
sleep 2

# 设置环境变量
export DISPLAY=:99

echo "虚拟显示: DISPLAY=:99"

# 启动 scraper
cd "$(dirname "$0")"
node server.js

# 清理
echo "停止 Xvfb..."
kill $XVFB_PID