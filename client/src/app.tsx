import {nanoid} from 'nanoid';
import React from 'react';
import {ReadTransaction, Replicache} from 'replicache';
import {useSubscribe} from 'replicache-react';
import {M, listTodos, TodoUpdate} from 'shared';

import Header from './components/header';
import MainSection from './components/main-section';
import {getList, listLists} from 'shared/src/list';

// This is the top-level component for our app.
const App = ({
  rep,
  listID,
}: {
  rep: Replicache<M>;
  userID: string;
  listID: string | undefined;
}) => {
  const lists = useSubscribe(rep, listLists, [], [rep]);
  lists.sort((a, b) => a.name.localeCompare(b.name));

  const selectedList = useSubscribe(
    rep,
    (tx: ReadTransaction) => getList(tx, listID ?? ''),
    undefined,
    [rep],
  );

  // Subscribe to all todos and sort them.
  const todos = useSubscribe(rep, listTodos, [], [rep]);
  todos.sort((a, b) => a.sort - b.sort);

  // Define event handlers and connect them to Replicache mutators. Each
  // of these mutators runs immediately (optimistically) locally, then runs
  // again on the server-side automatically.
  const handleNewItem = (text: string) => {
    rep.mutate.createTodo({
      id: nanoid(),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      listID: listID!,
      text,
      completed: false,
    });
  };

  const handleUpdateTodo = (update: TodoUpdate) =>
    rep.mutate.updateTodo(update);

  const handleDeleteTodos = async (ids: string[]) => {
    for (const id of ids) {
      await rep.mutate.deleteTodo(id);
    }
  };

  const handleCompleteTodos = async (completed: boolean, ids: string[]) => {
    for (const id of ids) {
      await rep.mutate.updateTodo({
        id,
        completed,
      });
    }
  };

  const handleNewList = async (name: string) => {
    await rep.mutate.createList({
      id: nanoid(),
      name,
    });
  };

  // Render app.

  return (
    <div id="layout">
      <div id="nav">
        {lists.map(list => (
          <a key={list.id} href={`/list/${list.id}`}>
            {list.name}
          </a>
        ))}
      </div>
      <div className="todoapp">
        <Header
          listName={selectedList?.name}
          onNewItem={handleNewItem}
          onNewList={handleNewList}
        />
        {selectedList ? (
          <MainSection
            todos={todos}
            onUpdateTodo={handleUpdateTodo}
            onDeleteTodos={handleDeleteTodos}
            onCompleteTodos={handleCompleteTodos}
          />
        ) : (
          <div id="no-list-selected">No list selected</div>
        )}
      </div>
    </div>
  );
};

export default App;
