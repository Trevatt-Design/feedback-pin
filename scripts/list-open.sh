#!/bin/sh
# Usage: scripts/list-open.sh <project_id>  - lists open/in-progress comments in local D1
cd "$(dirname "$0")/../api" || exit 1
npx wrangler d1 execute feedback-pin --local --json --command "SELECT id, status, url, substr(replace(change_text, char(10), ' '), 1, 70) AS t FROM comments WHERE project_id='$1' AND status NOT IN ('resolved','wont-fix') ORDER BY created_at" 2>/dev/null \
 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s.slice(s.indexOf("[")))[0].results;console.log(r.length+" open");r.forEach(x=>console.log(x.id,x.status,new URL(x.url).pathname,"|",x.t))})'
