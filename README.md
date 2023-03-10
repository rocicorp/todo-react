![Replicache logo](https://uploads-ssl.webflow.com/623a2f46e064937599256c2d/6269e72c61073c3d561a5015_Lockup%20v2.svg)

# todo-row-versioning

This is a demonstration of the [Row Version Strategy](https://replicache.notion.site/The-Row-Version-Strategy-5c5560b0ba3c437fae6eb34318b54712).

It implements the same todo app we use in many of our demos with one difference:

![Screencap of checkbox for including/excluding completed todos from sync](./sceencap.png)

When the app first loads, it syncs only completed todos. When you check the checkbox, it syncs all todos.

This is a simple demonstration of a more general concept: You can actually sync by any arbitrary function of the database. When you change the sync function, the server will correctly send the differences between the old and new results, even if the underlying didn't change.

## 1. Setup

#### Get your Replicache License Key

```bash
$ npx replicache get-license
```

#### Set your `VITE_REPLICACHE_LICENSE_KEY` environment variable

```bash
$ export VITE_REPLICACHE_LICENSE_KEY="<your license key>"
```

#### Install and Build

```bash
$ npm install; npm run build;
```

## 2. Start frontend and backend watcher

```bash
$ npm run watch --ws
```

Provides an example integrating replicache with react in a simple todo application.

## Deploying to Render

A render blueprint example is provided to deploy the application.

Open the `render.yaml` file and add your license key

```
- key: VITE_REPLICACHE_LICENSE_KEY
    value: <license_key>
```

Commit the changes and follow the direction on [Deploying to Render](https://doc.replicache.dev/deploy-render)
/client
/shared
/server
package.json

## How it Works

The basic concept is that implementing pull is done via diff in three steps:

1. The server fetches just the keys and versions for all entities matching the current sync _extent_ (the query that controls what is synced).
2. The server diffs these against a record of the same that was kept from the previous pull, to figure out which keys have added, changed, or removed.
3. Finally the server fetches the added or updated items from the database and returns a patch to he client.

Because of this diff approach, the sytem is very robust. The function that determines the current client view can change for any reason at any time, and the sync will keep working.

The sync extent in this demo is stored per-user (across the user's tabs). This is accomplished by storing the extent in a Replicache entry that is also synced. The extent is changed with a mutator, just like any other Replicache data.

## Other Notes

- In this demo, the _Client View Records_ -- the caches of responses previously sent to clients -- are stored in process memory. This works fine for a single-node server like this demo, but for a distributed server (or serverless) you'll need to store these in something like Redis. It's OK if they time out, the worst that will happen is the client will do a full sync.
- Starting in [Replicache 12.2.0](https://blog.replicache.dev/blog/replicache-12-1-0) it is possible to disable persistence and run only in memory. If you don't need persistence, the extent management can be easier: in that case you can just communicate the extent in the [`pullURL`](https://doc.replicache.dev/api/interfaces/ReplicacheOptions#pullurl) as a querystring.
