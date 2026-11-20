import { avatarColor, avatarInitial } from '../utils/fomoSuggest';
import type { RecentFomoUser } from '../utils/recentFomoUsers';

/**
 * Recently searched FOMO users, as its own row under the recent wallets.
 *
 * Shares the generated avatar with the autocomplete dropdown so the same person
 * is recognisable by colour in both places.
 */

type Props = {
  users: RecentFomoUser[];
  onSelect: (user: RecentFomoUser) => void;
};

const RecentFomoUsers = ({ users, onSelect }: Props) => {
  if (!users.length) {
    return null;
  }

  return (
    <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
      <span className="tc-label">FOMO users</span>
      {users.map((user) => (
        <button
          key={user.handle.toLowerCase()}
          type="button"
          className="tc-recent-btn tc-recent-user"
          onClick={() => onSelect(user)}
          title={`@${user.handle}`}
        >
          <span
            className="tc-recent-user-avatar"
            style={{ backgroundColor: avatarColor(user.handle) }}
            aria-hidden="true"
          >
            {avatarInitial(user.handle)}
          </span>
          @{user.handle}
        </button>
      ))}
    </div>
  );
};

export default RecentFomoUsers;
