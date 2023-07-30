import {z} from 'zod';
import {entitySchema, generate} from '@rocicorp/rails';

export const accessSchema = entitySchema.extend({
  listID: z.string(),
  userID: z.string(),
});

export type Access = z.infer<typeof accessSchema>;

export const {
  init: createAccess,
  list: listAccesses,
  delete: deleteAccess,
} = generate('access', accessSchema);
