#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# persistence.sh — Hugging Face Spaces persistent storage setup
#
# Problem this solves:
#   On Hugging Face Spaces, the container filesystem (under /home, /root,
#   /app, /tmp, etc.) is EPHEMERAL — every redeploy wipes it. The ONLY
#   persistent path is /data, which is mounted as a volume IF you've
#   enabled a persistent storage tier in Space Settings → Files.
#
#   Before this script, user accounts, workspaces, and audit logs were
#   written to /home/cloudshell/.jasbol-users — which got wiped on every
#   redeploy, deleting every user's account and forcing them to re-signup.
#   It also broke the login flow: existing JWTs pointed at user IDs that
#   no longer existed → /api/auth/verify returned 401 → redirect loop.
#
# What this script does:
#   1. Detects whether /data exists and is writable (HF persistent tier).
#   2. If yes:
#        - Creates /data/jasbol-users and /data/workspaces
#        - Symlinks /home/cloudshell/.jasbol-users → /data/jasbol-users
#        - Symlinks /home/cloudshell/workspaces   → /data/workspaces
#        - If existing data is in the old non-persistent path, migrates
#          it into /data ONCE (so we don't lose accounts during the
#          first deploy after enabling persistent storage).
#   3. If /data is NOT available (no persistent tier), falls back to the
#        old in-container paths and prints a loud warning so the user
#        knows to enable persistent storage on the Space.
#
# This script is idempotent — safe to run on every container start.
# ─────────────────────────────────────────────────────────────────────

set -uo pipefail

PERSIST_ROOT="/data"
OLD_USERS_DIR="/home/cloudshell/.jasbol-users"
OLD_WORKSPACES_DIR="/home/cloudshell/workspaces"
NEW_USERS_DIR="${PERSIST_ROOT}/jasbol-users"
NEW_WORKSPACES_DIR="${PERSIST_ROOT}/workspaces"

# ─── Detect persistent storage ────────────────────────────────────
persist_available=0
if [ -d "${PERSIST_ROOT}" ] && [ -w "${PERSIST_ROOT}" ]; then
    persist_available=1
fi

if [ "${persist_available}" = "1" ]; then
    echo "[persistence] ✓ Hugging Face persistent storage detected at ${PERSIST_ROOT}"

    # Create target directories if missing
    mkdir -p "${NEW_USERS_DIR}" 2>/dev/null || true
    mkdir -p "${NEW_WORKSPACES_DIR}" 2>/dev/null || true
    chown -R cloudshell:cloudshell "${NEW_USERS_DIR}" 2>/dev/null || true
    chown -R cloudshell:cloudshell "${NEW_WORKSPACES_DIR}" 2>/dev/null || true

    # ─── Migrate existing users.json if it's in the old path ───
    # We only migrate if /data/jasbol-users/users.json doesn't yet exist
    # (first deploy after enabling persistent storage) — otherwise we'd
    # overwrite newer data with older data.
    if [ -f "${OLD_USERS_DIR}/users.json" ] && [ ! -f "${NEW_USERS_DIR}/users.json" ]; then
        echo "[persistence] Migrating existing users.json → ${NEW_USERS_DIR}/"
        cp -a "${OLD_USERS_DIR}/." "${NEW_USERS_DIR}/" 2>/dev/null || true
        chown -R cloudshell:cloudshell "${NEW_USERS_DIR}" 2>/dev/null || true
        # Backup the old copy in case something goes wrong
        mv "${OLD_USERS_DIR}" "${OLD_USERS_DIR}.pre-migrate.$(date +%s)" 2>/dev/null || true
    fi

    # ─── Migrate existing workspaces ───
    # Move per-user workspace dirs into the persistent volume. Use rsync-like
    # behavior: only copy if target is empty, otherwise leave alone.
    if [ -d "${OLD_WORKSPACES_DIR}" ]; then
        old_count=$(find "${OLD_WORKSPACES_DIR}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
        new_count=$(find "${NEW_WORKSPACES_DIR}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
        if [ "${old_count}" -gt 0 ] && [ "${new_count}" -eq 0 ]; then
            echo "[persistence] Migrating ${old_count} workspace(s) → ${NEW_WORKSPACES_DIR}/"
            cp -a "${OLD_WORKSPACES_DIR}/." "${NEW_WORKSPACES_DIR}/" 2>/dev/null || true
            chown -R cloudshell:cloudshell "${NEW_WORKSPACES_DIR}" 2>/dev/null || true
            mv "${OLD_WORKSPACES_DIR}" "${OLD_WORKSPACES_DIR}.pre-migrate.$(date +%s)" 2>/dev/null || true
        fi
    fi

    # ─── Replace old dirs with symlinks to /data ───
    # This way, code that hardcodes /home/cloudshell/.jasbol-users keeps
    # working, but writes actually land in /data.
    for old_new in "${OLD_USERS_DIR}:${NEW_USERS_DIR}" "${OLD_WORKSPACES_DIR}:${NEW_WORKSPACES_DIR}"; do
        old_path="${old_new%%:*}"
        new_path="${old_new##*:}"
        # If old path exists and is NOT a symlink, remove the (now-migrated) dir
        if [ -e "${old_path}" ] && [ ! -L "${old_path}" ]; then
            rm -rf "${old_path}" 2>/dev/null || true
        fi
        # Create symlink if not already present
        if [ ! -L "${old_path}" ]; then
            ln -sfn "${new_path}" "${old_path}"
            echo "[persistence] ${old_path} → ${new_path} (symlinked)"
        fi
        # Ensure cloudshell owns the symlink target
        chown -h cloudshell:cloudshell "${old_path}" 2>/dev/null || true
    done

    # Export env vars so the Next.js server picks them up directly
    export USERS_DIR="${NEW_USERS_DIR}"
    export WORKSPACE_BASE="${NEW_WORKSPACES_DIR}"
    echo "[persistence] USERS_DIR=${USERS_DIR}"
    echo "[persistence] WORKSPACE_BASE=${WORKSPACE_BASE}"

else
    # ─── No persistent storage — fall back to in-container paths ───
    echo "[persistence] ⚠ /data not available — using in-container storage only."
    echo "[persistence] ⚠ USER ACCOUNTS AND WORKSPACES WILL BE LOST ON REDEPLOY."
    echo "[persistence] ⚠ To fix: enable Persistent Storage in HF Space Settings → Files."
    mkdir -p "${OLD_USERS_DIR}" 2>/dev/null || true
    mkdir -p "${OLD_WORKSPACES_DIR}" 2>/dev/null || true
    chown -R cloudshell:cloudshell "${OLD_USERS_DIR}" "${OLD_WORKSPACES_DIR}" 2>/dev/null || true
    # Don't override USERS_DIR/WORKSPACE_BASE — let auth.ts fall back to defaults
fi

# Export a flag other scripts can check
echo "JASBOL_PERSIST_AVAILABLE=${persist_available}"
