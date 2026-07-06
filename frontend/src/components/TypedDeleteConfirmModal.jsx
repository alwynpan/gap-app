import { useState } from 'react';

/**
 * Two-step typed confirmation modal for destructive deletes.
 * Step 1: the user must type the entity name exactly to continue.
 * Step 2: the user must type the word "delete" to confirm permanently.
 */
function TypedDeleteConfirmModal({ entityLabel, entityName, warning = null, deleting = false, onConfirm, onCancel }) {
  const [step, setStep] = useState(1);
  const [input, setInput] = useState('');

  const handleContinue = () => {
    setStep(2);
    setInput('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Delete {entityLabel}</h3>
        {step === 1 ? (
          <>
            {warning && (
              <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 text-sm text-yellow-800">
                {warning}
              </div>
            )}
            <p className="text-sm text-gray-600 mb-3">
              To continue, type <span className="font-semibold text-gray-900">{entityName}</span> below.
            </p>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Confirmation name"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
              placeholder={entityName}
            />
            <div className="flex justify-end space-x-3">
              <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-700 hover:text-gray-900">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContinue}
                disabled={input !== entityName}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-3">
              This action cannot be undone. To permanently delete, type{' '}
              <span className="font-semibold text-gray-900">delete</span> below.
            </p>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Confirmation word"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
              placeholder="delete"
            />
            <div className="flex justify-end space-x-3">
              <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-700 hover:text-gray-900">
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={input !== 'delete' || deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TypedDeleteConfirmModal;
