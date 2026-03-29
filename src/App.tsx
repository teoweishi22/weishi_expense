/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AddExpense from './pages/AddExpense';
import Settlements from './pages/Settlements';
import Settings from './pages/Settings';
import SharedSettlement from './pages/SharedSettlement';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="add" element={<AddExpense />} />
          <Route path="settlements" element={<Settlements />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        {/* Public read-only route */}
        <Route path="/shared/settlement/:token" element={<SharedSettlement />} />
      </Routes>
    </BrowserRouter>
  );
}

