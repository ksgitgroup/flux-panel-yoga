#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-/etc/flux-1panel-sync/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

require_var() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    printf 'missing required env: %s\n' "$key" >&2
    exit 1
  fi
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf 'missing required command: %s\n' "$cmd" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd jq
require_cmd md5sum

require_var FLUX_URL
require_var FLUX_INSTANCE_KEY
require_var FLUX_NODE_TOKEN
require_var PANEL_BASE_URL
require_var PANEL_API_KEY

PANEL_VERIFY_TLS="${PANEL_VERIFY_TLS:-false}"
PANEL_TIMEOUT_MS="${PANEL_TIMEOUT_MS:-8000}"
BACKUP_TYPES="${BACKUP_TYPES:-app,website,mysql,mariadb,postgresql,redis}"
EXPORTER_VERSION="${EXPORTER_VERSION:-v1-shell}"

if [[ "$PANEL_VERIFY_TLS" == "false" ]]; then
  CURL_TLS_ARGS=(-k)
else
  CURL_TLS_ARGS=()
fi

PANEL_TIMEOUT_SEC=$(( (PANEL_TIMEOUT_MS + 999) / 1000 ))
if (( PANEL_TIMEOUT_SEC < 3 )); then
  PANEL_TIMEOUT_SEC=3
fi

timestamp_now() {
  date +%s
}

md5_hex() {
  printf '%s' "$1" | md5sum | awk '{print $1}'
}

iso_to_epoch_ms() {
  local value="$1"
  if [[ -z "$value" || "$value" == "null" ]]; then
    printf 'null'
    return
  fi
  local seconds
  seconds=$(date -d "$value" +%s 2>/dev/null || true)
  if [[ -z "$seconds" ]]; then
    printf 'null'
    return
  fi
  printf '%s000' "$seconds"
}

panel_headers() {
  local ts="$1"
  local token
  token="$(md5_hex "1panel${PANEL_API_KEY}${ts}")"
  printf '1Panel-Token: %s\n1Panel-Timestamp: %s\n' "$token" "$ts"
}

api_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local ts
  ts="$(timestamp_now)"
  local auth_header token_header ts_header
  auth_header="$(panel_headers "$ts")"
  token_header="$(printf '%s\n' "$auth_header" | sed -n '1p')"
  ts_header="$(printf '%s\n' "$auth_header" | sed -n '2p')"
  local url="${PANEL_BASE_URL%/}/api/v2${path}"

  if [[ "$method" == "GET" ]]; then
    curl -fsS "${CURL_TLS_ARGS[@]}" \
      --connect-timeout "$PANEL_TIMEOUT_SEC" \
      --max-time "$PANEL_TIMEOUT_SEC" \
      -H "$token_header" \
      -H "$ts_header" \
      "$url"
  else
    curl -fsS "${CURL_TLS_ARGS[@]}" \
      --connect-timeout "$PANEL_TIMEOUT_SEC" \
      --max-time "$PANEL_TIMEOUT_SEC" \
      -H "$token_header" \
      -H "$ts_header" \
      -H "Content-Type: application/json" \
      -X "$method" \
      --data "${body:-{}}" \
      "$url"
  fi
}

extract_data() {
  jq -c '.data // {}'
}

extract_items() {
  jq -c '.data.items // .data // []'
}

safe_get_data() {
  local path="$1"
  api_request GET "$path" | extract_data 2>/dev/null || printf '{}'
}

safe_post_data() {
  local path="$1"
  local body="$2"
  api_request POST "$path" "$body" | extract_data 2>/dev/null || printf '{}'
}

safe_post_items() {
  local path="$1"
  local body="$2"
  api_request POST "$path" "$body" | extract_items 2>/dev/null || printf '[]'
}

os_json="$(safe_get_data "/dashboard/base/os")"
node_json="$(safe_get_data "/dashboard/current/node")"
apps_json="$(safe_post_items "/apps/installed/search" '{"all":true,"page":1,"pageSize":200,"name":"","type":"","tags":[],"update":false,"unused":false,"sync":false,"checkUpdate":false}')"
websites_json="$(safe_post_items "/websites/search" '{"page":1,"pageSize":200,"name":"","orderBy":"created_at","order":"descending","websiteGroupId":0,"type":""}')"
containers_json="$(safe_post_items "/containers/search" '{"page":1,"pageSize":200,"name":"","state":"all","orderBy":"createdAt","order":"descending","filters":"","excludeAppStore":false}')"
container_stats_json="$(safe_get_data "/containers/list/stats")"
cronjobs_json="$(safe_post_items "/cronjobs/search" '{"page":1,"pageSize":200,"info":"","groupIDs":[],"orderBy":"createdAt","order":"descending"}')"
snapshots_json="$(safe_post_items "/settings/snapshot/search" '{"page":1,"pageSize":100,"info":"","orderBy":"createdAt","order":"descending"}')"
login_logs_json="$(safe_post_items "/core/logs/login" '{"page":1,"pageSize":100,"ip":"","status":""}')"
operation_logs_json="$(safe_post_items "/core/logs/operation" '{"page":1,"pageSize":100,"source":"","status":"","node":"","operation":""}')"

backup_records_json="$(
  IFS=',' read -r -a backup_types <<<"$BACKUP_TYPES"
  for backup_type in "${backup_types[@]}"; do
    safe_post_items "/backups/record/search" "{\"page\":1,\"pageSize\":20,\"type\":\"${backup_type}\",\"name\":\"\",\"detailName\":\"\"}"
  done | jq -cs 'add'
)"

apps_summary="$(
  jq -c '
    map({
      appKey: (.appKey // .appName // .key // null),
      name: (.name // .appName // .appKey // .key // null),
      version: (.version // .appVersion // .installedVersion // null),
      status: (.status // .appStatus // .containerStatus // null),
      accessUrl: (.accessUrl // .website // .httpUrl // null),
      portSummary: (
        .portSummary
        // ([.httpPort, .httpsPort, .port, .allowPort] | map(select(. != null and . != "")) | join(" / "))
        // null
      ),
      upgradeAvailable: (.canUpdate // .upgradeAvailable // .isUpdate // false),
      updatedAt: null
    })
  ' <<<"$apps_json"
)"

websites_summary="$(
  jq -c '
    map({
      websiteId: (.id // .websiteId // null),
      name: (.alias // .primaryDomain // .domain // .name // null),
      primaryDomain: (.primaryDomain // .domain // .name // null),
      status: (.status // .state // null),
      httpsEnabled: ((.https == true) or (.enableHTTPS == true) or (.ssl == true)),
      certExpireAt: null,
      proxyCount: (.proxyCount // (.proxyHosts | length?) // 0),
      runtimeName: (.runtimeName // .runtimeType // null)
    })
  ' <<<"$websites_json"
)"

containers_summary="$(
  jq -n \
    --argjson items "$containers_json" \
    --argjson stats "$container_stats_json" '
    ($stats // []) as $statsMap |
    $items | map(
      . as $item |
      ($statsMap[]? | select((.name // "") == ($item.name // ""))) as $stat |
      {
        containerId: ($item.containerID // $item.id // null),
        name: ($item.name // null),
        image: ($item.imageName // $item.image // null),
        composeProject: ($item.composeName // $item.composeProject // null),
        status: ($item.state // $item.status // null),
        cpuPercent: (($stat.cpuPercent // $stat.cpu // null) | if . == null then null else tonumber? end),
        memoryPercent: (($stat.memoryPercent // $stat.memPercent // null) | if . == null then null else tonumber? end),
        portSummary: ((($item.ports // []) | map(tostring)) | join(", "))
      }
    )
  '
)"

cronjobs_summary="$(
  jq -c '
    map({
      cronjobId: (.id // null),
      name: (.name // null),
      type: (.type // .taskType // null),
      status: (.status // null),
      schedule: (.spec // .cronSpec // null),
      lastRecordStatus: (.lastStatus // .lastRecordStatus // null),
      lastRecordAt: null
    })
  ' <<<"$cronjobs_json"
)"

backups_summary="$(
  jq -n \
    --argjson backups "$backup_records_json" \
    --argjson snapshots "$snapshots_json" '
    def epochms(v):
      if v == null or v == "" then null else v end;
    [
      (
        ($backups | group_by(.accountType // .type // "unknown")[]) as $group |
        ($group[0]) as $first |
        {
          backupType: ($first.accountType // $first.type // "unknown"),
          sourceName: ($first.accountName // $first.name // ($first.accountType // $first.type // "unknown")),
          lastRecordStatus: ($first.status // null),
          lastBackupAt: null,
          snapshotCount: 0,
          latestSnapshotAt: null
        }
      ),
      (
        if ($snapshots | length) > 0 then
          {
            backupType: "snapshot",
            sourceName: "系统快照",
            lastRecordStatus: ($snapshots[0].status // null),
            lastBackupAt: null,
            snapshotCount: ($snapshots | length),
            latestSnapshotAt: null
          }
        else empty end
      )
    ]
  '
)"

login_failed_count="$(jq '[.[] | select((.status // "") != "Success" and (.status // "") != "success")] | length' <<<"$login_logs_json")"
operation_count="$(jq 'length' <<<"$operation_logs_json")"
risky_operation_count="$(jq '[.[] | select(((.detailZH // "") + " " + (.detailEN // "") + " " + (.path // "")) | test("删除|重启|恢复|rollback|delete|restart|recover"; "i"))] | length' <<<"$operation_logs_json")"
last_login_at="$(jq -r '.[0].createdAt // empty' <<<"$login_logs_json")"
last_operation_at="$(jq -r '.[0].createdAt // empty' <<<"$operation_logs_json")"
snapshot_count="$(jq 'length' <<<"$snapshots_json")"

last_login_epoch="$(iso_to_epoch_ms "$last_login_at")"
last_operation_epoch="$(iso_to_epoch_ms "$last_operation_at")"
report_time_ms="$(($(date +%s) * 1000))"

payload="$(
  jq -n \
    --arg instanceKey "$FLUX_INSTANCE_KEY" \
    --arg exporterVersion "$EXPORTER_VERSION" \
    --arg panelBaseUrl "$PANEL_BASE_URL" \
    --argjson reportTime "$report_time_ms" \
    --arg panelVersion "$(jq -r '.version // .appVersion // empty' <<<"$os_json")" \
    --arg panelEdition "$(jq -r '.edition // .licenseEdition // empty' <<<"$os_json")" \
    --arg hostName "$(jq -r '.hostname // .hostName // empty' <<<"$os_json")" \
    --arg osName "$(jq -r '.platform // .os // .name // empty' <<<"$os_json")" \
    --arg kernelVersion "$(jq -r '.kernelVersion // .kernel // empty' <<<"$os_json")" \
    --arg architecture "$(jq -r '.arch // .architecture // empty' <<<"$os_json")" \
    --argjson dockerRunning "$(jq '.isDockerRunning // .dockerRunning // false' <<<"$node_json")" \
    --argjson openrestyRunning "$(jq '.isOpenrestyRunning // .openrestyRunning // false' <<<"$node_json")" \
    --argjson installedAppCount "$(jq 'length' <<<"$apps_json")" \
    --argjson websiteCount "$(jq 'length' <<<"$websites_json")" \
    --argjson containerCount "$(jq 'length' <<<"$containers_json")" \
    --argjson cronjobCount "$(jq 'length' <<<"$cronjobs_json")" \
    --argjson backupRecordCount "$(jq 'length' <<<"$backup_records_json")" \
    --argjson loginFailedCount24h "$login_failed_count" \
    --argjson operationCount24h "$operation_count" \
    --argjson riskyOperationCount24h "$risky_operation_count" \
    --argjson lastLoginAt "$last_login_epoch" \
    --argjson lastOperationAt "$last_operation_epoch" \
    --argjson apps "$apps_summary" \
    --argjson websites "$websites_summary" \
    --argjson containers "$containers_summary" \
    --argjson cronjobs "$cronjobs_summary" \
    --argjson backups "$backups_summary" '
    {
      schemaVersion: 1,
      instanceKey: $instanceKey,
      exporterVersion: $exporterVersion,
      reportTime: $reportTime,
      panelVersion: (if $panelVersion == "" then null else $panelVersion end),
      panelEdition: (if $panelEdition == "" then null else $panelEdition end),
      panelBaseUrl: $panelBaseUrl,
      system: {
        hostName: (if $hostName == "" then null else $hostName end),
        os: (if $osName == "" then null else $osName end),
        kernelVersion: (if $kernelVersion == "" then null else $kernelVersion end),
        architecture: (if $architecture == "" then null else $architecture end),
        dockerRunning: $dockerRunning,
        openrestyRunning: $openrestyRunning,
        installedAppCount: $installedAppCount,
        websiteCount: $websiteCount,
        containerCount: $containerCount,
        cronjobCount: $cronjobCount,
        backupRecordCount: $backupRecordCount
      },
      audit: {
        loginFailedCount24h: $loginFailedCount24h,
        operationCount24h: $operationCount24h,
        riskyOperationCount24h: $riskyOperationCount24h,
        lastLoginAt: $lastLoginAt,
        lastOperationAt: $lastOperationAt
      },
      apps: $apps,
      websites: $websites,
      containers: $containers,
      cronjobs: $cronjobs,
      backups: $backups
    }
  '
)"

curl -fsS \
  --connect-timeout "$PANEL_TIMEOUT_SEC" \
  --max-time "$PANEL_TIMEOUT_SEC" \
  -H "Content-Type: application/json" \
  -H "X-Flux-Instance-Key: ${FLUX_INSTANCE_KEY}" \
  -H "X-Flux-Node-Token: ${FLUX_NODE_TOKEN}" \
  -X POST \
  --data "$payload" \
  "${FLUX_URL%/}/api/v1/onepanel/report" >/dev/null

printf 'onepanel exporter sync ok\n'
