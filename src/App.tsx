/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AddExpense from './pages/AddExpense';
import Settlements from './pages/Settlements';
import Settings from './pages/Settings';
import SharedSettlement from './pages/SharedSettlement';
import Expenses from './pages/Expenses';
import PersonDetail from './pages/PersonDetail';
import Login from './pages/Login';

// Helper component to protect routes
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="add" element={<AddExpense />} />
          <Route path="edit/:id" element={<AddExpense />} />
          <Route path="settlements" element={<Settlements />} />
          <Route path="person/:id" element={<PersonDetail />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Public read-only route */}
        <Route path="/shared/settlement/:token" element={<SharedSettlement />} />
      </Routes>
    </BrowserRouter>
  );
}

