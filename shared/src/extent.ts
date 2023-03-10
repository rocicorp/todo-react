import type {ReadTransaction} from 'replicache';

export type Extent = {
  includeComplete?: boolean;
};

export async function getExtent(tx: ReadTransaction): Promise<Extent> {
  const v = await tx.get('extent');
  return (v ?? {}) as Extent;
}
