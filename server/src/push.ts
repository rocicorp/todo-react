import {z} from 'zod';
import {Executor, transact} from './pg';
import {getPokeBackend} from './poke';
import {
  createList,
  createTodo,
  createShare,
  deleteList,
  deleteTodo,
  deleteShare,
  getClientForUpdate,
  getClientGroupForUpdate,
  putClient,
  putClientGroup,
  updateTodo,
} from './data';
import type {ReadonlyJSONValue} from 'replicache';
import {listSchema, shareSchema, todoSchema} from 'shared';
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

export async function push(userID: string, requestBody: ReadonlyJSONValue) {
  console.log('Processing push', JSON.stringify(requestBody, null, ''));

  const push = pushRequestSchema.parse(requestBody);

  const t0 = Date.now();

  for (const mutation of push.mutations) {
    const error = await processMutation(
      userID,
      push.clientGroupID,
      mutation,
      null,
    );
    if (error !== null) {
      await processMutation(userID, push.clientGroupID, mutation, error);
    }
  }

  const pokeBackend = getPokeBackend();
  pokeBackend.poke('all');

  console.log('Processed all mutations in', Date.now() - t0);
}

async function processMutation(
  userID: string,
  clientGroupID: string,
  mutation: Mutation,
  error: string | null,
) {
  return await transact(async executor => {
    console.log(
      error === null ? 'Processing mutation' : 'Processing mutation error',
      JSON.stringify(mutation, null, ''),
    );

    const [baseClientGroup, baseClient] = await Promise.all([
      await getClientGroupForUpdate(executor, clientGroupID),
      await getClientForUpdate(executor, mutation.clientID),
    ]);

    console.log({baseClientGroup, baseClient});

    const nextClientVersion = baseClientGroup.clientVersion + 1;
    const nextMutationID = baseClient.lastMutationID + 1;

    if (mutation.id < nextMutationID) {
      console.log(
        `Mutation ${mutation.id} has already been processed - skipping`,
      );
      return null;
    }
    if (mutation.id > nextMutationID) {
      throw new Error(`Mutation ${mutation.id} is from the future - aborting`);
    }

    const t1 = Date.now();

    if (error === null) {
      try {
        await mutate(executor, userID, mutation);
      } catch (e) {
        console.error(
          `Error executing mutation: ${JSON.stringify(mutation)}: ${e}`,
        );
        return String(e);
      }
    }

    const nextClientGroup = {
      id: clientGroupID,
      cvrVersion: baseClientGroup.cvrVersion,
      clientVersion: nextClientVersion,
    };

    const nextClient = {
      id: mutation.clientID,
      clientGroupID,
      lastMutationID: nextMutationID,
      clientVersion: nextClientVersion,
    };

    await Promise.all([
      putClientGroup(executor, nextClientGroup),
      putClient(executor, nextClient),
    ]);
    console.log('Processed mutation in', Date.now() - t1);
    return null;
  });
}

async function mutate(executor: Executor, userID: string, mutation: Mutation) {
  switch (mutation.name) {
    case 'createList':
      return await createList(
        executor,
        userID,
        listSchema.parse(mutation.args),
      );
    case 'deleteList':
      return await deleteList(
        executor,
        userID,
        z.string().parse(mutation.args),
      );
    case 'createTodo':
      return await createTodo(
        executor,
        userID,
        todoSchema.omit({sort: true}).parse(mutation.args),
      );
    case 'createShare':
      return await createShare(
        executor,
        userID,
        shareSchema.parse(mutation.args),
      );
    case 'deleteShare':
      return await deleteShare(
        executor,
        userID,
        z.string().parse(mutation.args),
      );
    case 'updateTodo':
      return await updateTodo(
        executor,
        userID,
        todoSchema.partial().merge(entitySchema).parse(mutation.args),
      );
    case 'deleteTodo':
      return await deleteTodo(
        executor,
        userID,
        z.string().parse(mutation.args),
      );
  }
}
