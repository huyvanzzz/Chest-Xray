import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { UploadPage } from './pages/UploadPage';
import { ResultsPage } from './pages/ResultsPage';
import { PatientsPage } from './pages/PatientsPage';
import PriorityPage from './pages/PriorityPage';
import './App.css';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/priority" element={<PriorityPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
