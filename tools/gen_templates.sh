#!/bin/bash
# Synthesize template WAVs (16k mono PCM16) for game items without recordings.
# Each item maps to a representative first-tone-ish character.
set -e
OUT=~/Documents/github/zhuyin-vanilla/audio/templates
declare -a items=(
  "ia 鴨" "io 唷" "ie 耶" "ian 煙" "in 因" "iang 央" "ing 英" "iou 優"
  "ua 蛙" "uo 窩" "uai 歪" "uei 威" "uan 彎" "uen 溫" "uang 汪" "ueng 翁"
  "yue 約" "yuan 冤" "yun 暈" "yung 庸"
  "ba 八" "ma 媽" "da 搭" "tu 突" "gou 勾" "hua 花" "mi 咪" "shu 書"
  "jia 家" "qiu 秋" "xing 星" "zhu 豬" "chuan 川" "shui 水" "niao 鳥" "mao 貓"
)
for pair in "${items[@]}"; do
  id=${pair%% *}; ch=${pair##* }
  say -v Meijia -o /tmp/tpl.aiff "$ch"
  afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/tpl.aiff "$OUT/$id.wav"
  echo "$id ← $ch"
done
ls "$OUT" | wc -l
