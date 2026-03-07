#!/usr/bin/env bash
set -euo pipefail

target_branch="${1:-main}"
source_ref="${2:-HEAD}"
version="$(awk -F'"' '/"version"/ {print $4; exit}' vite-frontend/package.json)"
release_title="release: sync dev -> ${target_branch} for v${version}"
commit_range="origin/${target_branch}..${source_ref}"
commit_list="$(git log --reverse --no-merges --pretty=format:'- %h %s' "${commit_range}" 2>/dev/null || true)"

if [[ -z "${commit_list}" ]]; then
  commit_list="- 无新增提交，通常说明本地未 fetch 或当前分支已与目标分支对齐"
fi

cat <<EOF
${release_title}

## 发布摘要
- 发布目标：将 dev 最新稳定改动合入 ${target_branch}
- 发布版本：v${version}
- 关联提交范围：${commit_range}

## 本次变更
${commit_list}

## 本地验证
- [ ] ./scripts/verify_build.sh 已通过
- [ ] ./scripts/build_docker.sh 已通过（如涉及运行时/镜像改动）
- [ ] ./scripts/reload_local_stack.sh 已执行并完成本地回归

## 风险与回滚
- 风险点：
- 回滚方式：如发布后发现异常，立即回退到上一条 main 提交并重新触发部署
EOF
