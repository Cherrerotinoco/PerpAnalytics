import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CgSun, CgMoon } from 'react-icons/cg';
import { useTheme } from '../../context/ThemeContext';
import Logo from '../../components/Logo';

const Header = () => {
  const { theme, toggleTheme } = useTheme();
  const headerRef = useRef<HTMLElement>(null);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY;
      const header = headerRef.current;
      if (!header) return;
      if (currentY > lastScrollY.current && currentY > 60) {
        header.classList.add('tc-header--hidden');
      } else if (currentY === 0) {
        header.classList.remove('tc-header--hidden');
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header ref={headerRef} className="tc-header">
      <Link to="/" className="text-decoration-none">
        <Logo />
      </Link>

      <div className="tc-header-right">
        <Link to="/calculator" className="tc-header-nav-link">
          Calculator
        </Link>
        <Link to="/dashboard" className="tc-header-app-link">
          Open app →
        </Link>
        <button
          type="button"
          className="tc-theme-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <CgSun aria-hidden="true" /> : <CgMoon aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
};

export default Header;
