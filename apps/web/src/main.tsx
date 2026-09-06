import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './app/providers';
import { router } from './app/router';
import { RouterProvider } from '@tanstack/react-router';
import './styles.css';
import './styles/tokens.css';
import './styles/workspace.css';
import './styles/editor.css';
import './styles/auth.css';
import './styles/responsive.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
