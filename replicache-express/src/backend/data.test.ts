import { expect } from "chai";
import { test } from "mocha";
import type { JSONValue, PatchOperation } from "replicache";
import {
  ClientViewRecord,
  createSpace,
  delEntry,
  getEntries,
  getEntry,
  getPatch,
  hasSpace,
  putEntry,
} from "./data.js";
import { withExecutor } from "./pg.js";

test("getEntry", async () => {
  type Case = {
    name: string;
    exists: boolean;
    validJSON: boolean;
  };
  const cases: Case[] = [
    {
      name: "does not exist",
      exists: false,
      validJSON: false,
    },
    {
      name: "exists",
      exists: true,
      validJSON: true,
    },
    {
      name: "exists, invalid JSON",
      exists: true,
      validJSON: false,
    },
  ];

  await withExecutor(async (executor) => {
    for (const c of cases) {
      await executor(`delete from replicache_entry`);
      if (c.exists) {
        await executor(
          `insert into replicache_entry (spaceid, key, value, version, lastmodified) values ('s1', 'foo', $1, 0, now())`,
          [c.validJSON ? JSON.stringify(42) : "not json"]
        );
      }

      const promise = getEntry(executor, "s1", "foo");
      let result: JSONValue | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let error: any | undefined;
      let version: number | undefined;
      await promise.then(
        (r) => {
          result = r?.value;
          version = r?.version;
        },
        (e) => (error = String(e))
      );
      if (!c.exists) {
        expect(result, c.name).undefined;
        expect(version, c.name).undefined;
        expect(error, c.name).undefined;
      } else if (!c.validJSON) {
        expect(result, c.name).undefined;
        expect(version, c.name).undefined;
        expect(error, c.name).contains("SyntaxError");
      } else {
        expect(result, c.name).eq(42);
        expect(version, c.name).eq(0);
        expect(error, c.name).undefined;
      }
    }
  });
});

test("getEntry RoundTrip types", async () => {
  await withExecutor(async (executor) => {
    await putEntry(executor, "s1", "boolean", true);
    await putEntry(executor, "s1", "number", 42);
    await putEntry(executor, "s1", "string", "foo");
    await putEntry(executor, "s1", "array", [1, 2, 3]);
    await putEntry(executor, "s1", "object", { a: 1, b: 2 });

    expect(await getEntry(executor, "s1", "boolean")).deep.equal({
      value: true,
      version: 0,
    });
    expect(await getEntry(executor, "s1", "number")).deep.equal({
      value: 42,
      version: 0,
    });
    expect(await getEntry(executor, "s1", "string")).deep.equal({
      value: "foo",
      version: 0,
    });
    expect(await getEntry(executor, "s1", "array")).deep.equal({
      value: [1, 2, 3],
      version: 0,
    });
    expect(await getEntry(executor, "s1", "object")).deep.equal({
      value: { a: 1, b: 2 },
      version: 0,
    });
  });
});

test("getEntries", async () => {
  await withExecutor(async (executor) => {
    await executor(`delete from replicache_entry`);
    await putEntry(executor, "s1", "foo", "foo");
    await putEntry(executor, "s1", "bar", "bar");
    await putEntry(executor, "s1", "baz", "baz");

    type Case = {
      name: string;
      fromKey: string;
      expect: string[];
    };
    const cases: Case[] = [
      {
        name: "fromEmpty",
        fromKey: "",
        expect: ["bar", "baz", "foo"],
      },
      {
        name: "fromB",
        fromKey: "b",
        expect: ["bar", "baz", "foo"],
      },
      {
        name: "fromBar",
        fromKey: "bar",
        expect: ["bar", "baz", "foo"],
      },
      {
        name: "fromBas",
        fromKey: "bas",
        expect: ["baz", "foo"],
      },
      {
        name: "fromF",
        fromKey: "f",
        expect: ["foo"],
      },
      {
        name: "fromFooa",
        fromKey: "fooa",
        expect: [],
      },
    ];

    for (const c of cases) {
      const entries: (readonly [string, JSONValue])[] = [];
      for await (const entry of getEntries(executor, "s1", c.fromKey)) {
        entries.push(entry);
      }
      expect(entries).deep.equal(
        c.expect.map((k) => [k, k]),
        c.name
      );
    }
  });
});

test("putEntry", async () => {
  type Case = {
    name: string;
    duplicate: boolean;
  };

  const cases: Case[] = [
    {
      name: "not duplicate",
      duplicate: false,
    },
    {
      name: "duplicate",
      duplicate: true,
    },
  ];

  await withExecutor(async (executor) => {
    for (const c of cases) {
      await executor(`delete from replicache_entry`);

      let res: Promise<void>;
      if (c.duplicate) {
        await putEntry(executor, "s1", "foo", 41);
      }
      // eslint-disable-next-line prefer-const
      res = putEntry(executor, "s1", "foo", 42);

      await res.catch(() => ({}));

      const qr = await executor(
        `select spaceid, key, value, version
        from replicache_entry where spaceid = 's1' and key = 'foo'`
      );
      const [row] = qr.rows;

      expect(row, c.name).not.undefined;
      const { spaceid, key, value, version } = row;
      expect(spaceid, c.name).eq("s1");
      expect(key, c.name).eq("foo");
      expect(value, c.name).eq("42");
      expect(version, c.name).eq(c.duplicate ? 1 : 0);
    }
  });
});

test("putEntry increments version", async () => {
  await withExecutor(async (executor) => {
    await executor(`delete from replicache_entry`);

    expect(await getEntry(executor, "s1", "foo")).undefined;

    await putEntry(executor, "s1", "foo", "bar");
    expect(await getEntry(executor, "s1", "foo")).deep.equal({
      value: "bar",
      version: 0,
    });

    await putEntry(executor, "s1", "foo", "baz");
    expect(await getEntry(executor, "s1", "foo")).deep.equal({
      value: "baz",
      version: 1,
    });

    await putEntry(executor, "s1", "foo", "hotdog");
    expect(await getEntry(executor, "s1", "foo")).deep.equal({
      value: "hotdog",
      version: 2,
    });

    await putEntry(executor, "s1", "monkey", "nuts");
    expect(await getEntry(executor, "s1", "monkey")).deep.equal({
      value: "nuts",
      version: 0,
    });
  });
});

test("delEntry", async () => {
  type Case = {
    name: string;
    exists: boolean;
  };
  const cases: Case[] = [
    {
      name: "does not exist",
      exists: false,
    },
    {
      name: "exists",
      exists: true,
    },
  ];
  for (const c of cases) {
    await withExecutor(async (executor) => {
      await executor(`delete from replicache_entry`);
      if (c.exists) {
        await executor(
          `insert into replicache_entry (spaceid, key, value, version, lastmodified) values ('s1', 'foo', '42', 1, now())`
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let error: any | undefined;
      await delEntry(executor, "s1", "foo").catch((e) => (error = String(e)));

      const qr = await executor(
        `select spaceid, key, value, version from replicache_entry where spaceid = 's1' and key = 'foo'`
      );
      const [row] = qr.rows;

      expect(row, c.name).undefined;
      expect(error, c.name).undefined;
    });
  }
});

test("createSpace", async () => {
  type Case = {
    name: string;
    exists: boolean;
  };
  const cases: Case[] = [
    {
      name: "does not exist",
      exists: false,
    },
    {
      name: "exists",
      exists: true,
    },
  ];
  for (const c of cases) {
    await withExecutor(async (executor) => {
      await executor(`delete from replicache_space`);
      expect(await hasSpace(executor, "foo"), c.name).false;

      if (c.exists) {
        await createSpace(executor, "foo");
      }

      try {
        await createSpace(executor, "foo");
        expect(c.exists).false;
      } catch (e) {
        expect(String(e)).contains(
          `duplicate key value violates unique constraint "replicache_space_pkey`
        );
        expect(c.exists).true;
      }

      expect(await hasSpace(executor, "foo"), c.name).true;

      const res = await executor(
        `select * from replicache_space where id = 'foo'`
      );
      expect(res.rowCount).eq(1);
      const [row] = res.rows;
      if (c.exists) {
        expect(row).deep.equal({
          id: "foo",
          lastmodified: row.lastmodified,
        });
      } else {
        expect(row).deep.equal({
          id: "foo",
          lastmodified: row.lastmodified,
        });
      }
    });
  }
});

test("getPatch", async () => {
  type Case = {
    name: string;
    spaceID: string;
    prevCVR: ClientViewRecord | undefined;
    data: { spaceid: string; key: string; value: string; version: number }[];
    expectedResult: { patch: PatchOperation[]; cvr: ClientViewRecord };
  };

  const sampleData = [
    { spaceid: "s1", key: "foo", value: '"bar"', version: 0 },
    { spaceid: "s1", key: "hot", value: '"dog"', version: 1 },
    { spaceid: "s1", key: "mon", value: '"key"', version: 2 },
    { spaceid: "s2", key: "foo", value: '"bar"', version: 0 },
    { spaceid: "s2", key: "hot", value: '"dog"', version: 1 },
    { spaceid: "s2", key: "mon", value: '"key"', version: 2 },
  ];

  const hugeData: {
    spaceid: string;
    key: string;
    value: string;
    version: number;
  }[] = [];
  for (let i = 0; i < 1000; i++) {
    hugeData.push({
      spaceid: "s1",
      key: `foo${String(i).padStart(4, "0")}`,
      value: `"bar"`,
      version: i,
    });
  }

  const expectedCVR = {
    id: "id1",
    keys: {
      foo: 0,
      hot: 1,
      mon: 2,
    },
  };

  const cases: Case[] = [
    {
      name: "undefined prevCVR",
      spaceID: "s1",
      prevCVR: undefined,
      data: sampleData,
      expectedResult: {
        patch: [
          { op: "clear" },
          { op: "put", key: "foo", value: "bar" },
          { op: "put", key: "hot", value: "dog" },
          { op: "put", key: "mon", value: "key" },
        ],
        cvr: expectedCVR,
      },
    },
    {
      name: "undefined prevCVR, spaceID not found",
      spaceID: "s3",
      prevCVR: undefined,
      data: sampleData,
      expectedResult: {
        patch: [{ op: "clear" }],
        cvr: {
          id: "id1",
          keys: {},
        },
      },
    },
    {
      name: "no op change",
      spaceID: "s1",
      prevCVR: {
        id: "id2",
        keys: {
          foo: 0,
          hot: 1,
          mon: 2,
        },
      },
      data: sampleData,
      expectedResult: {
        patch: [],
        cvr: expectedCVR,
      },
    },
    {
      name: "added entries",
      spaceID: "s1",
      prevCVR: {
        id: "id2",
        keys: {
          foo: 0,
        },
      },
      data: sampleData,
      expectedResult: {
        patch: [
          {
            op: "put",
            key: "hot",
            value: "dog",
          },
          {
            op: "put",

            key: "mon",
            value: "key",
          },
        ],
        cvr: expectedCVR,
      },
    },
    {
      name: "modified entries",
      spaceID: "s1",
      prevCVR: {
        id: "id2",
        keys: {
          foo: 0,
          hot: 0,
          mon: 0,
        },
      },
      data: sampleData,
      expectedResult: {
        patch: [
          {
            op: "put",
            key: "hot",
            value: "dog",
          },
          {
            op: "put",
            key: "mon",
            value: "key",
          },
        ],
        cvr: expectedCVR,
      },
    },
    {
      name: "deleted entries",
      spaceID: "s1",
      prevCVR: {
        id: "id2",
        keys: {
          foo: 0,
          hot: 1,
          mon: 2,
          beep: 3,
        },
      },
      data: sampleData,
      expectedResult: {
        patch: [
          {
            op: "del",
            key: "beep",
          },
        ],
        cvr: expectedCVR,
      },
    },
    {
      name: "mixed",
      spaceID: "s1",
      prevCVR: {
        id: "id2",
        keys: {
          hot: 1,
          mon: 1,
          beep: 3,
        },
      },
      data: sampleData,
      expectedResult: {
        patch: [
          {
            op: "del",
            key: "beep",
          },
          {
            op: "put",
            key: "foo",
            value: "bar",
          },
          {
            op: "put",
            key: "mon",
            value: "key",
          },
        ],
        cvr: expectedCVR,
      },
    },
    {
      name: "too many adds",
      spaceID: "s1",
      prevCVR: {
        id: "id2",
        keys: {},
      },
      data: hugeData,
      expectedResult: {
        patch: [
          { op: "clear" },
          ...hugeData.map(
            (d) =>
              ({ op: "put", key: d.key, value: JSON.parse(d.value) } as const)
          ),
        ],
        cvr: {
          id: "id1",
          keys: Object.fromEntries(hugeData.map((d) => [d.key, d.version])),
        },
      },
    },
    {
      name: "too many deletes",
      spaceID: "s1",
      prevCVR: {
        id: "id2",
        keys: Object.fromEntries(
          hugeData.map((d) => [d.key, d.version] as const)
        ),
      },
      data: [],
      expectedResult: {
        patch: [{ op: "clear" }],
        cvr: {
          id: "id1",
          keys: {},
        },
      },
    },
    {
      name: "too many adds and deletes",
      spaceID: "s1",
      prevCVR: {
        id: "id2",
        keys: Object.fromEntries(
          hugeData.slice(0, 500).map((d) => [d.key, d.version] as const)
        ),
      },
      data: hugeData.slice(500),
      expectedResult: {
        patch: [
          { op: "clear" },
          ...hugeData
            .slice(500)
            .map(
              (d) =>
                ({ op: "put", key: d.key, value: JSON.parse(d.value) } as const)
            ),
        ],
        cvr: {
          id: "id1",
          keys: Object.fromEntries(
            hugeData.slice(500).map((d) => [d.key, d.version])
          ),
        },
      },
    },
  ];

  await withExecutor(async (executor) => {
    await executor(`delete from replicache_space`);

    await executor(
      `insert into replicache_space (id, lastmodified) values ('s1', now())`
    );
    await executor(
      `insert into replicache_space (id, lastmodified) values ('s2', now())`
    );

    for (const c of cases) {
      await executor(`delete from replicache_entry`);
      for (const d of c.data) {
        await executor(
          `insert into replicache_entry (spaceid, key, value, version, lastmodified) values ($1, $2, $3, $4, now())`,
          [d.spaceid, d.key, d.value, d.version]
        );
      }

      const res = await getPatch(executor, c.spaceID, c.prevCVR, () => "id1");
      res.patch.sort((a, b) => {
        if (a.op === "clear") {
          return -1;
        }
        if (b.op === "clear") {
          return 1;
        }
        return a.key.localeCompare(b.key);
      });
      expect(res).deep.equal(c.expectedResult);
    }
  });
});
