#!/usr/bin/env bash
# Start Nexus Search Engine (development mode)
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing dependencies..."
pip install -q -r "$ROOT/requirements.txt"

echo "==> Starting Nexus Search on http://localhost:5000"
cd "$ROOT/backend"
python app.py
