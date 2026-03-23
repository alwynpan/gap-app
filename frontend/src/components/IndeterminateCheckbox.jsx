import { useRef, useEffect } from 'react';

function IndeterminateCheckbox({ checked, indeterminate, onChange, className, 'aria-label': ariaLabel }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate ?? false;
    }
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
      className={className}
    />
  );
}

export default IndeterminateCheckbox;
