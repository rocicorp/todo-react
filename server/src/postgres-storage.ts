import type {JSONValue} from 'replicache';
import type {Storage} from 'replicache-transaction';
import {putEntry, getEntry, delEntry, listEntries} from './data.js';
import type {Executor} from './pg.js';

// Implements the Storage interface required by replicache-transaction in terms
// of our Postgres database.
export class PostgresStorage implements Storage {
  private _spaceID: string;
  private _executor: Executor;

  constructor(spaceID: string, executor: Executor) {
    this._spaceID = spaceID;
    this._executor = executor;
  }

  putEntry(key: string, value: JSONValue): Promise<void> {
    return putEntry(this._executor, this._spaceID, key, value);
  }

  async hasEntry(key: string): Promise<boolean> {
    const v = await this.getEntry(key);
    return v !== undefined;
  }

  async getEntry(key: string): Promise<JSONValue | undefined> {
    const entry = await getEntry(this._executor, this._spaceID, key);
    return entry?.value;
  }

  async *getEntries(
    fromKey: string,
  ): AsyncIterable<readonly [string, JSONValue]> {
    for (const row of await listEntries(
      this._executor,
      this._spaceID,
      fromKey,
      undefined,
    )) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      yield [row.key, row.value!];
    }
  }

  delEntry(key: string): Promise<void> {
    return delEntry(this._executor, this._spaceID, key);
  }
}
