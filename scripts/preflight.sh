#!/usr/bin/env bash
# scripts/preflight.sh
# Quality-gate v0.5: load context → health report → drift detection → decision block.
#
# Reads .trae/memory.json, lists .trae/adr/, runs the 5 drift signals from
# .trae/rules/quality-gate.md §4, and prints a structured report.
#
# Usage:
#   scripts/preflight.sh                # text report (default)
#   scripts/preflight.sh --format=json  # machine-readable JSON
#   scripts/preflight.sh --no-color     # disable ANSI colors
#
# Exit codes:
#   0  PASS   — no drift, memory healthy
#   1  WARN   — drift or stale memory detected (advisory)
#   2  BLOCK  — hard block violated
#
# See .trae/adr/0006-v05-preflight-script.md for design rationale.
set -euo pipefail

# --- Args -------------------------------------------------------------------
FORMAT="text"
COLOR="auto"
for arg in "$@"; do
  case "$arg" in
    --format=json) FORMAT="json" ;;
    --format=text) FORMAT="text" ;;
    --no-color)    COLOR="off" ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
  esac
done

if [ "$COLOR" = "auto" ] && [ ! -t 1 ]; then COLOR="off"; fi
if [ "$COLOR" = "off" ]; then
  C_RED=""; C_YELLOW=""; C_GREEN=""; C_CYAN=""; C_DIM=""; C_RESET=""
else
  C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'; C_GREEN=$'\033[32m'
  C_CYAN=$'\033[36m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
fi

# --- Deps -------------------------------------------------------------------
command -v python3 >/dev/null 2>&1 || { echo "preflight: python3 required" >&2; exit 2; }
command -v grep    >/dev/null 2>&1 || { echo "preflight: grep required" >&2;    exit 2; }
command -v git     >/dev/null 2>&1 || true  # optional

# --- Root -------------------------------------------------------------------
ROOT="${ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT" >/dev/null

MEMORY_FILE=".trae/memory.json"
ADR_DIR=".trae/adr"

# --- Helpers ----------------------------------------------------------------
# Append a "section" line to a temp JSON file. Each section is a key in the
# final report. python3 ties them together at the end.
TMPDIR_RUN="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_RUN"' EXIT

# Section helpers: each writes a JSON snippet to $TMPDIR_RUN/<name>.json
section() {
  local name="$1"; local json="$2"
  printf '%s' "$json" > "$TMPDIR_RUN/$name.json"
}

# --- Memory health ----------------------------------------------------------
memory_status="missing"
memory_version=""
memory_adrs_count=0
memory_last_verified=""
memory_verifier=""
memory_decision_count=0
memory_stale_count=0
memory_known_issues_count=0
memory_known_issues=()
memory_drift_signals=()

if [ -f "$MEMORY_FILE" ]; then
  if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$MEMORY_FILE" 2>/dev/null; then
    memory_status="invalid_json"
  else
    memory_status="ok"
    # Read the bits we care about via python (JSON parsing in bash is awful).
    # NOTE: only emit ASCII-safe values to bash. Anything containing CJK /
    # special chars (e.g. verifier names, known_issues list) is deferred
    # to the JSON formatter so we don't choke the shell parser.
    eval "$(python3 - "$MEMORY_FILE" <<'PY'
import json, sys, datetime
with open(sys.argv[1]) as f:
    m = json.load(f)
print(f"memory_version={m.get('version', '')!r}")
print(f"memory_adrs_count={len(m.get('adrs', []))}")
print(f"memory_last_verified={m.get('verification', {}).get('last_verified_at', '')!r}")
print(f"memory_decision_count={len(m.get('decisions', {}))}")
print(f"memory_known_issues_count={len(m.get('verification', {}).get('known_issues', []))}")
# Stale = last_verified > 30 days ago.
stale = 0
today = datetime.date.today()
for k, v in m.get('decisions', {}).items():
    lv = v.get('last_verified', '')
    try:
        d = datetime.date.fromisoformat(lv)
        if (today - d).days > 30:
            stale += 1
    except Exception:
        pass
print(f"memory_stale_count={stale}")
PY
)"
  fi
fi

# --- ADR list ---------------------------------------------------------------
adr_files=()
adr_accepted=0
adr_proposed=0
adr_superseded=0
if [ -d "$ADR_DIR" ]; then
  for f in "$ADR_DIR"/*.md; do
    [ -f "$f" ] || continue
    case "$(basename "$f")" in
      template.md|README.md) continue ;;
    esac
    adr_files+=("$(basename "$f")")
    # Extract frontmatter status.
    status=$(awk '/^---$/{c++; next} c==1 && /^status:/{print $2; exit}' "$f" 2>/dev/null || echo "unknown")
    case "$status" in
      accepted)   adr_accepted=$((adr_accepted+1)) ;;
      proposed)   adr_proposed=$((adr_proposed+1)) ;;
      superseded) adr_superseded=$((adr_superseded+1)) ;;
    esac
  done
fi
adr_count=${#adr_files[@]}

# --- Drift signals ----------------------------------------------------------
# 1) storage drift: sqlite/postgres/mysql/redis/chromadb/qdrant in src/
drift_storage_hits=$(grep -rEln "(sqlite|postgres|mysql|redis|chromadb|qdrant)" src/ 2>/dev/null | head -10 || true)
drift_storage_count=0
[ -n "$drift_storage_hits" ] && drift_storage_count=$(echo "$drift_storage_hits" | wc -l | tr -d ' ')

# 2) runtime drift: process.env.NODE_ENV in src/
drift_runtime_hits=$(grep -rEln "process\.env\.NODE_ENV" src/ 2>/dev/null | head -10 || true)
drift_runtime_count=0
[ -n "$drift_runtime_hits" ] && drift_runtime_count=$(echo "$drift_runtime_hits" | wc -l | tr -d ' ')

# 3) unknown LLM provider in src/models/ (allow llama = Groq default)
drift_llm_hits=$(grep -rEln "(gemini|cohere|mistral)" src/models/ 2>/dev/null | head -10 || true)
drift_llm_count=0
[ -n "$drift_llm_hits" ] && drift_llm_count=$(echo "$drift_llm_hits" | wc -l | tr -d ' ')

# 4) vitest residue in src/ (tests/ may legitimately contain a fixture
#    referencing 'vitest' as part of a drift-detection test).
drift_vitest_hits=$(find src -name "*.ts" -not -path "*/node_modules/*" 2>/dev/null | xargs grep -l "from 'vitest'" 2>/dev/null | head -10 || true)
drift_vitest_count=0
[ -n "$drift_vitest_hits" ] && drift_vitest_count=$(echo "$drift_vitest_hits" | wc -l | tr -d ' ')

# 5) pnpm/yarn lock residue
drift_pnpmlock_present="no"
drift_yarnlock_present="no"
[ -f "pnpm-lock.yaml" ] && drift_pnpmlock_present="yes"
[ -f "yarn.lock" ]     && drift_yarnlock_present="yes"

# --- Hard block detection (current git tree) -------------------------------
# Read protected paths from memory.json (default fallback list).
protected_paths_json='[".env", "**/credentials*", "**/secrets*", "**/*.pem", "**/*.key"]'
if [ -f "$MEMORY_FILE" ] && python3 -c "
import json, sys
m = json.load(open(sys.argv[1]))
assert 'hard_blocks' in m
" "$MEMORY_FILE" 2>/dev/null; then
  protected_paths_json=$(python3 -c "
import json
m=json.load(open('$MEMORY_FILE'))
import json as j
print(j.dumps(m.get('hard_blocks',{}).get('files', m.get('hard_blocks',{}).get('protected_paths', []))))
" 2>/dev/null || echo "$protected_paths_json")
fi

# Walk current working tree + git index for files matching any protected glob.
# Strategy: union of (a) git ls-files tracked + (b) working-tree `find` for
# the well-known secret names. We deliberately do NOT honor .gitignore for
# the secret-name patterns — that's the whole point of a hard block.
hardblock_hits_json="[]"
if [ -d "$ROOT" ]; then
  hardblock_hits_json=$(SECRET_NAMES='.env .env.* credentials credentials.json secrets secrets.json *.pem *.key' python3 - "$protected_paths_json" <<'PY'
import json, subprocess, sys, fnmatch, os
patterns = json.loads(sys.argv[1])
# Patterns like '**/credentials*' (anywhere) plus always-checked secret basenames.
extra_basename_globs = os.environ.get("SECRET_NAMES", "").split()

# (a) Git-tracked + modified.
git_tracked = []
if os.path.isdir(os.path.join(os.getcwd(), ".git")):
    out = subprocess.run(["git", "ls-files", "-co", "--exclude-standard"],
                         capture_output=True, text=True, check=False).stdout.splitlines()
    git_tracked = out

# (b) Working tree find for known secret basenames (ignores .gitignore).
find_hits = []
for g in extra_basename_globs:
    out = subprocess.run(["find", ".", "-name", g, "-not", "-path", "*/node_modules/*",
                          "-not", "-path", "*/.git/*"],
                         capture_output=True, text=True, check=False).stdout.splitlines()
    find_hits.extend(out)

all_files = list(dict.fromkeys(git_tracked + find_hits))
hits = []
for p in all_files:
    base = os.path.basename(p)
    for pat in patterns:
        if pat.startswith("src/"):
            continue  # src/ paths are not in the secret hard-block list
        if fnmatch.fnmatch(p, pat) or fnmatch.fnmatch(base, pat.lstrip("**/")):
            hits.append(p)
            break
print(json.dumps(sorted(set(hits))))
PY
)
fi

hardblock_count=$(echo "$hardblock_hits_json" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")

# --- Git snapshot -----------------------------------------------------------
git_branch="(not a git repo)"
git_last_commit_short=""
git_last_commit_msg=""
git_uncommitted_count=0
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  git_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(detached)")
  git_last_commit_short=$(git log -1 --format=%h 2>/dev/null || echo "")
  git_last_commit_msg=$(git log -1 --format=%s 2>/dev/null || echo "")
  git_uncommitted_count=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
fi

# --- Decision ----------------------------------------------------------------
# BLOCK: hard block hit
# WARN:  any drift, or stale memory (>30 days), or memory invalid, or adr_proposed > 0
# PASS:  all clean
exit_code=0
decision="PASS"
if [ "$hardblock_count" -gt 0 ]; then
  decision="BLOCK"
  exit_code=2
elif \
  [ "$drift_storage_count" -gt 0 ] || \
  [ "$drift_runtime_count"  -gt 0 ] || \
  [ "$drift_llm_count"      -gt 0 ] || \
  [ "$drift_vitest_count"   -gt 0 ] || \
  [ "$drift_pnpmlock_present" = "yes" ] || \
  [ "$drift_yarnlock_present"  = "yes" ] || \
  [ "$memory_stale_count"   -gt 0 ] || \
  [ "$memory_status"        != "ok" ] || \
  [ "$adr_proposed"         -gt 0 ]; then
  decision="WARN"
  exit_code=1
fi

# --- Build report -----------------------------------------------------------
# Export the collected values as env vars so the JSON branch can read them
# without re-running python3.
export DECISION="$decision" ROOT="$ROOT"
export MEMORY_STATUS="$memory_status" MEMORY_VERSION="$memory_version"
export MEMORY_ADRS_COUNT="$memory_adrs_count"
export MEMORY_DECISION_COUNT="$memory_decision_count"
export MEMORY_STALE_COUNT="$memory_stale_count"
export MEMORY_LAST_VERIFIED="$memory_last_verified"
export MEMORY_KNOWN_ISSUES_COUNT="$memory_known_issues_count"
export ADR_COUNT="$adr_count" ADR_ACCEPTED="$adr_accepted"
export ADR_PROPOSED="$adr_proposed" ADR_SUPERSEDED="$adr_superseded"
# Build a JSON array of ADR file names via python (handles quoting safely).
ADR_FILES_JSON=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1:]))" "${adr_files[@]}" 2>/dev/null || echo "[]")
export ADR_FILES_JSON
export DRIFT_STORAGE_COUNT="$drift_storage_count" DRIFT_RUNTIME_COUNT="$drift_runtime_count"
export DRIFT_LLM_COUNT="$drift_llm_count" DRIFT_VITEST_COUNT="$drift_vitest_count"
export DRIFT_PNPMLOCK="$drift_pnpmlock_present" DRIFT_YARNLOCK="$drift_yarnlock_present"
export HARDBLOCK_COUNT="$hardblock_count" HARDBLOCK_FILES_JSON="$hardblock_hits_json"
export GIT_BRANCH="$git_branch" GIT_LAST_COMMIT_SHORT="$git_last_commit_short"
export GIT_LAST_COMMIT_MSG="$git_last_commit_msg" GIT_UNCOMMITTED_COUNT="$git_uncommitted_count"

if [ "$FORMAT" = "json" ]; then
  MEMORY_FILE="$MEMORY_FILE" python3 - <<'PY'
import json, os
m = {}
if os.path.exists(os.environ["MEMORY_FILE"]):
    try:
        m = json.load(open(os.environ["MEMORY_FILE"]))
    except Exception:
        m = {}
verifier = m.get("verification", {}).get("verifier", "")
ki = m.get("verification", {}).get("known_issues", [])
report = {
  "decision": os.environ["DECISION"],
  "root": os.environ["ROOT"],
  "memory": {
    "status": os.environ["MEMORY_STATUS"],
    "version": os.environ["MEMORY_VERSION"],
    "adrs_count": int(os.environ["MEMORY_ADRS_COUNT"]),
    "decision_count": int(os.environ["MEMORY_DECISION_COUNT"]),
    "stale_count": int(os.environ["MEMORY_STALE_COUNT"]),
    "last_verified": os.environ["MEMORY_LAST_VERIFIED"],
    "verifier": verifier,
    "known_issues_count": int(os.environ["MEMORY_KNOWN_ISSUES_COUNT"]),
    "known_issues": ki,
  },
  "adrs": {
    "count": int(os.environ["ADR_COUNT"]),
    "accepted": int(os.environ["ADR_ACCEPTED"]),
    "proposed": int(os.environ["ADR_PROPOSED"]),
    "superseded": int(os.environ["ADR_SUPERSEDED"]),
    "files": json.loads(os.environ["ADR_FILES_JSON"]),
  },
  "drift": {
    "storage":     {"count": int(os.environ["DRIFT_STORAGE_COUNT"])},
    "runtime":     {"count": int(os.environ["DRIFT_RUNTIME_COUNT"])},
    "llm_unknown": {"count": int(os.environ["DRIFT_LLM_COUNT"])},
    "vitest":      {"count": int(os.environ["DRIFT_VITEST_COUNT"])},
    "pnpm_lock":   os.environ["DRIFT_PNPMLOCK"],
    "yarn_lock":   os.environ["DRIFT_YARNLOCK"],
  },
  "hardblocks": {
    "count": int(os.environ["HARDBLOCK_COUNT"]),
    "files": json.loads(os.environ["HARDBLOCK_FILES_JSON"]),
  },
  "git": {
    "branch": os.environ["GIT_BRANCH"],
    "last_commit_short": os.environ["GIT_LAST_COMMIT_SHORT"],
    "last_commit_msg": os.environ["GIT_LAST_COMMIT_MSG"],
    "uncommitted_count": int(os.environ["GIT_UNCOMMITTED_COUNT"]),
  },
}
print(json.dumps(report, indent=2, ensure_ascii=False))
PY
else
  echo "${C_CYAN}┌─ Memory health ────────────────────────────${C_RESET}"
  if [ "$memory_status" = "ok" ]; then
    echo "${C_CYAN}│${C_RESET} Memory:    ${C_GREEN}✅ healthy${C_RESET} (v$memory_version, $memory_adrs_count ADRs, $memory_decision_count decisions)"
  elif [ "$memory_status" = "missing" ]; then
    echo "${C_CYAN}│${C_RESET} Memory:    ${C_YELLOW}⚠ missing${C_RESET} (.trae/memory.json not found)"
  else
    echo "${C_CYAN}│${C_RESET} Memory:    ${C_RED}❌ $memory_status${C_RESET}"
  fi
  echo "${C_CYAN}│${C_RESET} Last ver:  $memory_last_verified"
  echo "${C_CYAN}│${C_RESET} Stale:     $memory_stale_count decisions > 30 days"
  echo "${C_CYAN}│${C_RESET} Known iss: $memory_known_issues_count"
  echo "${C_CYAN}│${C_RESET} ADRs:      $adr_count ($adr_accepted accepted, $adr_proposed proposed, $adr_superseded superseded)"
  # Show verifier (can contain CJK, fetch via python rather than bash eval).
  if [ "$memory_status" = "ok" ]; then
    verifier=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('verification',{}).get('verifier',''))" "$MEMORY_FILE" 2>/dev/null || echo "")
    if [ -n "$verifier" ]; then
      echo "${C_CYAN}│${C_RESET} Verifier:  $verifier"
    fi
  fi
  echo "${C_CYAN}└────────────────────────────────────────────${C_RESET}"
  echo ""

  echo "${C_CYAN}┌─ Drift signals ────────────────────────────${C_RESET}"
  print_drift() {
    local label="$1"; local count="$2"; local hits="$3"
    if [ "$count" -eq 0 ] && [ -z "$hits" ]; then
      echo "${C_CYAN}│${C_RESET} $label: ${C_GREEN}✅ 0${C_RESET}"
    else
      echo "${C_CYAN}│${C_RESET} $label: ${C_YELLOW}⚠ $count${C_RESET}"
      [ -n "$hits" ] && echo "$hits" | sed "s|^|${C_CYAN}│${C_RESET}   ${C_DIM}|"
    fi
  }
  print_drift "storage (sqlite/redis/etc)  " "$drift_storage_count" "$drift_storage_hits"
  print_drift "runtime (process.env.NODE_ENV)" "$drift_runtime_count" "$drift_runtime_hits"
  print_drift "LLM unknown provider         " "$drift_llm_count"     "$drift_llm_hits"
  print_drift "vitest residue               " "$drift_vitest_count"  "$drift_vitest_hits"
  echo "${C_CYAN}│${C_RESET} pnpm-lock.yaml:           $drift_pnpmlock_present"
  echo "${C_CYAN}│${C_RESET} yarn.lock:               $drift_yarnlock_present"
  echo "${C_CYAN}└────────────────────────────────────────────${C_RESET}"
  echo ""

  echo "${C_CYAN}┌─ Hard blocks ──────────────────────────────${C_RESET}"
  if [ "$hardblock_count" -eq 0 ]; then
    echo "${C_CYAN}│${C_RESET} ${C_GREEN}✅ no protected files in tree${C_RESET}"
  else
    echo "${C_CYAN}│${C_RESET} ${C_RED}❌ $hardblock_count protected files hit${C_RESET}"
    echo "$hardblock_hits_json" | python3 -c "import json,sys; [print(f'  {f}') for f in json.load(sys.stdin)]" 2>/dev/null
  fi
  echo "${C_CYAN}└────────────────────────────────────────────${C_RESET}"
  echo ""

  echo "${C_CYAN}┌─ Git ──────────────────────────────────────${C_RESET}"
  echo "${C_CYAN}│${C_RESET} Branch:        ${C_DIM}$git_branch${C_RESET}"
  if [ -n "$git_last_commit_short" ]; then
    echo "${C_CYAN}│${C_RESET} Last commit:   ${C_DIM}$git_last_commit_short $git_last_commit_msg${C_RESET}"
  fi
  echo "${C_CYAN}│${C_RESET} Uncommitted:   $git_uncommitted_count file(s)"
  echo "${C_CYAN}└────────────────────────────────────────────${C_RESET}"
  echo ""

  case "$decision" in
    PASS)  echo "${C_GREEN}✅ [PASS]${C_RESET} No drift, no hard block. ${C_DIM}(exit 0)${C_RESET}" ;;
    WARN)  echo "${C_YELLOW}⚠ [WARN]${C_RESET} Drift or stale memory detected. ${C_DIM}(exit 1)${C_RESET}" ;;
    BLOCK) echo "${C_RED}🚫 [BLOCK]${C_RESET} Hard block violated. ${C_DIM}(exit 2)${C_RESET}" ;;
  esac
fi

exit "$exit_code"
