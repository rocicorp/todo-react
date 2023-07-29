import {z} from 'zod';
import type {PatchOperation, PullResponse, PullResponseOKV1} from 'replicache';
import type Express from 'express';
import {transact} from './pg';
import {
  getClientGroupForUpdate,
  getLists,
  getTodos,
  putClientGroup,
  searchClients,
  searchLists,
  searchTodos,
} from './data';
import {ClientViewData} from './cvr';

const pullRequest = z.object({
  clientGroupID: z.string(),
  cookie: z.any(),
});

type ClientViewRecord = {
  list: ClientViewData;
  todo: ClientViewData;
  clientVersion: number;
};

// cvrKey -> ClientViewRecord
const cvrCache = new Map<string, ClientViewRecord>();

export async function pull(
  requestBody: Express.Request,
): Promise<PullResponse> {
  console.log(`Processing pull`, JSON.stringify(requestBody, null, ''));

  const pull = pullRequest.parse(requestBody);

  const {clientGroupID} = pull;
  const prevCVR = cvrCache.get(makeCVRKey(clientGroupID, pull.cookie));
  const baseCVR = prevCVR ?? {
    list: new ClientViewData(),
    todo: new ClientViewData(),
    clientVersion: 0,
  };
  console.log({prevCVR, baseCVR});

  const {nextCVRVersion, nextCVR, clientChanges, lists, todos} = await transact(
    async executor => {
      const [baseClientGroupRecord, clientChanges, listMeta] =
        await Promise.all([
          getClientGroupForUpdate(executor, clientGroupID),
          searchClients(executor, {
            clientGroupID,
            sinceClientVersion: baseCVR.clientVersion,
          }),
          searchLists(executor),
        ]);

      console.log({baseClientGroupRecord, clientChanges, listMeta});

      const todoMeta = await searchTodos(executor, {
        listIDs: listMeta.map(l => l.id),
      });

      console.log({todoMeta});

      const nextCVR: ClientViewRecord = {
        list: ClientViewData.fromSearchResult(listMeta),
        todo: ClientViewData.fromSearchResult(todoMeta),
        clientVersion: baseClientGroupRecord.clientVersion,
      };

      const listPuts = nextCVR.list.getPutsSince(baseCVR.list);
      const todoPuts = nextCVR.todo.getPutsSince(baseCVR.todo);

      const nextClientGroupRecord = {
        ...baseClientGroupRecord,
        cvrVersion: baseClientGroupRecord.cvrVersion + 1,
      };

      console.log({listPuts, todoPuts, nextClientGroupRecord});

      const [lists, todos] = await Promise.all([
        getLists(executor, listPuts),
        getTodos(executor, todoPuts),
        putClientGroup(executor, nextClientGroupRecord),
      ]);

      return {
        nextCVRVersion: nextClientGroupRecord.cvrVersion,
        nextCVR,
        clientChanges,
        lists,
        todos,
      };
    },
  );

  console.log({nextCVRVersion, nextCVR, clientChanges, lists, todos});

  const listDels = nextCVR.list.getDelsSince(baseCVR.list);
  const todoDels = nextCVR.todo.getDelsSince(baseCVR.todo);

  console.log({listDels, todoDels});

  const patch: PatchOperation[] = [];

  if (prevCVR === undefined) {
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

  const respCookie = nextCVRVersion;
  const resp: PullResponseOKV1 = {
    cookie: respCookie,
    lastMutationIDChanges: Object.fromEntries(
      clientChanges.map(e => [e.id, e.lastMutationID] as const),
    ),
    patch,
  };

  cvrCache.set(makeCVRKey(clientGroupID, respCookie), nextCVR);

  return resp;
}

function makeCVRKey(clientGroupID: string, version: number) {
  return `${clientGroupID}/${version}`;
}
