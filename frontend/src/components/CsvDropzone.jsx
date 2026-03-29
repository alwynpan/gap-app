import { useRef } from 'react';
import { Upload } from 'lucide-react';

/**
 * Shared drag-and-drop / click-to-browse CSV upload zone.
 *
 * Props:
 *   onFile(file: File) — called whenever a file is selected or dropped.
 *   className          — extra classes applied to the outer wrapper div.
 */
export default function CsvDropzone({ onFile, className = '' }) {
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after an error
    e.target.value = '';
    if (file) {
      onFile(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      onFile(file);
    }
  };

  return (
    <div className={className}>
      <input
        type="file"
        accept=".csv"
        ref={fileInputRef}
        onChange={handleChange}
        className="hidden"
        aria-label="Upload CSV file"
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
      >
        <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">Click to browse or drag &amp; drop a CSV file</p>
        <p className="text-xs text-gray-400 mt-1">Only .csv files are accepted</p>
      </div>
    </div>
  );
}
