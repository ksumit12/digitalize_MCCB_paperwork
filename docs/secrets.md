# Secrets

## Where they live

| Where | What | Committed? |
| --- | --- | --- |
| Vercel project environment variables | the production `DATABASE_URL` | no |
| `.env.local` on your machine | your local `DATABASE_URL` | no, gitignored |
| `.env.example` | placeholders only | yes |

Nothing else. There is no secret anywhere in this repository, and history was
scanned to confirm none was ever committed.

## Why the URL is not encrypted in the repo

Encrypting a secret into the repo sounds safer but is not. The ciphertext and
the key to open it both end up on every machine that clones, so it protects
against almost nothing while making rotation harder: an encrypted secret in
git history stays in history, and replacing it means rewriting commits rather
than editing one field in a dashboard.

Environment variables avoid all of that. Vercel holds the production value
encrypted at rest and injects it only into the running function; your laptop
holds the local value in a gitignored file. Rotation is a paste into the
dashboard and a redeploy.

Encrypted-in-repo tooling (SOPS with age, or git-crypt) is worth it when a team
must share many config values across environments and wants them reviewable in
pull requests. For one connection string it is more moving parts than it earns.

## What stops an accidental commit

`.gitignore` ignores `.env` and `.env.*` except `.env.example`, plus `*.pem`,
`*.key`, `*.p12`, `*.pfx`, and `secrets.*`. The earlier rule was `.env*.local`,
which only matched names ending in `.local`, so a plain `.env` would have gone
in.

`.githooks/pre-commit` refuses any commit that stages an env file, a private
key, or content shaped like a live Postgres connection string or Neon token.
Placeholder forms are allowed so this file and `.env.example` still work.

Enable it once per clone, since git does not version its own hooks config:

```sh
git config core.hooksPath .githooks
```

Check it is on:

```sh
git config core.hooksPath   # should print .githooks
```

To bypass it for a genuine false positive:

```sh
git commit --no-verify
```

## Rotating the database password

Do this if a URL is ever pasted into a chat, a screenshot, an issue, or a log.

1. Neon dashboard, **Roles**, reset the password for `neondb_owner`.
2. Copy the new **pooled** connection string.
3. Update `DATABASE_URL` in Vercel, then redeploy so functions pick it up.
4. Update `.env.local` on each machine.
5. Confirm from the app: the sync stats panel should still read `Neon`.

The old password stops working immediately, so expect writes to fail between
steps 1 and 3.

## Known exposure: the API has no authentication

`/api/data` accepts any request. Anyone who knows the deployment URL can read,
overwrite, or delete every frame, hole, and fault in the shared database. No
password is needed and nothing is logged about who did it.

The connection string being safe does not help here, because this route is the
database, reachable over the public internet. Treat the deployment URL itself
as the only thing standing between your data and the world until a real check
exists in front of this route.
