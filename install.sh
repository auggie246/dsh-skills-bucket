#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src_dir="$repo_root/skills"
dst_dir="${DSH_HOME:-$HOME/.dsh}/skills"

if [[ ! -d "$src_dir" ]]; then
  echo "No skills/ directory found in $repo_root" >&2
  exit 1
fi

if [[ "$#" -gt 0 ]]; then
  skills=("$@")
else
  skills=()
  for d in "$src_dir"/*/; do
    skills+=("$(basename "$d")")
  done
fi

if [[ "${#skills[@]}" -eq 0 ]]; then
  echo "No skills found in $src_dir" >&2
  exit 1
fi

mkdir -p "$dst_dir"

for name in "${skills[@]}"; do
  src="$src_dir/$name"
  dst="$dst_dir/$name"
  if [[ ! -d "$src" ]]; then
    echo "Skipping '$name': not found in $src_dir" >&2
    continue
  fi
  if [[ -e "$dst" ]]; then
    echo "Replacing existing skill: $dst"
    rm -rf "$dst"
  fi
  cp -R "$src" "$dst"
  echo "Installed: $name -> $dst"
done
