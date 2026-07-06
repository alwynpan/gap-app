function IconBtn({ onClick, label, className, children }) {
  return (
    <div className="relative group/tip">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`p-1.5 rounded transition-colors ${className}`}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs bg-gray-800 text-white rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-20">
        {label}
      </span>
    </div>
  );
}

export default IconBtn;
