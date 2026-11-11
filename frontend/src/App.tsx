// =============================================
// Barbearia Vikings — App Router
// =============================================

import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { BookingPage } from './pages/BookingPage';
import { LoginPage } from './pages/LoginPage';
import { ManageBookingPage } from './pages/ManageBookingPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { DashboardPage } from './pages/admin/DashboardPage';
import { AgendaPage } from './pages/admin/AgendaPage';
import { ServicesPage } from './pages/admin/ServicesPage';
import { ProductsPage } from './pages/admin/ProductsPage';
import { TeamPage } from './pages/admin/TeamPage';
import { SchedulePage } from './pages/admin/SchedulePage';
import { ClientsPage } from './pages/admin/ClientsPage';

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/agendar" element={<BookingPage />} />
      <Route path="/agendamento" element={<ManageBookingPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Admin routes */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="servicos" element={<ServicesPage />} />
        <Route path="produtos" element={<ProductsPage />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="equipe" element={<TeamPage />} />
        <Route path="horarios" element={<SchedulePage />} />
      </Route>
    </Routes>
  );
}

export default App;
