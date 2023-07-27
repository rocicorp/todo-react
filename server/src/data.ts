import type {Executor} from './pg.js';

export async function getClientsByGroup(
  executor: Executor,
  clientGroupID: string,
) {
  const {rows} = await executor(
    `select id, lastmutationid from replicache_client where clientGroupID = $1`,
    [clientGroupID],
  );
  return rows as {id: string; lastmutationid: number}[];
}

export async function getLastMutationID(
  executor: Executor,
  clientID: string,
): Promise<number | undefined> {
  const {rows} = await executor(
    `select lastmutationid from replicache_client where id = $1`,
    [clientID],
  );
  const value = rows[0]?.lastmutationid;
  if (value === undefined) {
    return undefined;
  }
  return value as number;
}

export async function setLastMutationID(
  executor: Executor,
  clientID: string,
  clientGroupID: string,
  lastMutationID: number,
): Promise<void> {
  await executor(
    `
    insert into replicache_client (id, clientgroupid, lastmutationid, lastmodified)
    values ($1, $2, $3, now())
      on conflict (id) do update set lastmutationid = $3, lastmodified = now()
    `,
    [clientID, clientGroupID, lastMutationID],
  );
}
