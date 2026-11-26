#!/usr/bin/env sh
# One-step setup for macOS and Linux. Installs anything missing (Node.js, uv),
# then all packages, models and the render browser.
#   sh setup.sh
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "Installing Node.js..."; brew install node
  elif command -v apt-get >/dev/null 2>&1; then
    echo "Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    echo "Please install Node.js 20 or newer from https://nodejs.org, then run this again."; exit 1
  fi
fi

echo "Installing packages..."
npm install --no-fund --no-audit
echo "Installing the audio tools and models (about 3 GB, once)..."
npm run setup
npm run doctor
