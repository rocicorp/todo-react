import type {List, Todo, TodoUpdate} from 'shared';
import type {Executor} from './pg.js';

export type SearchResult = {
  id: string;
  rowversion: number;
};

export type ClientGroupRecord = {
  id: string;
  cvrVersion: number;
  clientVersion: number;
};

export type ClientRecord = {
  id: string;
  clientGroupID: string;
  lastMutationID: number;
  clientVersion: number;
};

export async function createList(executor: Executor, list: List) {
  await executor(
    `insert into list (id, name, rowversion, lastmodified) values ($1, $2, 1, now())`,
    [list.id, list.name],
  );
}

export async function deleteList(executor: Executor, listID: string) {
  await executor(`delete from list where id = $1`, [listID]);
}

export async function searchLists(executor: Executor) {
  const {rows} = await executor(`select id, rowversion from list`);
  return rows as SearchResult[];
}

export async function getLists(executor: Executor, listIDs: string[]) {
  if (listIDs.length === 0) return [];
  const {rows} = await executor(
    `select id, name from list where id in (${getPlaceholders(
      listIDs.length,
    )})`,
    listIDs,
  );
  return rows as List[];
}

export async function createTodo(executor: Executor, todo: Omit<Todo, 'sort'>) {
  const {rows} = await executor(
    `select max(ord) as maxord from item where listid = $1`,
    [todo.listID],
  );
  const maxOrd = rows[0]?.maxord ?? 0;
  await executor(
    `insert into item (id, listid, title, complete, ord, rowversion, lastmodified) values ($1, $2, $3, $4, $5, 1, now())`,
    [todo.id, todo.listID, todo.text, todo.completed, maxOrd + 1],
  );
}

export async function updateTodo(executor: Executor, todo: TodoUpdate) {
  await executor(
    `update item set title = coalesce($1, title), complete = coalesce($2, complete), ord = coalesce($3, ord), rowversion = rowversion + 1, lastmodified = now() where id = $4`,
    [todo.text, todo.completed, todo.sort, todo.id],
  );
}

export async function deleteTodo(executor: Executor, todoID: string) {
  await executor(`delete from item where id = $1`, [todoID]);
}

export async function searchTodos(
  executor: Executor,
  {listIDs}: {listIDs: string[]},
) {
  if (listIDs.length === 0) return [];
  const {rows} = await executor(
    `select id, rowversion from item where listid in (${getPlaceholders(
      listIDs.length,
    )})`,
    listIDs,
  );
  return rows as SearchResult[];
}

export async function getTodos(executor: Executor, todoIDs: string[]) {
  if (todoIDs.length === 0) return [];
  const {rows} = await executor(
    `select id, listid, title, complete, ord from item where id in (${getPlaceholders(
      todoIDs.length,
    )})`,
    todoIDs,
  );
  return rows.map(r => {
    const todo: Todo = {
      id: r.id,
      listID: r.listid,
      text: r.title,
      completed: r.complete,
      sort: r.ord,
    };
    return todo;
  });
}

export async function putClientGroup(
  executor: Executor,
  clientGroup: ClientGroupRecord,
) {
  const {id, cvrVersion, clientVersion} = clientGroup;
  await executor(
    `insert into replicache_client_group
      (id, cvrversion, clientversion, lastmodified)
    values
      ($1, $2, $3, now())
    on conflict (id) do update set
      cvrversion = $2, clientversion = $3, lastmodified = now()`,
    [id, cvrVersion, clientVersion],
  );
}

export async function getClientGroupForUpdate(
  executor: Executor,
  clientGroupID: string,
) {
  const prevClientGroup = await getClientGroup(executor, clientGroupID, {
    forUpdate: true,
  });
  return (
    prevClientGroup ?? {
      id: clientGroupID,
      cvrVersion: 0,
      clientVersion: 0,
    }
  );
}

export async function getClientGroup(
  executor: Executor,
  clientGroupID: string,
  {forUpdate}: {forUpdate?: boolean} = {},
) {
  const {rows} = await executor(
    `select cvrversion, clientversion from replicache_client_group where id = $1 ${
      forUpdate ? 'for update' : ''
    }`,
    [clientGroupID],
  );
  if (!rows || rows.length === 0) return undefined;
  const r = rows[0];
  const res: ClientGroupRecord = {
    id: clientGroupID,
    cvrVersion: r.cvrversion,
    clientVersion: r.clientversion,
  };
  return res;
}

export async function searchClients(
  executor: Executor,
  {
    clientGroupID,
    sinceClientVersion,
  }: {clientGroupID: string; sinceClientVersion: number},
) {
  const {rows} = await executor(
    `select id, lastmutationid from replicache_client where clientGroupID = $1 and clientversion > $2`,
    [clientGroupID, sinceClientVersion],
  );
  return rows as ClientRecord[];
}

export async function getClientForUpdate(executor: Executor, clientID: string) {
  const prevClient = await getClient(executor, clientID, {forUpdate: true});
  return (
    prevClient ?? {
      id: clientID,
      clientGroupID: '',
      lastMutationID: 0,
      clientVersion: 0,
    }
  );
}

export async function getClient(
  executor: Executor,
  clientID: string,
  {forUpdate}: {forUpdate?: boolean} = {},
) {
  const {rows} = await executor(
    `select clientgroupid, lastmutationid, clientversion from replicache_client where id = $1 ${
      forUpdate ? 'for update' : ''
    }`,
    [clientID],
  );
  if (!rows || rows.length === 0) return undefined;
  const r = rows[0];
  const res: ClientRecord = {
    id: r.id,
    clientGroupID: r.clientgroupid,
    lastMutationID: r.lastmutationid,
    clientVersion: r.lastclientversion,
  };
  return res;
}

export async function putClient(executor: Executor, client: ClientRecord) {
  const {id, clientGroupID, lastMutationID, clientVersion} = client;
  await executor(
    `
      insert into replicache_client
        (id, clientgroupid, lastmutationid, clientversion, lastmodified)
      values
        ($1, $2, $3, $4, now())
      on conflict (id) do update set
        lastmutationid = $3, clientversion = $4, lastmodified = now()
      `,
    [id, clientGroupID, lastMutationID, clientVersion],
  );
}

function getPlaceholders(count: number) {
  return Array.from({length: count}, (_, i) => `$${i + 1}`).join(', ');
}
