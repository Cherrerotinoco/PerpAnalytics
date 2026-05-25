export default function Footer() {
  return (
    <footer>
      <div>
        <div>
          <div>
            <span>TradesConverter</span>
            <p>
              Proyecto de ejemplo con integración de Tailwind CSS y layout moderno. Puedes
              personalizar este footer según tus necesidades.
            </p>
            <div>
              <a href="#">Twitter</a>
              <a href="#">GitHub</a>
            </div>
            <p>&copy; {new Date().getFullYear()} TradesConverter. Todos los derechos reservados.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
