#!/usr/bin/env bash
# Makes the website copies of the rendered films: a 720p MP4 and a poster image for each.
#   bash media/publish.sh home 16.5     # film name, poster time in seconds
set -euo pipefail
cd "$(dirname "$0")/.."
name=$1; poster=${2:-10}
mkdir -p public/media
ffmpeg -loglevel error -y -i "media/out/$name.mp4" -vf "scale=1280:720:flags=lanczos" -c:v libx264 -preset slow -crf 24 \
  -c:a aac -b:a 128k -movflags +faststart "public/media/$name.mp4"
ffmpeg -loglevel error -y -ss "$poster" -i "media/out/$name.mp4" -frames:v 1 -vf "scale=1280:720:flags=lanczos" -q:v 4 "public/media/$name.jpg"
ls -la "public/media/$name".*
