import TodoTextInput from './todo-text-input';

const Header = ({
  listName,
  onNewItem,
  onNewList,
}: {
  listName: string | undefined;
  onNewItem: (text: string) => void;
  onNewList: (text: string) => void;
}) => {
  const handleNewList = () => {
    const name = prompt('Enter a new list name');
    if (name) {
      onNewList(name);
    }
  };

  return (
    <header className="header">
      <h1>{listName ?? 'todos'}</h1>
      <div id="toolbar">
        <div id="login">
          <label>User ID:</label>
          <input type="text" />
        </div>
        <div id="buttons">
          <input
            type="button"
            onClick={() => handleNewList()}
            value="New List"
          />
          <input type="button" value="Delete List" disabled={!listName} />
        </div>
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
