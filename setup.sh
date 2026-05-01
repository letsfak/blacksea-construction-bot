#!/usr/bin/env bash
set -euo pipefail

# Construction Site Bot — First-time setup
# Usage: bash setup.sh

echo "=== Construction Site Bot Setup ==="
echo ""

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required (18+). Install from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18+ required. Found: $(node --version)"
  exit 1
fi
echo "Node.js: $(node --version) (OK)"

# Check npm
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required. It ships with Node.js."
  exit 1
fi
echo "npm: $(npm --version) (OK)"

# Environment file
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo ""
    echo "Created .env from .env.example"
    echo "  --> Edit .env and fill in your values before starting the bot"
  else
    echo "Warning: .env.example not found. Create .env manually."
  fi
else
  echo ".env: already exists (skipped)"
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env with your configuration:"
echo "       TELEGRAM_TOKEN      — from @BotFather on Telegram"
echo "       FIREBASE_CREDENTIALS — stringified service account JSON"
echo "       OPENAI_API_KEY      — from https://platform.openai.com"
echo "       ADMIN_CHAT_ID       — your Telegram ID"
echo "       DEFAULT_FIRMA_ID    — your company slug (e.g. acme-insaat)"
echo ""
echo "  2. Start the bot:"
echo "       npm start"
echo ""
echo "  3. Run smoke tests:"
echo "       node smoke_test.mjs"
echo ""
echo "  4. Using Claude Code?"
echo "       claude"
echo "       (CLAUDE.md loads automatically with full project context)"
echo ""
echo "  See README.md for full documentation."
