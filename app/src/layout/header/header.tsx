import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="bg-primary text-white py-3 mb-4 shadow-sm">
      <div className="container d-flex align-items-center justify-content-between">
        <Link to="/" className="navbar-brand fw-bold fs-4 text-white">
          TradesConverter
        </Link>
        {/* Aquí puedes agregar botones de usuario, tema, etc. */}
      </div>
    </header>
  );
}
