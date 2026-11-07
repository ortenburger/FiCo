#!/usr/bin/env bash
# Builds the final pitch+demo video with a scene-timed voiceover.
#   ELEVENLABS_API_KEY=sk_... pitch/voiceover/build.sh          # ElevenLabs (needs text_to_speech permission)
#   pitch/voiceover/build.sh say                                 # local macOS voice (preview only)
#   pitch/voiceover/build.sh silent                              # video only, add audio later
# Optional: VOICE_ID (default Rachel), INTRO, SCREENCAST, OUT, MODEL_ID
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MODE="${1:-eleven}"
INTRO="${INTRO:-$ROOT/pitch/out/fico-pitch.mp4}"
SCREENCAST="${SCREENCAST:-$(ls "$ROOT"/../Screencast*.mp4 | head -1)}"
OUT="${OUT:-$ROOT/../FiCo_Demo_Final.mp4}"
VOICE_ID="${VOICE_ID:-21m00Tcm4TlvDq8ikWAM}"
MODEL_ID="${MODEL_ID:-eleven_multilingual_v2}"
INTRO_SECONDS="${INTRO_SECONDS:-35}"
TAIL_HOLD="${TAIL_HOLD:-5}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

VIDEO_FILTER="[0:v]fps=30,format=yuv420p,setsar=1[a];[1:v]scale=1920:-2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x14181F,fps=30,format=yuv420p,setsar=1[b];[a][b]concat=n=2:v=1:a=0,tpad=stop_mode=clone:stop_duration=${TAIL_HOLD}[v]"
BASE=(-y -t "$INTRO_SECONDS" -i "$INTRO" -i "$SCREENCAST")

if [ "$MODE" = "silent" ]; then
  ffmpeg -v error "${BASE[@]}" -filter_complex "$VIDEO_FILTER" -map "[v]" -c:v libx264 -preset veryfast -crf 20 -movflags +faststart "$OUT"
  echo "silent video: $OUT"; exit 0
fi

i=0; INPUTS=(); LABELS=""
while IFS=$'\t' read -r START TEXT; do
  [ -z "${TEXT:-}" ] && continue
  i=$((i+1)); F="$WORK/seg$i.mp3"
  if [ "$MODE" = "say" ]; then
    say -v Samantha -r 170 "$TEXT" -o "$WORK/seg$i.aiff"; ffmpeg -v error -y -i "$WORK/seg$i.aiff" "$F"
  else
    : "${ELEVENLABS_API_KEY:?set ELEVENLABS_API_KEY}"
    BODY="$(python3 -c 'import json,sys;print(json.dumps({"text":sys.argv[1],"model_id":sys.argv[2],"voice_settings":{"stability":0.45,"similarity_boost":0.8,"style":0.25,"use_speaker_boost":True}}))' "$TEXT" "$MODEL_ID")"
    CODE="$(curl -s -o "$F" -w '%{http_code}' -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID?output_format=mp3_44100_128" -H "xi-api-key: $ELEVENLABS_API_KEY" -H 'Content-Type: application/json' -d "$BODY")"
    [ "$CODE" = "200" ] || { echo "ElevenLabs HTTP $CODE: $(head -c 300 "$F")" >&2; exit 1; }
  fi
  MS="$(python3 -c 'import sys;print(int(float(sys.argv[1])*1000))' "$START")"
  INPUTS+=(-i "$F"); LABELS+="[$((i+1)):a]adelay=${MS}|${MS}[s$i];"
done < "$HERE/segments.tsv"

MIX=""; for n in $(seq 1 $i); do MIX+="[s$n]"; done
FILTER="$VIDEO_FILTER;${LABELS}${MIX}amix=inputs=$i:normalize=0,loudnorm=I=-16:TP=-1.5[aud]"
ffmpeg -v error "${BASE[@]}" "${INPUTS[@]}" -filter_complex "$FILTER" -map "[v]" -map "[aud]" -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 192k -movflags +faststart "$OUT"
echo "done ($MODE): $OUT"
