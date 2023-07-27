import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './app';
import {mutators} from 'shared';
import {Replicache} from 'replicache';

async function init() {
  const {pathname} = window.location;

  let listID: string | undefined;

  // URL layout is "/list/<listid>"
  if (pathname !== '/') {
    const paths = pathname.split('/');
    let listDir: string;
    [, listDir, listID] = paths;
    if (listDir !== 'list' || listID === undefined) {
      window.location.href = '/';
      return;
    }
  }

  // See https://doc.replicache.dev/licensing for how to get a license key.
  const licenseKey = import.meta.env.VITE_REPLICACHE_LICENSE_KEY;
  if (!licenseKey) {
    throw new Error('Missing VITE_REPLICACHE_LICENSE_KEY');
  }

  const userID = localStorage.userID ?? (localStorage.userID = Math.random());

  const r = new Replicache({
    licenseKey,
    //pushURL: `/api/replicache/push?spaceID=${listID}&userID=${userID}`,
    //pullURL: `/api/replicache/pull?spaceID=${listID}&userID=${userID}`,
    name: userID,
    mutators,
  });

  // Implements a Replicache poke using Server-Sent Events.
  // If a "poke" message is received, it will pull from the server.
  const ev = new EventSource(`/api/replicache/poke?spaceID=${listID}`, {
    withCredentials: true,
  });
  ev.onmessage = async event => {
    if (event.data === 'poke') {
      await r.pull();
    }
  };

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App rep={r} userID={userID} listID={listID} />
    </React.StrictMode>,
  );
}
await init();
