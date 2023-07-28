import {z} from 'zod';
import type {PatchOperation, PullResponse, PullResponseOKV1} from 'replicache';
import type Express from 'express';
import {transact} from './pg';
import {
  getLists,
  getTodos,
  searchClients,
  searchLists,
  searchTodos,
} from './data';
import {ClientViewRecord} from './cvr';

const pullRequest = z.object({
  clientGroupID: z.string(),
  cookie: z.any(),
});

// cvrID -> ClientViewRecord
const cvrCache = new Map<
  number,
  {list: ClientViewRecord; todo: ClientViewRecord}
>();

export async function pull(
  requestBody: Express.Request,
): Promise<PullResponse> {
  console.log(`Processing pull`, JSON.stringify(requestBody, null, ''));

  const pull = pullRequest.parse(requestBody);
  console.log({pull});

  const {clientGroupID} = pull;
  const prevCVRs = cvrCache.get(pull.cookie);
  const baseCVRs = prevCVRs ?? {
    list: new ClientViewRecord(),
    todo: new ClientViewRecord(),
  };

  const {nextCVRs, clients, lists, todos} = await transact(async executor => {
    const [clients, listResult] = await Promise.all([
      searchClients(executor, {
        clientGroupID,
      }),
      await searchLists(executor),
    ]);

    const todoResult = await searchTodos(executor, {
      listIDs: listResult.map(l => l.id),
    });

    const nextCVRs = {
      list: ClientViewRecord.fromSearchResult(listResult),
      todo: ClientViewRecord.fromSearchResult(todoResult),
    };

    const listPuts = nextCVRs.list.getPutsSince(baseCVRs.list);
    const todoPuts = nextCVRs.todo.getPutsSince(baseCVRs.todo);

    const [lists, todos] = await Promise.all([
      getLists(executor, listPuts),
      getTodos(executor, todoPuts),
    ]);
    console.log({listPuts, lists, todoPuts, todos});

    return {nextCVRs, clients, lists, todos};
  });

  const listDels = nextCVRs.list.getDelsSince(baseCVRs.list);
  const todoDels = nextCVRs.todo.getDelsSince(baseCVRs.todo);

  const patch: PatchOperation[] = [];

  if (prevCVRs === undefined) {
    patch.push({op: 'clear'});
  }

  for (const id of listDels) {
    patch.push({op: 'del', key: `list/${id}`});
  }
  for (const list of lists) {
    patch.push({op: 'put', key: `list/${list.id}`, value: list});
  }
  for (const id of todoDels) {
    patch.push({op: 'del', key: `todo/${id}`});
  }
  for (const todo of todos) {
    patch.push({op: 'put', key: `todo/${todo.id}`, value: todo});
  }

  // TODO: Properly get a cookie value.
  const respCookie = Date.now();
  const resp: PullResponseOKV1 = {
    cookie: respCookie,
    lastMutationIDChanges: Object.fromEntries(
      clients.map(e => [e.id, e.lastmutationid] as const),
    ),
    patch,
  };

  cvrCache.set(respCookie, nextCVRs);

  return resp;
}
