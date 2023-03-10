import type { JSONValue, PatchOperation } from "replicache";
import { z } from "zod";
import type { Executor } from "./pg.js";

export async function getEntry(
  executor: Executor,
  spaceid: string,
  key: string
): Promise<{ value: JSONValue; version: number } | undefined> {
  const { rows } = await executor(
    "select value, version from replicache_entry where spaceid = $1 and key = $2",
    [spaceid, key]
  );
  const value = rows[0]?.value;
  if (value === undefined) {
    return undefined;
  }

  const version = rows[0].version as number;
  return { value: JSON.parse(value), version };
}

export async function putEntry(
  executor: Executor,
  spaceID: string,
  key: string,
  value: JSONValue
): Promise<void> {
  await executor(
    `
    insert into replicache_entry e (spaceid, key, value, version, lastmodified)
    values ($1, $2, $3, 0, now())
      on conflict (spaceid, key) do update set
        value = $3, version = e.version + 1, lastmodified = now()
    `,
    [spaceID, key, JSON.stringify(value)]
  );
}

export async function delEntry(
  executor: Executor,
  spaceID: string,
  key: string
): Promise<void> {
  await executor(
    `delete from replicache_entry where spaceid = $1 and key = $2`,
    [spaceID, key]
  );
}

export async function* getEntries(
  executor: Executor,
  spaceID: string,
  fromKey: string
): AsyncIterable<readonly [string, JSONValue]> {
  const { rows } = await executor(
    `select key, value from replicache_entry where spaceid = $1 and key >= $2 order by key`,
    [spaceID, fromKey]
  );
  for (const row of rows) {
    yield [row.key as string, JSON.parse(row.value) as JSONValue] as const;
  }
}

export type ClientViewRecord = {
  id: string;
  keys: Record<string, number>;
};

export async function getPatch(
  executor: Executor,
  spaceID: string,
  prevCVR: ClientViewRecord | undefined,
  newID: () => string
): Promise<{ patch: PatchOperation[]; cvr: ClientViewRecord }> {
  if (prevCVR === undefined) {
    return getResetPatch(executor, spaceID, newID);
  }

  const { rows: nextCVRRows } = await executor(
    `select key, version from replicache_entry where spaceid = $1`,
    [spaceID]
  );

  const nextCVR: ClientViewRecord = {
    id: newID(),
    keys: {},
  };

  for (const row of nextCVRRows) {
    nextCVR.keys[row.key] = row.version;
  }

  const putIDs = [];
  for (const [key, version] of Object.entries(nextCVR.keys)) {
    const prevVersion = prevCVR.keys[key];
    if (prevVersion === undefined || prevVersion < version) {
      putIDs.push(key);
    }
  }

  const delIDs = [];
  for (const key of Object.keys(prevCVR.keys)) {
    if (nextCVR.keys[key] === undefined) {
      delIDs.push(key);
    }
  }

  if (putIDs.length + delIDs.length >= 1000) {
    return getResetPatch(executor, spaceID, newID);
  }

  const { rows: putRows } = await executor(
    `select key, value from replicache_entry where spaceid = $1 and key = any($2)`,
    [spaceID, putIDs]
  );

  const patch: PatchOperation[] = [];
  for (const row of putRows) {
    patch.push({
      op: "put",
      key: row.key,
      value: JSON.parse(row.value),
    });
  }
  for (const key of delIDs) {
    patch.push({
      op: "del",
      key,
    });
  }

  return { patch, cvr: nextCVR };
}

async function getResetPatch(
  executor: Executor,
  spaceID: string,
  newID: () => string
): Promise<{ patch: PatchOperation[]; cvr: ClientViewRecord }> {
  const { rows } = await executor(
    `select key, value, version from replicache_entry where spaceid = $1`,
    [spaceID]
  );

  const cvr: ClientViewRecord = {
    id: newID(),
    keys: {},
  };

  const patch: PatchOperation[] = [
    {
      op: "clear",
    },
  ];

  for (const row of rows) {
    patch.push({
      op: "put",
      key: row.key,
      value: JSON.parse(row.value),
    });
    cvr.keys[row.key] = row.version;
  }
  return {
    patch,
    cvr,
  };
}

export async function createSpace(
  executor: Executor,
  spaceID: string
): Promise<void> {
  console.log("creating space", spaceID);
  await executor(
    `insert into replicache_space (id, lastmodified) values ($1, now())`,
    [spaceID]
  );
}

export async function hasSpace(
  executor: Executor,
  spaceID: string
): Promise<boolean> {
  console.log("checking space existence", spaceID);
  const res = await executor(
    `select 1 from replicache_space where id = $1 limit 1`,
    [spaceID]
  );
  return res.rowCount === 1;
}

export async function getLastMutationID(
  executor: Executor,
  clientID: string
): Promise<number | undefined> {
  const { rows } = await executor(
    `select lastmutationid from replicache_client where id = $1`,
    [clientID]
  );
  const value = rows[0]?.lastmutationid;
  if (value === undefined) {
    return undefined;
  }
  return z.number().parse(value);
}

export async function setLastMutationID(
  executor: Executor,
  clientID: string,
  lastMutationID: number
): Promise<void> {
  await executor(
    `
    insert into replicache_client (id, lastmutationid, lastmodified)
    values ($1, $2, now())
      on conflict (id) do update set lastmutationid = $2, lastmodified = now()
    `,
    [clientID, lastMutationID]
  );
}
