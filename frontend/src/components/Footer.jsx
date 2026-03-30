import { Github, AlertCircle } from 'lucide-react';

/* global __APP_VERSION__, __GIT_HASH__ */
const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
const gitHash = typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'dev';

function Footer() {
  return (
    <footer className="w-full border-t border-gray-200 bg-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between text-xs text-gray-400">
        <span>
          v{version} &middot; {gitHash}
        </span>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/alwynpan/gap-app/issues/new?template=bug_report.yml"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 hover:text-gray-600 transition-colors"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Report Issue</span>
          </a>
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
      </div>
    </footer>
  );
}

export default Footer;
