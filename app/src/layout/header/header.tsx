import { Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import Logo from '../../components/Logo';

function SunIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function Header() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header
      style={{
        backgroundColor: 'var(--tc-surface)',
        borderBottom: '1px solid var(--tc-border)',
        padding: '0.55rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <Link to="/" style={{ textDecoration: 'none' }}>
        <Logo />
      </Link>

      <button
        type="button"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          background: 'transparent',
          border: '1px solid var(--tc-border)',
          borderRadius: 6,
          color: 'var(--tc-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--tc-accent)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--tc-accent)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--tc-border)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--tc-muted)';
        }}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>
    </header>
  );
}
