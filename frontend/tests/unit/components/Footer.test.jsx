import { render, screen } from '@testing-library/react';
import Footer from '../../../src/components/Footer.jsx';

describe('Footer', () => {
  it('renders a Report Issue link', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: /report issue/i })).toBeInTheDocument();
  });

  it('Report Issue link points to the GitHub issue tracker', () => {
    render(<Footer />);
    const link = screen.getByRole('link', { name: /report issue/i });
    expect(link).toHaveAttribute('href', 'https://github.com/alwynpan/gap-app/issues/new?template=bug_report.yml');
  });

  it('Report Issue link opens in a new tab with noreferrer', () => {
    render(<Footer />);
    const link = screen.getByRole('link', { name: /report issue/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });
});
