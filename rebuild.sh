docker build -t boar-game-dev . && docker rm -f boar-game-dev && docker run -d \
  --name boar-game-dev \
  -p 3001:3000 \
  -v /projects/boars-dev/database.db:/app/database.db \
  -e APP_ROOT=/boar-game-dev \
  --restart unless-stopped \
  boar-game-dev
