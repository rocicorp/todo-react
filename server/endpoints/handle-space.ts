import {nanoid} from 'nanoid';
import {createSpace, hasSpace} from '../src/data';
import type Express from 'express';
import {withExecutor} from '../src/pg';

export async function handleCreateSpace(
  req: Express.Request,
  res: Express.Response,
  next: Express.NextFunction,
): Promise<void> {
  let spaceID = nanoid(6);
  if (req.body.spaceID) {
    spaceID = req.body.spaceID;
  }
  if (spaceID.length > 10) {
    next(Error(`SpaceID must be 10 characters or less`));
  }
  try {
    await withExecutor(async executor => {
      return await createSpace(executor, spaceID, true);
    });
    res.status(200).send({spaceID});
  } catch (e: any) {
    next(Error(`Failed to create space ${spaceID}`, e));
  }
}

export async function handleSpaceExist(
  req: Express.Request,
  res: Express.Response,
  next: Express.NextFunction,
): Promise<void> {
  try {
    const exists = await withExecutor(async executor => {
      return await hasSpace(executor, req.body.spaceID);
    });
    res.status(200).send({spaceExists: exists});
  } catch (e: any) {
    next(Error(`Failed to check space exists ${req.body.spaceID}`, e));
  }
}
