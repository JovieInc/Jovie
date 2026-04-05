# Push Recovery Note

The globals.css file on this branch was accidentally truncated by an MCP push_files call.
The git proxy returned persistent HTTP 403 errors preventing git push.

To fix: run `git checkout main -- apps/web/app/globals.css` then remove the CSS rotation block (lines 80-95).
