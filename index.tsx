
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Safely ensure process.env exists to prevent white screen crashes in environments 
// where the variable might not be shimmed yet during initial script execution.
if (typeof (window as any).process === 'undefined') {
  (window as any).process = { env: { API_KEY: '' } };
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
