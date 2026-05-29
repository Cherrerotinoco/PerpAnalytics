import Header from './header/Header';
import Footer from './Footer';
import { ReactNode } from 'react';

const MainLayout = ({ children }: { children: ReactNode }) => (
  <div className="tc-app-root d-flex flex-column">
    <Header />
    <main>{children}</main>
    <Footer />
  </div>
);

export default MainLayout;
