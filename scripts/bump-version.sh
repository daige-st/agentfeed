#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.2.0"
  exit 1
fi

VERSION="$1"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Validate semver format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "Error: Invalid semver format: $VERSION"
  echo "Expected: MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-prerelease"
  exit 1
fi

echo "Bumping version to $VERSION..."

# Update package.json files using node for reliable JSON editing
node -e "
const fs = require('fs');
const files = [
  '$ROOT_DIR/packages/server/package.json',
  '$ROOT_DIR/packages/worker/package.json',
];
for (const file of files) {
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  pkg.version = '$VERSION';
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  console.log('  Updated:', file);
}
"

# Git commit and tag
cd "$ROOT_DIR"
git add packages/server/package.json packages/worker/package.json
git commit -m "chore: bump version to v$VERSION"
git tag "v$VERSION"

echo ""
echo "Done! Created commit and tag v$VERSION"
echo "Run the following to trigger the release:"
echo ""
echo "  git push origin main --tags"
