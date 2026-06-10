# Repo memory for Claude

## Git workflow — no pull requests

Kelsey does not use pull requests. At the end of every session, ship work like this:

1. Commit the changes on the session's working branch.
2. Merge the session branch straight into `main` and push `main`. Kelsey has given
   standing permission to push to `main` — do not open a PR, and do not ask first.
   **Exception:** if the merge into `main` hits conflicts beyond trivial ones,
   summarize the change and the conflict and wait for Kelsey's go-ahead instead
   of merging automatically.
