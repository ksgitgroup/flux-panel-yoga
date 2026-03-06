#!/usr/bin/env bash
set -euo pipefail

source_branch="${CI_MERGE_REQUEST_SOURCE_BRANCH_NAME:-}"
target_branch="${CI_MERGE_REQUEST_TARGET_BRANCH_NAME:-}"
mr_title="$(printf '%s' "${CI_MERGE_REQUEST_TITLE:-}" | tr -d '\r')"
mr_description="$(printf '%s' "${CI_MERGE_REQUEST_DESCRIPTION:-}" | tr -d '\r')"

if [[ "${source_branch}" != "dev" || "${target_branch}" != "main" ]]; then
  echo "skip: only validate dev -> main merge requests"
  exit 0
fi

trimmed_title="$(printf '%s' "${mr_title}" | awk '{$1=$1};1')"
normalized_title="$(printf '%s' "${trimmed_title}" | tr '[:upper:]' '[:lower:]')"
required_sections=(
  "## 发布摘要"
  "## 本次变更"
  "## 本地验证"
  "## 风险与回滚"
)

errors=()

if [[ -z "${trimmed_title}" ]]; then
  errors+=("MR 标题不能为空。")
fi

if [[ "${normalized_title}" == "dev" || "${normalized_title}" == "merge branch 'dev' into 'main'" ]]; then
  errors+=("MR 标题不能只写 dev，请明确本次发布主题。")
fi

if [[ ${#trimmed_title} -lt 12 ]]; then
  errors+=("MR 标题过短，请至少写清发布主题和范围。")
fi

for section in "${required_sections[@]}"; do
  if ! grep -Fq "${section}" <<< "${mr_description}"; then
    errors+=("MR 描述缺少必填章节：${section}")
  fi
done

if ! grep -Eq '^- \[[ xX]\] ' <<< "${mr_description}"; then
  errors+=("MR 描述缺少验证勾选项，请按模板填写。")
fi

if (( ${#errors[@]} > 0 )); then
  echo "release MR validation failed:"
  for item in "${errors[@]}"; do
    echo " - ${item}"
  done
  echo
  echo "建议使用 .gitlab/merge_request_templates/Default.md 或 scripts/prepare_release_mr.sh 生成描述。"
  exit 1
fi

echo "release MR validation passed"
