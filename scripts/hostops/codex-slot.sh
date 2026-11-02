# Sourced by the artdir codex queue scripts (q4.sh, qcont.sh, qstack.sh) as slot.sh.
# Thin shim over the host admission gate: the cap, load and memory rules live in
# scripts/hostops/host-admit.json (class `agent`), not here. Installed by
# scripts/hostops/install-hostops-tools.sh, which links ~/codex-ship-prompts/artdir/slot.sh here.
#
# wait_slot: take a 90 s `agent` reservation; it holds the seat until the launched codex
# shows up as a process, which the gate then counts itself. Each try is bounded and
# logged (host-admit defers with exit 75); the queue keeps retrying, as slot.sh did.
HOST_ADMIT_BIN="${HOST_ADMIT_BIN:-$HOME/.local/bin/host-admit}"
wait_slot(){
  until "$HOST_ADMIT_BIN" reserve agent --ttl 90 --quiet; do
    rc=$?
    [ "$rc" -eq 75 ] || { echo "slot.sh: host-admit failed (exit $rc)" >&2; return "$rc"; }
    sleep $((30 + RANDOM % 30))
  done
}
# The reservation expires on its own; nothing to release.
release_slot(){ :; }
