import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ExtensionApp from './ExtensionApp';
import '../index.css';

const rootElement = document.getElementById('extension-root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ExtensionApp />
    </StrictMode>
  );
}
