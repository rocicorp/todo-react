// This file defines our Todo domain type in TypeScript, and a related helper
// function to get all Todos. You'd typically have one of these files for each
// domain object in your application.

import {z} from 'zod';
import {entitySchema, generate, Update} from '@rocicorp/rails';

export const listSchema = entitySchema.extend({
  name: z.string(),
});

export type List = z.infer<typeof listSchema>;
export type ListUpdate = Update<List>;

export const {init: createList, list: listLists} = generate('list', listSchema);
