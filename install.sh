#!/usr/bin/env bash
# token-diet installer — always-on, multi-harness.
# Usage: ./install.sh [-a HARNESS] [--project] [--ultra] [--uninstall]
#   HARNESS = claude | codex | cursor | windsurf | cline | all | print (default: auto)
#   --project  install into the current repo instead of the global config
#   --ultra    install the aggressive telegraphic level (caveman-style on chat;
#              artifacts stay precise). Default is the quality-locked level.
#   --uninstall  remove token-diet from the target(s)
#
# Claude Code & Codex are first-class (real always-on). Cursor/Windsurf/Cline get
# always-on rule files. "print" just emits the directive to paste anywhere else.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACT="$HERE/activation.md"          # the always-on directive (with markers)
SKILL="$HERE/SKILL.md"
HARNESS="auto"; SCOPE="global"; MODE="install"; ULTRA=0

while [ $# -gt 0 ]; do case "$1" in
  -a) HARNESS="$2"; shift 2;;
  --project) SCOPE="project"; shift;;
  --ultra) ULTRA=1; shift;;
  --uninstall) MODE="uninstall"; shift;;
  -h|--help) sed -n '2,13p' "$0"; exit 0;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done
BEGIN='<!-- token-diet:begin -->'; END='<!-- token-diet:end -->'
# ultra install = base rules (incl. context discipline) + telegraphic output, one block
if [ "$ULTRA" = 1 ]; then
  ACT="$(mktemp)"
  { echo "$BEGIN"
    sed '/token-diet:begin/d;/token-diet:end/d' "$HERE/activation.md"
    echo
    sed '/token-diet:begin/d;/token-diet:end/d' "$HERE/activation-ultra.md"
    echo "$END"
  } > "$ACT"
fi

# Replace the marked block in $1 with activation.md (or append if absent). Idempotent.
upsert() { local f="$1"; mkdir -p "$(dirname "$f")"; [ -f "$f" ] || : > "$f"
  ACT="$ACT" BEGIN="$BEGIN" END="$END" python3 - "$f" <<'PY'
import os,re,sys
f=sys.argv[1]; body=open(os.environ["ACT"]).read().strip()
b,e=re.escape(os.environ["BEGIN"]),re.escape(os.environ["END"])
txt=open(f).read() if os.path.exists(f) else ""
new=re.sub(b+r".*?"+e, body, txt, flags=re.S) if re.search(b,txt) else (txt.rstrip()+"\n\n"+body+"\n")
open(f,"w").write(new); print("  wrote",f)
PY
}
# Remove the marked block from $1.
strip_block() { local f="$1"; [ -f "$f" ] || return 0
  BEGIN="$BEGIN" END="$END" python3 - "$f" <<'PY'
import os,re,sys
f=sys.argv[1]; b,e=re.escape(os.environ["BEGIN"]),re.escape(os.environ["END"])
t=open(f).read(); open(f,"w").write(re.sub(r"\n*"+b+r".*?"+e+r"\n*","\n",t,flags=re.S).strip()+"\n")
print("  cleaned",f)
PY
}

install_claude() {
  local root; [ "$SCOPE" = project ] && root="$PWD/.claude" || root="$HOME/.claude"
  if [ "$MODE" = uninstall ]; then
    rm -rf "$root/skills/token-diet" "$root/token-diet" "$root/hooks/token-diet-sessionstart.sh"
    settings_hook "$root/settings.json" remove; echo "claude: removed"; return; fi
  mkdir -p "$root/skills/token-diet" "$root/token-diet" "$root/hooks"
  cp "$SKILL" "$root/skills/token-diet/SKILL.md"          # /token-diet + progressive disclosure
  cp "$ACT"   "$root/token-diet/activation.md"
  printf '#!/usr/bin/env bash\ncat "%s/token-diet/activation.md"\n' "$root" > "$root/hooks/token-diet-sessionstart.sh"
  chmod +x "$root/hooks/token-diet-sessionstart.sh"
  settings_hook "$root/settings.json" add "$root/hooks/token-diet-sessionstart.sh"
  echo "claude: installed (always-on via SessionStart hook + /token-diet skill)"
}
# Idempotently add/remove a SessionStart command hook in a Claude settings.json.
settings_hook() { local f="$1" op="$2" cmd="${3:-}"
  F="$f" OP="$op" CMD="$cmd" python3 - <<'PY'
import json,os
f,op,cmd=os.environ["F"],os.environ["OP"],os.environ["CMD"]
d=json.load(open(f)) if os.path.exists(f) and open(f).read().strip() else {}
h=d.setdefault("hooks",{}); ss=h.setdefault("SessionStart",[])
def cmds(o): return [x.get("command") for g in o for x in g.get("hooks",[])]
if op=="add":
    if "token-diet" not in " ".join(c or "" for c in cmds(ss)):
        ss.append({"hooks":[{"type":"command","command":f'bash "{cmd}"'}]})
else:
    d["hooks"]["SessionStart"]=[g for g in ss if "token-diet" not in " ".join(x.get("command","") for x in g.get("hooks",[]))]
os.makedirs(os.path.dirname(f),exist_ok=True); json.dump(d,open(f,"w"),indent=2)
PY
}

install_codex() {  # ~/.codex/AGENTS.md is auto-loaded every run → true always-on
  local f; [ "$SCOPE" = project ] && f="$PWD/AGENTS.md" || f="$HOME/.codex/AGENTS.md"
  if [ "$MODE" = uninstall ]; then strip_block "$f"; echo "codex: removed"; else
    upsert "$f"; echo "codex: installed (always-on via AGENTS.md)"; fi
}
# cursor/windsurf/cline — dedicated project rule file (named token-diet.*), so
# install overwrites, uninstall removes the file. $2 = editor frontmatter that
# marks the rule always-on (Cursor needs `alwaysApply: true`, Windsurf needs
# `trigger: always_on`; Cline applies every file in .clinerules/ by convention).
install_rulefile() { local f="$1" fm="${2:-}"
  if [ "$MODE" = uninstall ]; then rm -f "$f"; echo "  removed $f"; return; fi
  mkdir -p "$(dirname "$f")"
  { [ -n "$fm" ] && printf '%s\n\n' "$fm"
    sed '/token-diet:begin/d;/token-diet:end/d' "$ACT"; } > "$f"
  echo "  wrote $f"
}

targets=()
if [ "$HARNESS" = auto ]; then
  [ -d "$HOME/.claude" ] && targets+=(claude)
  [ -d "$HOME/.codex" ]  && targets+=(codex)
  [ ${#targets[@]} -eq 0 ] && targets=(print)
elif [ "$HARNESS" = all ]; then targets=(claude codex cursor windsurf cline)
else targets=("$HARNESS"); fi

for t in "${targets[@]}"; do case "$t" in
  claude)   install_claude;;
  codex)    install_codex;;
  cursor)   install_rulefile "$PWD/.cursor/rules/token-diet.mdc" \
              $'---\ndescription: token-diet — always-on token efficiency\nalwaysApply: true\n---'; echo "cursor: installed (always-on rule)";;
  windsurf) install_rulefile "$PWD/.windsurf/rules/token-diet.md" \
              $'---\ntrigger: always_on\n---'; echo "windsurf: installed (always-on rule)";;
  cline)    install_rulefile "$PWD/.clinerules/token-diet.md"; echo "cline: installed (always-on rule)";;
  print)    echo "── paste this into your agent's always-on instructions ──"; cat "$ACT";;
  *) echo "unknown harness: $t" >&2; exit 2;;
esac; done
echo "done."
