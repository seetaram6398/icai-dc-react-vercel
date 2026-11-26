import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ComplaintList from './ComplaintList';

export default function InformantRegisterList() {
  const { user, initialized } = useAuth();
  if (!initialized) return null;
  if (![1, 15, 16].includes(Number(user?.UserType))) return <Navigate to="/complaints" replace />;
  return <ComplaintList informationMode />;
}
