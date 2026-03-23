import { Github } from 'lucide-react';

/* eslint-disable no-undef */
const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
const gitHash = typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'dev';
/* eslint-enable no-undef */

function Footer() {
  return (
    <footer className="w-full border-t border-gray-200 bg-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between text-xs text-gray-400">
        <span>
          v{version} &middot; {gitHash}
        </span>
        <a
          href="https://github.com/alwynpan/gap-app"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 hover:text-gray-600 transition-colors"
          aria-label="View on GitHub"
        >
          <Github className="h-4 w-4" />
          <span>GitHub</span>
        </a>
      </div>
    </footer>
  );
}

export default Footer;
