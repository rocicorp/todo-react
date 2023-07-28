import {z} from 'zod';
import type {PullResponse, PullResponseOKV1} from 'replicache';
import type Express from 'express';
import {transact} from './pg';
import {getClientsByGroup} from './data';

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

  const lmids = await transact(executor => {
    return getClientsByGroup(executor, pull.clientGroupID);
  });
  console.log({lmids});

  const resp: PullResponseOKV1 = {
    cookie: Date.now(),
    lastMutationIDChanges: Object.fromEntries(
      lmids.map(e => [e.id, e.lastmutationid] as const),
    ),
    patch: [],
  };

  return resp;
}
