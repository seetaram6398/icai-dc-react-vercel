import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const PopupContext = createContext(null);

const ICONS = {
  success: 'bi-check-circle-fill',
  error: 'bi-x-octagon-fill',
  warning: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill',
};

const TITLES = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Information',
};

let uid = 0;

export function PopupProvider({ children }) {
  const [popups, setPopups] = useState([]);
  const timers = useRef({});

  const remove = useCallback((id) => {
    setPopups((prev) => prev.filter((p) => p.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const push = useCallback(
    (type, message, opts) => {
      const o = opts || {};
      const id = ++uid;
      const duration = o.duration != null ? o.duration : (type === 'error' ? 6000 : 4000);
      setPopups((prev) => [...prev.slice(-4), { id, type, message, title: o.title || TITLES[type] }]);
      timers.current[id] = setTimeout(() => remove(id), duration);
      return id;
    },
    [remove]
  );

  const api = {
    success: (msg, opts) => push('success', msg, opts),
    error: (msg, opts) => push('error', msg, opts),
    warning: (msg, opts) => push('warning', msg, opts),
    info: (msg, opts) => push('info', msg, opts),
    show: (opts) => push(opts.type || 'info', opts.message, opts),
    remove,
  };

  return (
    <PopupContext.Provider value={api}>
      {children}
      <div className="popup-container" aria-live="polite">
        {popups.map((p) => (
          <div key={p.id} className={`popup popup-${p.type}`} role={p.type === 'error' ? 'alert' : 'status'}>
            <div className="popup-icon">
              <i className={`bi ${ICONS[p.type] || ICONS.info}`} />
            </div>
            <div className="popup-content">
              <div className="popup-title">{p.title}</div>
              <div className="popup-message">{p.message}</div>
            </div>
            <button type="button" className="popup-close" onClick={() => remove(p.id)} aria-label="Close">
              <i className="bi bi-x-lg" />
            </button>
          </div>
        ))}
      </div>
    </PopupContext.Provider>
  );
}

export function usePopups() {
  const ctx = useContext(PopupContext);
  if (!ctx) throw new Error('usePopups must be used within a PopupProvider');
  return ctx;
}