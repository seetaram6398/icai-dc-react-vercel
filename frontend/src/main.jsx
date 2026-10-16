import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { PopupProvider } from './components/Popup.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <PopupProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </PopupProvider>
    </BrowserRouter>
  </React.StrictMode>
);