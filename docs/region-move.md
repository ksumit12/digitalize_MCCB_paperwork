# Moving the app and database to Sydney

Not applied yet. Every millisecond on the sync stats panel is currently paid
twice per request because the browser is in Australia while the serverless
function and Neon are in the United States. A 515 ms round trip for a
single-row read is almost entirely distance.

**Do not add the `vercel.json` below before Neon is in `ap-southeast-2`.**
Moving the functions to Sydney while the database stays in Virginia makes
things *worse*: today the function and database are near each other and only
the browser is far away, so there is one long hop. Split them and every
individual query pays the long hop instead.

## 1. Check what you have now

Neon dashboard, project settings:

- **Region.** Anything starting `us-` or `eu-` is the problem. You want
  `ap-southeast-2` (Sydney).
- **Plan.** On the Free plan, compute suspends after ~5 minutes idle and the
  next request pays a cold wake of several seconds. This is part of the 35 s
  first write. Either move to a paid plan and disable scale-to-zero, or accept
  a slow first write after a break.

A Neon project's region cannot be changed in place, so this is a
create-and-copy.

## 2. Create the Sydney database

Create a new Neon project in `ap-southeast-2`, then copy the data:

```sh
pg_dump "$OLD_DATABASE_URL" --no-owner --no-acl -Fc -f mccb.dump
pg_restore --no-owner --no-acl -d "$NEW_DATABASE_URL" mccb.dump
```

Verify the copy landed before switching anything:

```sh
psql "$NEW_DATABASE_URL" -c "SELECT count(*) FROM frames WHERE deleted = 0;"
psql "$NEW_DATABASE_URL" -c "SELECT value FROM sync_seq WHERE id = 1;"
psql "$NEW_DATABASE_URL" -c "SELECT version FROM schema_meta WHERE id = 1;"
```

The `sync_seq` value matters most. If it comes back lower than the old
database, devices holding a higher cursor will stop seeing new changes until
the counter catches up. Raise it past the old value if needed:

```sh
psql "$NEW_DATABASE_URL" -c "UPDATE sync_seq SET value = <old value> WHERE id = 1;"
```

## 3. Point Vercel at it and pin the region

Set `DATABASE_URL` to the new Sydney connection string, using the **pooled**
host (the one containing `-pooler`) so short-lived functions reuse connections
instead of opening a fresh one each time.

Then add `vercel.json` at the repo root:

```json
{
  "regions": ["syd1"]
}
```

Redeploy.

## 4. Confirm with the stats panel

Open the panel and compare against the numbers before the move:

| Reading | Before | Expect after |
| --- | --- | --- |
| Round trip to server | 515 ms | roughly 30–60 ms |
| Scan to accepted by Neon | 35.3 s | well under 1 s once warm |
| Other device's edit to here | 1.17 s | close to the 1 s poll floor |
| Full reconcile took | 6.92 s | under 1 s |

If round trip stays high after the move, the functions are still running
outside Sydney: check the Vercel deployment's region, since a project-level
setting can override `vercel.json`.

## Rollback

Point `DATABASE_URL` back at the old connection string and delete
`vercel.json`. Anything written to Sydney after the switch stays there, so roll
back promptly or re-dump in the other direction.
