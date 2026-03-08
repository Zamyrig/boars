#!/bin/bash
DEV_DIR="/projects/boars-dev"
PROD_DIR="/projects/boars"

# ============================================================
# БЛЕКЛИСТ — файлы и папки которые НЕ копируются в prod
# ============================================================
BLACKLIST=(
    "database.db"
    "docker-compose.yml"
    "update.sh"
    "rebuild.sh"
    ".env"
    # добавляй сюда что не надо копировать
)

# ============================================================
echo "Копируем файлы из dev в prod..."
for file in "$DEV_DIR"/*; do
    filename=$(basename "$file")

    skip=0
    for blocked in "${BLACKLIST[@]}"; do
        if [ "$filename" = "$blocked" ]; then
            echo "  Пропускаем: $filename"
            skip=1
            break
        fi
    done
    [ $skip -eq 1 ] && continue

    # Всё копируем как есть — пути управляются через APP_ROOT в docker-compose.yml
    if [ -d "$file" ]; then
        cp -r "$file" "$PROD_DIR/"
        echo "  Скопировано (папка): $filename"
    else
        cp "$file" "$PROD_DIR/$filename"
        echo "  Скопировано: $filename"
    fi
done

echo ""
echo "Пересобираем и перезапускаем prod..."
cd "$PROD_DIR" && docker compose up -d --build

echo ""
echo "Готово! Prod обновлён."
