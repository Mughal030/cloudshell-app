#!/usr/bin/env bash
# Re-adds the GitHub origin remote (git-filter-repo removed it for safety)
# and force-pushes the cleaned history.
#
# Two auth methods supported:
#   1. Personal Access Token (default):  GH_TOKEN=ghp_xxxx bash scripts/push-to-github.sh
#   2. SSH (if you have an SSH key set up with GitHub): bash scripts/push-to-github.sh --ssh
#
# After running once with a token, you can push normally with: git push origin main --force

set -euo pipefail

USER="Mughal030"
REPO="cloudshell-app"
USE_SSH=0

if [[ "${1:-}" == "--ssh" ]]; then
  USE_SSH=1
elif [[ -z "${GH_TOKEN:-}" ]]; then
  echo "ERROR: set GH_TOKEN env var to your GitHub Personal Access Token," >&2
  echo "       or pass --ssh if you have an SSH key configured with GitHub." >&2
  echo "" >&2
  echo "  Token example: GH_TOKEN=ghp_xxxx bash scripts/push-to-github.sh" >&2
  echo "  SSH example:   bash scripts/push-to-github.sh --ssh" >&2
  exit 1
fi

# Remove existing origin (if any)
git remote remove origin 2>/dev/null || true

if [[ "$USE_SSH" == "1" ]]; then
  git remote add origin "git@github.com:${USER}/${REPO}.git"
  echo "[push-to-github] Using SSH: git@github.com:${USER}/${REPO}.git"
else
  git remote add origin "https://${USER}:${GH_TOKEN}@github.com/${USER}/${REPO}.git"
  echo "[push-to-github] Using token auth (token hidden in remote URL)."
fi

echo "[push-to-github] Force-pushing cleaned history (admin API keys have been redacted)..."
git push origin main --force-with-lease

echo ""
echo "[push-to-github] ✓ Done. Verify at: https://github.com/${USER}/${REPO}"
echo ""
echo "Next steps:"
echo "  1. Confirm no sk- keys appear in any commit:"
echo "     git log --all -p | grep -E 'sk-[A-Za-z0-9]{20}' || echo 'clean'"
echo "  2. (Optional) Remove the token from the remote URL to avoid leaving it in .git/config:"
echo "     git remote set-url origin https://github.com/${USER}/${REPO}.git"
