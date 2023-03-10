import { nanoid } from "nanoid";
import type { JSONValue, PatchOperation } from "replicache";
import { z } from "zod";
import type { Executor } from "./pg.js";
import type { Todo } from "shared";

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
  return { value, version };
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
    // TODO: Not sure why we need to JSON.stringify() here, but do not need to JSON.parse() on read??
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

export type SearchOptions = {
  returnValue?: boolean | undefined;
  spaceID?: string | undefined;
  fromKey?: string | undefined;
  whereComplete?: boolean | undefined;
  inKeys?: string[] | undefined;
};

export type SearchResult = {
  spaceID: string;
  key: string;
  value: JSONValue | undefined;
  version: number;
};

export async function searchEntries(
  executor: Executor,
  opts: SearchOptions
): Promise<SearchResult[]> {
  const { returnValue, spaceID, fromKey, whereComplete, inKeys } = opts;

  const columns = ["spaceid", "key", "version"];
  if (returnValue) {
    columns.push("value");
  }

  const filters = ["true"];
  const params: unknown[] = [];

  if (spaceID !== undefined) {
    params.push(spaceID);
    filters.push(`spaceid = $${params.length}`);
  }

  if (fromKey !== undefined) {
    params.push(fromKey);
    filters.push(`key >= $${params.length}`);
  }

  if (inKeys !== undefined) {
    params.push(inKeys);
    filters.push(`key = any($${params.length})`);
  }

  if (whereComplete !== undefined) {
    params.push(whereComplete);
    filters.push(
      `(key not like 'todo/%' or value->'completed' = $${params.length})`
    );
  }

  const sql = `select ${columns.join(", ")}
    from replicache_entry
    where ${filters.join(" and ")}
    order by spaceid, key asc`;

  const { rows } = await executor(sql, params);
  return rows.map((row) => ({
    spaceID: row.spaceid,
    key: row.key,
    value: returnValue ? row.value : undefined,
    version: row.version,
  }));
}

export type ClientViewRecord = {
  id: string;
  keys: Record<string, number>;
};

export function makeCVR(results: SearchResult[], newID: () => string) {
  const cvr: ClientViewRecord = {
    id: newID(),
    keys: {},
  };
  for (const r of results) {
    cvr.keys[r.key] = r.version;
  }
  return cvr;
}

export async function getPatch(
  executor: Executor,
  searchOptions: Omit<SearchOptions, "returnValue">,
  prevCVR: ClientViewRecord | undefined,
  newID: () => string
): Promise<{ patch: PatchOperation[]; cvr: ClientViewRecord }> {
  if (prevCVR === undefined) {
    return getResetPatch(executor, searchOptions, newID);
  }

  const entries = await searchEntries(executor, searchOptions);
  const nextCVR = makeCVR(entries, newID);

  const putKeys = [];
  for (const [key, version] of Object.entries(nextCVR.keys)) {
    const prevVersion = prevCVR.keys[key];
    if (prevVersion === undefined || prevVersion < version) {
      putKeys.push(key);
    }
  }

  const delKeys = [];
  for (const key of Object.keys(prevCVR.keys)) {
    if (nextCVR.keys[key] === undefined) {
      delKeys.push(key);
    }
  }

  if (putKeys.length + delKeys.length >= 1000) {
    return getResetPatch(executor, searchOptions, newID);
  }

  const putRows = await searchEntries(executor, {
    spaceID: searchOptions.spaceID,
    returnValue: true,
    inKeys: putKeys,
  });

  const patch: PatchOperation[] = [];
  for (const row of putRows) {
    patch.push({
      op: "put",
      key: row.key,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      value: row.value!,
    });
  }
  for (const key of delKeys) {
    patch.push({
      op: "del",
      key,
    });
  }

  return { patch, cvr: nextCVR };
}

async function getResetPatch(
  executor: Executor,
  searchOptions: SearchOptions,
  newID: () => string
): Promise<{ patch: PatchOperation[]; cvr: ClientViewRecord }> {
  const rows = await searchEntries(executor, {
    ...searchOptions,
    returnValue: true,
  });

  const cvr = makeCVR(rows, newID);
  const patch: PatchOperation[] = [
    {
      op: "clear",
    },
  ];

  for (const row of rows) {
    patch.push({
      op: "put",
      key: row.key,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      value: row.value!,
    });
  }

  return {
    patch,
    cvr,
  };
}

export async function createSpace(
  executor: Executor,
  spaceID: string,
  populateSampleData = false
): Promise<void> {
  console.log("creating space", spaceID);
  await executor(
    `insert into replicache_space (id, lastmodified) values ($1, now())`,
    [spaceID]
  );

  if (populateSampleData) {
    console.log("populating sample data...");
    for (let i = 0; i < 1000; i++) {
      const todo: Todo = {
        id: nanoid(),
        text: `Sample todo ${i}`,
        completed: i > 10,
        sort: i,
      };
      await putEntry(executor, spaceID, `todo/${nanoid()}`, todo);
    }
  }
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
