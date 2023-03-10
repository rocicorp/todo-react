import type {ReadTransaction} from 'replicache';

export type Extent = {
  includeComplete?: boolean;
};

export async function getExtent(
  tx: ReadTransaction,
  userID: string,
): Promise<Extent> {
  const v = await tx.get(`extent/${userID}`);
  return (v ?? {}) as Extent;
}
