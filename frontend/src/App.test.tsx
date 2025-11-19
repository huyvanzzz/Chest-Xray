import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders app', () => {
  render(<App />);
  // Basic test that app renders without crashing
  expect(document.body).toBeTruthy();
});
