import TodoTextInput from './todo-text-input';
import type {Extent} from 'shared/src/extent';

const Header = ({
  onNewItem,
}: {
  extent: Extent | undefined;
  onUpdateExtent: (extent: Partial<Extent>) => void;
  onNewItem: (text: string) => void;
}) => (
  <header className="header">
    <h1>Groceries</h1>
    <div id="toolbar">
      <div id="login">
        <label>User ID:</label>
        <input type="text" value="dffdfasdfjiwf" />
      </div>
      <div id="buttons">
        <input type="button" value="New List" />
        <input type="button" value="Delete List" />
      </div>
    </div>
    <TodoTextInput
      initial=""
      placeholder="What needs to be done?"
      onSubmit={onNewItem}
    />
  </header>
);

export default Header;
