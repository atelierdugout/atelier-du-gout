#!/bin/zsh

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

PROJECT="/Users/nickmarch/Documents/GitHub/atelier-du-gout"
TEMP_DB="/tmp/adg-backup-database-url.txt"

cd "$PROJECT" || exit 1

cleanup() {
  /bin/rm -f "$TEMP_DB"
}

trap cleanup EXIT

/bin/rm -f "$TEMP_DB"

npx netlify-cli env:get DATABASE_URL > "$TEMP_DB" || exit 1

DATABASE_URL_VALUE="$(/bin/cat "$TEMP_DB")"

if [[ "$DATABASE_URL_VALUE" != postgres* ]]; then
  echo "DATABASE_URL invalide ou absente."
  exit 1
fi

if ! BACKUP_DATABASE_URL="$DATABASE_URL_VALUE" /usr/local/bin/node scripts/backup.mjs; then
  echo "ERREUR : la sauvegarde a échoué. Rétention annulée." >&2
  exit 1
fi

# ---------- RÉTENTION ----------
# Conserver uniquement les 14 dernières sauvegardes complètes.

KEEP=14

LOCAL_BACKUPS="$PROJECT/../atelier-du-gout-backups"
ICLOUD_BACKUPS="$HOME/Library/Mobile Documents/com~apple~CloudDocs/L Atelier du Gout/Sauvegardes Boutique"

rotate_backups() {
  backup_root="$1"

  [ -d "$backup_root" ] || return 0

  backup_count=$(
    /usr/bin/find "$backup_root" \
      -maxdepth 1 \
      -type d \
      -name 'complete-*' \
    | /usr/bin/wc -l \
    | /usr/bin/tr -d ' '
  )

  if [ "$backup_count" -le "$KEEP" ]; then
    return 0
  fi

  /usr/bin/find "$backup_root" \
    -maxdepth 1 \
    -type d \
    -name 'complete-*' \
    -print0 \
  | /usr/bin/xargs -0 /bin/ls -dt \
  | /usr/bin/tail -n "+$((KEEP + 1))" \
  | while IFS= read -r old_backup; do
      case "$old_backup" in
        "$backup_root"/complete-*)
          echo "Suppression ancienne sauvegarde : $old_backup"
          /bin/rm -rf -- "$old_backup"
          ;;
        *)
          echo "REFUS suppression chemin inattendu : $old_backup"
          ;;
      esac
    done
}

rotate_backups "$LOCAL_BACKUPS"
rotate_backups "$ICLOUD_BACKUPS"

echo "Rétention : OK — 14 dernières sauvegardes conservées."
