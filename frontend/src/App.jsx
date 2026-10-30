import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuth } from './context/AuthContext';
import Layout from './layouts/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import BODDashboard from './pages/BODDashboard';
import ComplaintList from './pages/ComplaintList';
import ComplaintDetail from './pages/ComplaintDetail';
import ComplaintWithdrawalUpdate from './pages/ComplaintWithdrawalUpdate';
import FileComplaint from './pages/FileComplaint';
import MyComplaints from './pages/MyComplaints';
import AgendaList from './pages/AgendaList';
import AgendaGenerate from './pages/AgendaGenerate';
import HearingList from './pages/HearingList';
import HearingForm from './pages/HearingForm';
import ReportsAgeing from './pages/ReportsAgeing';
import ReportsStage from './pages/ReportsStage';
import ReportsComplaintStatus from './pages/ReportsComplaintStatus';
import PaymentDetails from './pages/PaymentDetails';
import ReportsMemberStatus from './pages/ReportsMemberStatus';
import ReportsMemberAgeing from './pages/ReportsMemberAgeing';
import BoardManagement from './pages/BoardManagement';
import MasterDataPage from './pages/MasterDataPage';
import CourtDecision from './pages/CourtDecision';
import StayOnCase from './pages/StayOnCase';

function Protected({ children }) {
  const { token, user, initialized } = useAuth();
  const location = useLocation();
  if (!initialized) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status" />
          <div className="text-muted">Verifying session...</div>
        </div>
      </div>
    );
  }
  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="bod-dashboard" element={<BODDashboard />} />
        <Route path="complaints" element={<ComplaintList />} />
        <Route path="complaints/:id" element={<ComplaintDetail />} />
        <Route path="my-complaints" element={<MyComplaints />} />
        <Route path="withdrawal/update" element={<ComplaintWithdrawalUpdate />} />
        <Route path="file-complaint" element={<FileComplaint />} />
        <Route path="agenda" element={<AgendaList />} />
        <Route path="agenda/generate" element={<AgendaGenerate />} />
        <Route path="hearings" element={<HearingList />} />
        <Route path="hearings/new" element={<HearingForm />} />
        <Route path="reports/ageing" element={<ReportsAgeing />} />
        <Route path="reports/stage" element={<ReportsStage />} />
        <Route path="reports/complaint-status" element={<ReportsComplaintStatus />} />
        <Route path="reports/payment-details" element={<PaymentDetails />} />
        <Route path="reports/member-complaint-status" element={<ReportsMemberStatus />} />
        <Route path="reports/member-ageing" element={<ReportsMemberAgeing />} />
        <Route path="boards" element={<BoardManagement />} />
        <Route path="master-data" element={<MasterDataPage />} />
        <Route path="decision" element={<CourtDecision />} />
        <Route path="stay-on-cases" element={<StayOnCase />} />
        {/* Catch-all stays INSIDE the protected tree so unknown URLs can never
            bypass the auth guard. */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;