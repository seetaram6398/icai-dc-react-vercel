import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FileComplaint from './FileComplaint';

export default function InformantRegister() {
  const { user, initialized } = useAuth();
  if (!initialized) return null;
  if (Number(user?.UserType) !== 15) return <Navigate to="/informant-register" replace />;
  return <FileComplaint informationMode />;
}
