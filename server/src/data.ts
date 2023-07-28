import type {List, Todo, TodoUpdate} from 'shared';
import type {Executor} from './pg.js';

export type SearchResult = {
  id: string;
  rowversion: number;
};

export type ClientRecord = {
  id: string;
  lastmutationid: number;
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

export async function searchClients(
  executor: Executor,
  {clientGroupID}: {clientGroupID: string},
) {
  const {rows} = await executor(
    `select id, lastmutationid from replicache_client where clientGroupID = $1`,
    [clientGroupID],
  );
  return rows as ClientRecord[];
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

function getPlaceholders(count: number) {
  return Array.from({length: count}, (_, i) => `$${i + 1}`).join(', ');
}
