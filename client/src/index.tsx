import React, {useCallback, useEffect, useState} from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './app';
import {mutators} from './mutators';
import {Replicache} from 'replicache';
import {useDebouncedCallback} from 'use-debounce';
import {nanoid} from 'nanoid';

async function init() {
  // See https://doc.replicache.dev/licensing for how to get a license key.
  const licenseKey = import.meta.env.VITE_REPLICACHE_LICENSE_KEY;
  if (!licenseKey) {
    throw new Error('Missing VITE_REPLICACHE_LICENSE_KEY');
  }

  const r = new Replicache({
    name: 'anon',
    licenseKey,
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

  function Root() {
    const [userID, setUserID] = useState('');
    const storageListener = useCallback(() => {
      let userID = localStorage.getItem('userID');
      if (!userID) {
        userID = nanoid(6);
        localStorage.setItem('userID', userID);
      }
      setUserID(userID);
    }, []);
    useEffect(() => {
      storageListener();
      addEventListener('storage', storageListener, false);
      return () => {
        removeEventListener('storage', storageListener, false);
      };
    }, []);

    const updateReplicache = useDebouncedCallback(() => {
      console.log('updating replicache');
      r.pull();
    }, 200);
    useEffect(() => {
      r.pushURL = `/api/replicache/push?userID=${userID}`;
      r.pullURL = `/api/replicache/pull?userID=${userID}`;
      updateReplicache();
    }, [userID]);

    const handleUserIDChange = (userID: string) => {
      localStorage.setItem('userID', userID);
      storageListener();
    };

    return (
      <App
        rep={r}
        userID={userID}
        onUserIDChange={userID => handleUserIDChange(userID)}
      />
    );
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
}

await init();
