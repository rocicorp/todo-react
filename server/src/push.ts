import {z} from 'zod';
import {transact} from './pg';
import {getPokeBackend} from './poke';
import {getLastMutationID, setLastMutationID} from './data';
import type {ReadonlyJSONValue} from 'replicache';

const mutationSchema = z.object({
  id: z.number(),
  clientID: z.string(),
  name: z.string(),
  args: z.any(),
});

const pushRequestSchema = z.object({
  clientGroupID: z.string(),
  mutations: z.array(mutationSchema),
});

export async function push(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requestBody: ReadonlyJSONValue,
) {
  console.log('Processing push', JSON.stringify(requestBody, null, ''));

  const push = pushRequestSchema.parse(requestBody);

  const t0 = Date.now();
  await transact(async executor => {
    const lastMutationIDs = new Map<string, number>();

    for (let i = 0; i < push.mutations.length; i++) {
      const mutation = push.mutations[i];

      const lastMutationID =
        lastMutationIDs.get(mutation.clientID) ??
        (await getLastMutationID(executor, mutation.clientID)) ??
        0;
      console.log('lastMutationID:', lastMutationID);

      const expectedMutationID = lastMutationID + 1;

      if (mutation.id < expectedMutationID) {
        console.log(
          `Mutation ${mutation.id} has already been processed - skipping`,
        );
        continue;
      }
      if (mutation.id > expectedMutationID) {
        throw new Error(
          `Mutation ${mutation.id} is from the future - aborting`,
        );
      }

      console.log('Processing mutation:', JSON.stringify(mutation, null, ''));

      const t1 = Date.now();

      try {
        // todo: mutator
      } catch (e) {
        console.error(
          `Error executing mutation: ${JSON.stringify(mutation)}: ${e}`,
        );
      }

      lastMutationIDs.set(mutation.clientID, expectedMutationID);
      console.log('Processed mutation in', Date.now() - t1);
    }

    console.log('saving mutation changes', lastMutationIDs);

    await Promise.all(
      [...lastMutationIDs.entries()].map(([clientID, lastMutationID]) =>
        setLastMutationID(
          executor,
          clientID,
          push.clientGroupID,
          lastMutationID,
        ),
      ),
    );

    const pokeBackend = getPokeBackend();
    await pokeBackend.poke('all');
  });

  console.log('Processed all mutations in', Date.now() - t0);
}
