#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:3210"
PASS=0
FAIL=0

post() { curl -sf -X POST "$1" -H 'Content-Type: application/json' -d "$2" 2>/dev/null; }
get()  { curl -sf "$1" 2>/dev/null; }

assert() {
  local desc="$1" response="$2" jq_expr="$3"
  if echo "$response" | jq -e "$jq_expr" > /dev/null 2>&1; then
    echo "PASS  $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $desc — expected $jq_expr"
    echo "      Response: $response"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== agent-core smoke test ==="
echo ""

# 0. Health
R=$(get "$BASE/health")
assert "Health check" "$R" '.status == "ok"'

# 1. Create session
R=$(post "$BASE/sessions" '{"repo_id":"demo"}')
assert "POST /sessions" "$R" '.id'
SESSION_ID=$(echo "$R" | jq -r '.id')
echo "      Session ID: $SESSION_ID"

# 2. Onboard repo
R=$(post "$BASE/context/repos/demo/onboard" '{}')
assert "POST /context/repos/demo/onboard" "$R" '.repo_id == "demo"'

# 3. Write memory
R=$(post "$BASE/memory/write" '{"scope":"repo","scope_id":"demo","content":"Always run tests before committing","metadata":{"source":"convention"}}')
assert "POST /memory/write" "$R" '.id'
MEM_ID=$(echo "$R" | jq -r '.id')
echo "      Memory ID: $MEM_ID"

# 4. Classify task
R=$(post "$BASE/classify/task" '{"prompt":"Fix a failing login test"}')
assert "POST /classify/task" "$R" '.task_type'

# 5. Search memory
R=$(post "$BASE/memory/search" '{"query":"tests","scope":"repo"}')
assert "POST /memory/search" "$R" '.results'

# 6. Allowed next actions
R=$(post "$BASE/rules/allowed-next-actions" '{"task_type":"code_edit","current_action":"classify_task"}')
assert "POST /rules/allowed-next-actions" "$R" '.allowed'

# 7. Execute classify_task
R=$(post "$BASE/actions/execute" '{"action_name":"classify_task","params":{}}')
assert "POST /actions/execute classify_task" "$R" '.executed == true'

# 8. Execute read_file
R=$(post "$BASE/actions/execute" '{"action_name":"read_file","params":{"path":"src/index.ts"}}')
assert "POST /actions/execute read_file" "$R" '.executed == true'

# 9. Execute grep
R=$(post "$BASE/actions/execute" '{"action_name":"grep","params":{"pattern":"login"}}')
assert "POST /actions/execute grep" "$R" '.executed == true'

# 10. Execute run_tests
R=$(post "$BASE/actions/execute" '{"action_name":"run_tests","params":{}}')
assert "POST /actions/execute run_tests" "$R" '.executed == true'

# 11. Record trace
R=$(post "$BASE/traces/tool-call" "{\"session_id\":\"$SESSION_ID\",\"action_name\":\"read_file\",\"input\":{\"path\":\"src/index.ts\"},\"output\":{\"content\":\"...\"},\"duration_ms\":42}")
assert "POST /traces/tool-call" "$R" '.trace_type == "tool-call"'

# 12. Extract memory
R=$(post "$BASE/memory/extract" "{\"session_id\":\"$SESSION_ID\",\"text\":\"We should always validate input before processing. The auth module requires rate limiting.\"}")
assert "POST /memory/extract" "$R" '.candidates'

# 13. Promote memory
R=$(post "$BASE/memory/promote" "{\"memory_id\":\"$MEM_ID\",\"target_scope\":\"global_policy\"}")
assert "POST /memory/promote" "$R" '.promoted_from'

# 14. Get session timeline
R=$(get "$BASE/sessions/$SESSION_ID/timeline")
assert "GET /sessions/:id/timeline" "$R" '.session_id'

# 15. Get context tree
R=$(get "$BASE/context/repos/demo/tree")
assert "GET /context/repos/:id/tree" "$R" '.tree'

# 16. List actions
R=$(get "$BASE/actions")
assert "GET /actions" "$R" '.actions'

# 17. Mock platform — policy check (safe)
R=$(post "$BASE/mock-platform/policy/check" "{\"session_id\":\"$SESSION_ID\",\"action_name\":\"read_file\"}")
assert "POST /mock-platform/policy/check (safe)" "$R" '.allowed == true'

# 18. Mock platform — policy check (dangerous)
R=$(post "$BASE/mock-platform/policy/check" "{\"session_id\":\"$SESSION_ID\",\"action_name\":\"deploy\"}")
assert "POST /mock-platform/policy/check (dangerous)" "$R" '.allowed == false'

# 19. Mock platform — repos/open
R=$(post "$BASE/mock-platform/repos/open" '{"repo_url":"https://github.com/org/repo","branch":"main"}')
assert "POST /mock-platform/repos/open" "$R" '.status == "opened"'

# 20. Mock platform — executors/select
R=$(post "$BASE/mock-platform/executors/select" '{"task_type":"code_edit","complexity_score":60}')
assert "POST /mock-platform/executors/select" "$R" '.executor'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
