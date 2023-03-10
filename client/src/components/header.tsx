import TodoTextInput from './todo-text-input';
import type {Extent} from 'shared/src/extent';

const Header = ({
  extent,
  onUpdateExtent,
  onNewItem,
}: {
  extent: Extent | undefined;
  onUpdateExtent: (extent: Partial<Extent>) => void;
  onNewItem: (text: string) => void;
}) => (
  <header className="header">
    <h1>todos</h1>
    <div style={{position: 'absolute', top: '-30px'}}>
      <input
        type="checkbox"
        checked={extent?.includeComplete ?? false}
        id="include-complete"
        onChange={() =>
          onUpdateExtent({
            includeComplete: !extent?.includeComplete,
          })
        }
        style={{marginRight: '0.5em'}}
      />
      <label htmlFor="include-complete">Include completed</label>
    </div>
    <TodoTextInput
      initial=""
      placeholder="What needs to be done?"
      onSubmit={onNewItem}
    />
  </header>
);

export default Header;
