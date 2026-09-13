# Region: keeping the functions next to the database

**Applied.** `vercel.json` pins functions to `syd1`.

## What was wrong

The Neon database is already in `ap-southeast-2` (Sydney) on the pooled host.
Vercel functions, with no region configured, default to `iad1` in Virginia.

That is the worst of the available arrangements. Every single SQL query crossed
the Pacific and back, and a request runs several of them. It showed up on the
sync stats panel as a 515 ms round trip for a query that reads one row, and it
is why a cold start running twenty migration statements cost 35 seconds.

Moving the functions to Sydney puts them beside the database. The one long hop
that remains is the browser reaching the function, paid once per request
instead of once per query.

No data migration is needed. This is a config change only.

```json
{
  "regions": ["syd1"]
}
```

## Confirming it worked

Open the sync stats panel after the deploy and compare:

| Reading | Before | Expect after |
| --- | --- | --- |
| Round trip to server | 515 ms | roughly 30–60 ms |
| Scan to accepted by Neon | 35.3 s | well under 1 s once warm |
| Other device's edit to here | 1.17 s | close to the 1 s poll floor |
| Full reconcile took | 6.92 s | under 1 s |

If the round trip stays high, the functions are still running outside Sydney.
A region set in the Vercel project dashboard can override `vercel.json`, so
check there.

## Still worth checking in Neon

On the Free plan, compute suspends after roughly five minutes idle and the next
request pays a cold wake of several seconds. That is separate from distance and
survives this change. Either move to a paid plan and disable scale-to-zero, or
accept that the first write after a break is slow.

## If the database ever does need moving

A Neon project's region cannot be changed in place, so it is a create-and-copy:

```sh
pg_dump "$OLD_DATABASE_URL" --no-owner --no-acl -Fc -f mccb.dump
pg_restore --no-owner --no-acl -d "$NEW_DATABASE_URL" mccb.dump
psql "$NEW_DATABASE_URL" -c "SELECT value FROM sync_seq WHERE id = 1;"
```

Check `sync_seq` before switching. If it restores lower than the old value,
devices holding a higher cursor will stop seeing changes until the counter
catches up; raise it past the old value if so. Then point `DATABASE_URL` at the
pooled host of the new project and update `regions` to match.
