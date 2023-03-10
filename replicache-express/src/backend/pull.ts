import { transact } from "./pg.js";
import { getPatch, getLastMutationID, ClientViewRecord } from "./data.js";
import { z } from "zod";
import type { PullResponse } from "replicache";
import type Express from "express";
import { nanoid } from "nanoid";

const pullRequest = z.object({
  clientID: z.string(),
  cookie: z.union([z.string(), z.null()]),
});

const cvrCache = new Map<string, ClientViewRecord>();

export async function pull(
  spaceID: string,
  requestBody: Express.Request
): Promise<PullResponse> {
  console.log(`Processing pull`, JSON.stringify(requestBody, null, ""));

  const pull = pullRequest.parse(requestBody);
  const requestCookie = pull.cookie;

  console.log("spaceID", spaceID);
  console.log("clientID", pull.clientID);

  const t0 = Date.now();

  const prevCVR = requestCookie ? cvrCache.get(requestCookie) : undefined;

  const [{ patch, cvr: nextCVR }, lastMutationID] = await transact(
    async (executor) => {
      return Promise.all([
        getPatch(executor, { spaceID, whereComplete: false }, prevCVR, nanoid),
        getLastMutationID(executor, pull.clientID),
      ]);
    }
  );

  console.log("lastMutationID: ", lastMutationID);
  console.log("nextCVR.id: ", nextCVR.id);
  console.log("Read all objects in", Date.now() - t0);

  if (prevCVR) {
    cvrCache.delete(prevCVR.id);
  }

  cvrCache.set(nextCVR.id, nextCVR);

  const resp: PullResponse = {
    lastMutationID: lastMutationID ?? 0,
    cookie: nextCVR.id,
    patch,
  };

  console.log(`Returning`, JSON.stringify(resp, null, ""));
  return resp;
}
