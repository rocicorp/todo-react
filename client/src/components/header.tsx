import TodoTextInput from './todo-text-input';

const Header = ({
  listName,
  onNewItem,
  onNewList,
  onDeleteList,
}: {
  listName: string | undefined;
  onNewItem: (text: string) => void;
  onNewList: (text: string) => void;
  onDeleteList: () => void;
}) => {
  const handleNewList = () => {
    const name = prompt('Enter a new list name');
    if (name) {
      onNewList(name);
    }
  };

  const handleDeleteList = () => {
    if (!confirm('Really delete current list?')) {
      return;
    }
    onDeleteList();
  };

  return (
    <header className="header">
      <h1>{listName ?? 'todos'}</h1>
      <div id="toolbar">
        <input type="button" onClick={() => handleNewList()} value="New List" />
        <input
          type="button"
          value="Delete List"
          disabled={!listName}
          onClick={() => handleDeleteList()}
        />
      </div>
      {listName && (
        <TodoTextInput
          initial=""
          placeholder="What needs to be done?"
          onSubmit={onNewItem}
        />
      )}
    </header>
  );
};

export default Header;
