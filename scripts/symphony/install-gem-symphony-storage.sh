#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "must run as root" >&2
  exit 77
fi

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
owner="timwhite"
owner_uid="$(id -u "$owner")"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
receipt_root="/srv/git/receipts/workspace-mounts"
package_cache_receipt_root="$receipt_root/package-cache"
backup_root="/srv/git/rollback/gem-symphony-storage/$timestamp"
helper_source="$source_root/jovie-symphony-workspace"
wrapper_source="$source_root/jovie-symphony-workspace-create"
cache_source="$source_root/symphony-nvme-package-cache.sh"
boot_simulation_source="$source_root/gem-symphony-workspace-boot-simulate"
reclaimer_source="$source_root/gem-disk-reclaim.py"
migration_source="$source_root/gem-workspace-migrate.py"
helper_target="/usr/local/sbin/jovie-symphony-workspace"
wrapper_target="/home/$owner/.local/bin/jovie-symphony-workspace-create"
cache_target="/home/$owner/.local/bin/symphony-nvme-package-cache"
boot_simulation_target="/home/$owner/.local/bin/gem-symphony-workspace-boot-simulate"
reclaimer_target="/home/$owner/.local/bin/gem-disk-reclaim"
migration_target="/usr/local/sbin/gem-workspace-migrate"
node_target="/home/$owner/.nvm/versions/node/v22.23.2/bin/node"
node_link="/home/$owner/.local/bin/node"
pnpm_target="/home/$owner/.nvm/versions/node/v22.23.2/bin/pnpm"
pnpm_link="/home/$owner/.local/bin/pnpm"
corepack_home="/home/$owner/.cache/node/corepack"
systemd_source="$source_root/systemd"
user_dropin_dir="/home/$owner/.config/systemd/user/symphony-elixir.service.d"

for path in "$helper_source" "$wrapper_source" "$cache_source" "$boot_simulation_source" \
  "$reclaimer_source" \
  "$migration_source" \
  "$systemd_source/jovie-symphony-workspace-mounts.service" \
  "$systemd_source/jovie-symphony-workspace-cleanup.service" \
  "$systemd_source/jovie-symphony-workspace-cleanup.timer" \
  "$systemd_source/gem-disk-reclaim.service" \
  "$systemd_source/gem-disk-reclaim.timer" \
  "$systemd_source/symphony-elixir-workspace-mounts.conf"; do
  [[ -f "$path" && ! -L "$path" ]] || { echo "missing or unsafe source artifact: $path" >&2; exit 65; }
done

bash -n "$helper_source" "$wrapper_source" "$cache_source" "$boot_simulation_source"
python3 -c 'import ast,pathlib,sys; [ast.parse(pathlib.Path(path).read_text(encoding="utf-8"), filename=path) for path in sys.argv[1:]]' \
  "$reclaimer_source" "$migration_source"
systemd-analyze verify \
  "$systemd_source/jovie-symphony-workspace-mounts.service" \
  "$systemd_source/jovie-symphony-workspace-cleanup.service" \
  "$systemd_source/jovie-symphony-workspace-cleanup.timer" \
  "$systemd_source/gem-disk-reclaim.service" \
  "$systemd_source/gem-disk-reclaim.timer"

for mount_path in /srv/worktrees /srv/models /srv/cache /srv/scratch /srv/git; do
  mountpoint -q "$mount_path" || { echo "required mount missing: $mount_path" >&2; exit 66; }
done
cache_source_device="$(findmnt --target /srv/git --output SOURCE --noheadings | head -n 1 | awk '{$1=$1; print}')"
case "$cache_source_device" in
  /dev/nvme*|/dev/disk/by-id/*nvme*) ;;
  *) echo "cache root is not NVMe-backed: $cache_source_device" >&2; exit 66 ;;
esac

[[ -x "$node_target" ]] || { echo "required Node runtime missing: $node_target" >&2; exit 69; }
[[ -x "$pnpm_target" ]] || { echo "required pnpm launcher missing: $pnpm_target" >&2; exit 69; }
tool_path="$(dirname "$node_target"):/usr/local/bin:/usr/bin:/bin"
tool_env=(env "HOME=/home/$owner" "COREPACK_HOME=$corepack_home" COREPACK_ENABLE_NETWORK=0 "PATH=$tool_path")
[[ "$("${tool_env[@]}" node --version)" == "v22.23.2" ]] || { echo "Node 22.23.2 validation failed" >&2; exit 69; }
[[ "$("${tool_env[@]}" pnpm --version)" == "9.15.4" ]] || { echo "pnpm 9.15.4 validation failed" >&2; exit 69; }

user_systemctl=(runuser -u "$owner" -- env "XDG_RUNTIME_DIR=/run/user/$owner_uid" systemctl --user)
service_state_before="$("${user_systemctl[@]}" show symphony-elixir.service -p ActiveState --value)"
service_pid_before="$("${user_systemctl[@]}" show symphony-elixir.service -p MainPID --value)"
[[ "$service_state_before" == active && "$service_pid_before" =~ ^[1-9][0-9]*$ ]] || {
  echo "Symphony service is not active before install" >&2
  exit 70
}
service_start_before="$(awk '{print $22}' "/proc/$service_pid_before/stat")"
api_counts_before="$(curl -fsS http://127.0.0.1:4041/api/v1/state | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin).get("counts", {}), sort_keys=True, separators=(",", ":")))')"
workspace_status_before="$($helper_target status)"
if grep -Eq 'mounted=false|invalid_manifest=' <<<"$workspace_status_before"; then
  echo "workspace topology is not healthy before install" >&2
  exit 71
fi

install -d -o root -g root -m 0755 "$receipt_root" "$backup_root"
install -d -o "$owner" -g "$owner" -m 0755 "$package_cache_receipt_root"

backup_if_present() {
  local source="$1" name="$2"
  if [[ -e "$source" || -L "$source" ]]; then
    cp -a -- "$source" "$backup_root/$name"
  fi
}

backup_if_present "$helper_target" jovie-symphony-workspace
backup_if_present "$wrapper_target" jovie-symphony-workspace-create
backup_if_present "$cache_target" symphony-nvme-package-cache
backup_if_present "$boot_simulation_target" gem-symphony-workspace-boot-simulate
backup_if_present "$reclaimer_target" gem-disk-reclaim
backup_if_present "$migration_target" gem-workspace-migrate
backup_if_present /etc/systemd/system/jovie-symphony-workspace-mounts.service jovie-symphony-workspace-mounts.service
backup_if_present /etc/systemd/system/jovie-symphony-workspace-cleanup.service jovie-symphony-workspace-cleanup.service
backup_if_present /etc/systemd/system/jovie-symphony-workspace-cleanup.timer jovie-symphony-workspace-cleanup.timer
backup_if_present "/home/$owner/.config/systemd/user/gem-disk-reclaim.service" gem-disk-reclaim.service
backup_if_present "/home/$owner/.config/systemd/user/gem-disk-reclaim.timer" gem-disk-reclaim.timer
backup_if_present "$user_dropin_dir/workspace-mounts.conf" workspace-mounts.conf
backup_if_present "$node_link" node-link
backup_if_present "$pnpm_link" pnpm-link

atomic_install() {
  local source="$1" target="$2" mode="$3" target_owner="$4" target_group="$5" tmp
  install -d -o "$target_owner" -g "$target_group" -m 0755 "$(dirname "$target")"
  tmp="$(mktemp "${target}.partial.XXXXXX")"
  install -o "$target_owner" -g "$target_group" -m "$mode" "$source" "$tmp"
  mv -f -- "$tmp" "$target"
}

atomic_install "$helper_source" "$helper_target" 0755 root root
atomic_install "$wrapper_source" "$wrapper_target" 0755 "$owner" "$owner"
atomic_install "$cache_source" "$cache_target" 0755 "$owner" "$owner"
atomic_install "$boot_simulation_source" "$boot_simulation_target" 0755 "$owner" "$owner"
atomic_install "$reclaimer_source" "$reclaimer_target" 0755 "$owner" "$owner"
atomic_install "$migration_source" "$migration_target" 0755 root root
atomic_install "$systemd_source/jovie-symphony-workspace-mounts.service" /etc/systemd/system/jovie-symphony-workspace-mounts.service 0644 root root
atomic_install "$systemd_source/jovie-symphony-workspace-cleanup.service" /etc/systemd/system/jovie-symphony-workspace-cleanup.service 0644 root root
atomic_install "$systemd_source/jovie-symphony-workspace-cleanup.timer" /etc/systemd/system/jovie-symphony-workspace-cleanup.timer 0644 root root
atomic_install "$systemd_source/gem-disk-reclaim.service" "/home/$owner/.config/systemd/user/gem-disk-reclaim.service" 0644 "$owner" "$owner"
atomic_install "$systemd_source/gem-disk-reclaim.timer" "/home/$owner/.config/systemd/user/gem-disk-reclaim.timer" 0644 "$owner" "$owner"
atomic_install "$systemd_source/symphony-elixir-workspace-mounts.conf" "$user_dropin_dir/workspace-mounts.conf" 0644 "$owner" "$owner"

install_symlink() {
  local target="$1" link="$2"
  if [[ -L "$link" ]]; then
    [[ "$(readlink -f "$link")" == "$(readlink -f "$target")" ]] || { echo "conflicting symlink: $link" >&2; exit 72; }
  elif [[ -e "$link" ]]; then
    echo "refusing to replace non-symlink: $link" >&2
    exit 72
  else
    ln -s "$target" "$link"
    chown -h "$owner:$owner" "$link"
  fi
}

install_symlink "$node_target" "$node_link"
install_symlink "$pnpm_target" "$pnpm_link"

systemctl daemon-reload
"${user_systemctl[@]}" daemon-reload
systemctl enable jovie-symphony-workspace-mounts.service jovie-symphony-workspace-cleanup.timer >/dev/null
"${user_systemctl[@]}" enable --now gem-disk-reclaim.timer >/dev/null

service_state_after="$("${user_systemctl[@]}" show symphony-elixir.service -p ActiveState --value)"
service_pid_after="$("${user_systemctl[@]}" show symphony-elixir.service -p MainPID --value)"
service_start_after="$(awk '{print $22}' "/proc/$service_pid_after/stat")"
api_counts_after="$(curl -fsS http://127.0.0.1:4041/api/v1/state | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin).get("counts", {}), sort_keys=True, separators=(",", ":")))')"
workspace_status_after="$($helper_target status)"

[[ "$service_state_after" == active ]] || { echo "Symphony became inactive during install" >&2; exit 73; }
[[ "$service_pid_after" == "$service_pid_before" && "$service_start_after" == "$service_start_before" ]] || {
  echo "Symphony process continuity failed" >&2
  exit 73
}
if grep -Eq 'mounted=false|invalid_manifest=' <<<"$workspace_status_after"; then
  echo "workspace topology is not healthy after install" >&2
  exit 73
fi

receipt="$receipt_root/${timestamp}-gem-symphony-storage-installed.txt"
{
  printf 'timestamp=%s\n' "$timestamp"
  printf 'source_root=%s\n' "$source_root"
  printf 'helper_sha256=%s\n' "$(sha256sum "$helper_target" | awk '{print $1}')"
  printf 'wrapper_sha256=%s\n' "$(sha256sum "$wrapper_target" | awk '{print $1}')"
  printf 'cache_helper_sha256=%s\n' "$(sha256sum "$cache_target" | awk '{print $1}')"
  printf 'node=%s\n' "$("${tool_env[@]}" node --version)"
  printf 'pnpm=%s\n' "$("${tool_env[@]}" pnpm --version)"
  printf 'cache_mount_source=%s\n' "$cache_source_device"
  printf 'package_cache_receipt_root=%s\n' "$package_cache_receipt_root"
  printf 'package_cache_receipt_owner=%s\n' "$(stat -c '%U:%G' "$package_cache_receipt_root")"
  printf 'symphony_pid_before=%s\n' "$service_pid_before"
  printf 'symphony_pid_after=%s\n' "$service_pid_after"
  printf 'symphony_start_tick_before=%s\n' "$service_start_before"
  printf 'symphony_start_tick_after=%s\n' "$service_start_after"
  printf 'api_counts_before=%s\n' "$api_counts_before"
  printf 'api_counts_after=%s\n' "$api_counts_after"
  printf 'workspace_status_before_sha256=%s\n' "$(printf '%s' "$workspace_status_before" | sha256sum | awk '{print $1}')"
  printf 'workspace_status_after_sha256=%s\n' "$(printf '%s' "$workspace_status_after" | sha256sum | awk '{print $1}')"
  printf 'mount_restore_enabled=%s\n' "$(systemctl is-enabled jovie-symphony-workspace-mounts.service)"
  printf 'cleanup_timer_enabled=%s\n' "$(systemctl is-enabled jovie-symphony-workspace-cleanup.timer)"
  printf 'disk_reclaim_timer_enabled=%s\n' "$("${user_systemctl[@]}" is-enabled gem-disk-reclaim.timer)"
  printf 'backup_root=%s\n' "$backup_root"
  printf 'restart_performed=false\n'
  printf 'fstab_changed=false\n'
  printf 'existing_workspace_moved=false\n'
} >"$receipt"
chmod 0644 "$receipt"

printf 'installed=true\nreceipt=%s\nbackup_root=%s\nsymphony_pid=%s\n' \
  "$receipt" "$backup_root" "$service_pid_after"
