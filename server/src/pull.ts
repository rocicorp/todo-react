import {z} from 'zod';
import type {PatchOperation, PullResponse, PullResponseOKV1} from 'replicache';
import type Express from 'express';
import {transact} from './pg';
import {getClientsByGroup, getTodosByList, listLists} from './data';

const pullRequest = z.object({
  clientGroupID: z.string(),
  cookie: z.any(),
});

export async function pull(
  requestBody: Express.Request,
): Promise<PullResponse> {
  console.log(`Processing pull`, JSON.stringify(requestBody, null, ''));

  const pull = pullRequest.parse(requestBody);
  console.log({pull});

  const {clients, lists, todos} = await transact(async executor => {
    const clients = await getClientsByGroup(executor, pull.clientGroupID);
    const lists = await listLists(executor);

    const todos = [];
    for (const list of lists) {
      todos.push(...(await getTodosByList(executor, list.id)));
    }

    return {clients, lists, todos};
  });
  console.log({clients, lists, todos});

  const patch: PatchOperation[] = [{op: 'clear'}];
  for (const list of lists) {
    patch.push({op: 'put', key: `list/${list.id}`, value: list});
  }
  for (const todo of todos) {
    patch.push({op: 'put', key: `todo/${todo.id}`, value: todo});
  }

  const resp: PullResponseOKV1 = {
    cookie: Date.now(),
    lastMutationIDChanges: Object.fromEntries(
      clients.map(e => [e.id, e.lastmutationid] as const),
    ),
    patch,
  };

  return resp;
}
