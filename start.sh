#!/bin/sh
# Запуск для Linux и macOS. Всё остальное делает start.mjs.
exec node "$(dirname "$0")/start.mjs" "$@"
