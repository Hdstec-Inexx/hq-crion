import { Navigate, createBrowserRouter } from 'react-router-dom';
import { HealthPage } from '../features/health/HealthPage';

export const router = createBrowserRouter([
  { path: '/health', element: <HealthPage /> },
  { path: '/', element: <Navigate replace to="/health" /> }
]);
