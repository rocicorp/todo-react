import {z} from 'zod';
import {Executor, transact} from './pg';
import {getPokeBackend} from './poke';
import {
  createList,
  createTodo,
  deleteList,
  deleteTodo,
  getLastMutationID,
  setLastMutationID,
  updateTodo,
} from './data';
import type {ReadonlyJSONValue} from 'replicache';
import {listSchema, todoSchema} from 'shared';
import {entitySchema} from '@rocicorp/rails';

const mutationSchema = z.object({
  id: z.number(),
  clientID: z.string(),
  name: z.string(),
  args: z.any(),
});

type Mutation = z.infer<typeof mutationSchema>;

const pushRequestSchema = z.object({
  clientGroupID: z.string(),
  mutations: z.array(mutationSchema),
});

export async function push(requestBody: ReadonlyJSONValue) {
  console.log('Processing push', JSON.stringify(requestBody, null, ''));

  const push = pushRequestSchema.parse(requestBody);

  const t0 = Date.now();

  for (const mutation of push.mutations) {
    const error = await processMutation(push.clientGroupID, mutation, null);
    if (error !== null) {
      await processMutation(push.clientGroupID, mutation, error);
    }
  }

  const pokeBackend = getPokeBackend();
  pokeBackend.poke('all');

  console.log('Processed all mutations in', Date.now() - t0);
}

async function processMutation(
  clientGroupID: string,
  mutation: Mutation,
  error: string | null,
) {
  return await transact(async executor => {
    console.log(
      error === null ? 'Processing mutation' : 'Processing mutation error',
      JSON.stringify(mutation, null, ''),
    );

    const lastMutationID =
      (await getLastMutationID(executor, mutation.clientID)) ?? 0;
    console.log('lastMutationID:', lastMutationID);

    const expectedMutationID = lastMutationID + 1;

    if (mutation.id < expectedMutationID) {
      console.log(
        `Mutation ${mutation.id} has already been processed - skipping`,
      );
      return null;
    }
    if (mutation.id > expectedMutationID) {
      throw new Error(`Mutation ${mutation.id} is from the future - aborting`);
    }

    const t1 = Date.now();

    if (error === null) {
      try {
        await mutate(executor, mutation);
      } catch (e) {
        console.error(
          `Error executing mutation: ${JSON.stringify(mutation)}: ${e}`,
        );
        return String(e);
      }
    }

    await setLastMutationID(
      executor,
      mutation.clientID,
      clientGroupID,
      mutation.id,
    );
    console.log('Processed mutation in', Date.now() - t1);
    return null;
  });
}

async function mutate(executor: Executor, mutation: Mutation) {
  switch (mutation.name) {
    case 'createList':
      return await createList(executor, listSchema.parse(mutation.args));
    case 'deleteList':
      return await deleteList(executor, z.string().parse(mutation.args));
    case 'createTodo':
      return await createTodo(
        executor,
        todoSchema.omit({sort: true}).parse(mutation.args),
      );
    case 'updateTodo':
      return await updateTodo(
        executor,
        todoSchema.partial().merge(entitySchema).parse(mutation.args),
      );
    case 'deleteTodo':
      return await deleteTodo(executor, z.string().parse(mutation.args));
  }
}
