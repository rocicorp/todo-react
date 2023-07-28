import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './app';
import {mutators} from './mutators';
import {Replicache} from 'replicache';

async function init() {
  // See https://doc.replicache.dev/licensing for how to get a license key.
  const licenseKey = import.meta.env.VITE_REPLICACHE_LICENSE_KEY;
  if (!licenseKey) {
    throw new Error('Missing VITE_REPLICACHE_LICENSE_KEY');
  }

  const r = new Replicache({
    name: 'anon',
    licenseKey,
    pushURL: `/api/replicache/push`,
    pullURL: `/api/replicache/pull`,
    mutators,
    logLevel: 'debug',
  });

  // Implements a Replicache poke using Server-Sent Events.
  // If a "poke" message is received, it will pull from the server.
  // TODO: listen to only the nav and list we're looking at (or maybe extent).
  const ev = new EventSource(`/api/replicache/poke?channel=all`, {
    withCredentials: true,
  });
  ev.onmessage = async event => {
    if (event.data === 'poke') {
      await r.pull();
    }
  };

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App rep={r} />
    </React.StrictMode>,
  );
}
await init();
