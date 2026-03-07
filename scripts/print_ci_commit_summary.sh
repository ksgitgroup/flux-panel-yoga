#!/usr/bin/env bash
set -euo pipefail

version="$(awk -F'"' '/"version"/ {print $4; exit}' vite-frontend/package.json)"
branch="${CI_COMMIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo local)}"
current_sha="${CI_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo HEAD)}"
current_short="${CI_COMMIT_SHORT_SHA:-$(git rev-parse --short "${current_sha}" 2>/dev/null || echo local)}"
before_sha="${CI_COMMIT_BEFORE_SHA:-}"
zero_sha="0000000000000000000000000000000000000000"

echo "🔖 发布版本: v${version}"
echo "🧬 当前提交: ${branch}.${current_short}"

if [[ -n "${before_sha}" && "${before_sha}" != "${zero_sha}" ]] && git cat-file -e "${before_sha}^{commit}" >/dev/null 2>&1; then
  range="${before_sha}..${current_sha}"
  echo "📝 本次提交范围: ${range}"
  summary="$(git log --reverse --no-merges --pretty=' - %h %s' "${range}" 2>/dev/null || true)"
else
  echo "📝 未获取到 CI_COMMIT_BEFORE_SHA，回退为最近 10 条提交摘要"
  summary="$(git log --reverse --no-merges --pretty=' - %h %s' -n 10 2>/dev/null || true)"
fi

if [[ -z "${summary}" ]]; then
  summary=" - 当前范围内没有可展示的非 merge 提交"
fi

echo "${summary}"
