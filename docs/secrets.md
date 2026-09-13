# Secrets

## Where they live

| Where | What | Committed? |
| --- | --- | --- |
| Vercel project environment variables | production `DATABASE_URL` and `APP_PASSCODE` | no |
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

## The crew passcode

`APP_PASSCODE` gates the whole app, including `/api/data`. Without it that route
accepted any request, so anyone who knew the deployment URL could read,
overwrite, or delete every frame and hole.

Set it in Vercel, then redeploy:

```
APP_PASSCODE=<something the crew can type on a phone>
```

**If `APP_PASSCODE` is not set, the gate is off and the app is open.** That is
deliberate: shipping a locked-out app to a crew already mid-shift would be worse
than the exposure. The sync stats panel shows `Access: OPEN` in red whenever
this is the case, so it cannot go unnoticed.

How it works. `middleware.ts` checks a signed cookie on every request except
`/login`, `/api/auth`, and static assets. `/login` takes the passcode, and
`/api/auth` verifies it and sets an HttpOnly, SameSite=Lax cookie that lasts 90
days. The cookie carries its own expiry plus an HMAC over it keyed by the
passcode, so no session is stored server-side, a tampered expiry fails the
signature check, and changing the passcode invalidates every existing cookie.

Page requests without a valid cookie redirect to `/login`; API requests get a
401, which the sync loop treats as a locked door rather than a dead network and
sends the person to `/login` instead of retrying forever.

What this is and is not. It keeps strangers out. It does not tell you who did
what, since everyone shares one passcode and writes are still attributed only
by the initials typed into a frame. Anyone who leaves the crew keeps working
access until the passcode is rotated.

To rotate it, change `APP_PASSCODE` in Vercel and redeploy. Every device will
ask for the new one, because the old cookies no longer verify.

To sign a device out:

```sh
curl -X POST https://<your-app>/api/auth -H 'content-type: application/json' \
  -d '{"action":"signOut"}'
```

## Still open

Rate limiting on `/api/auth` is a fixed 600 ms delay per wrong attempt, which
slows guessing but does not stop a determined attacker who knows the URL. If the
passcode is short, make it longer rather than relying on that delay.
