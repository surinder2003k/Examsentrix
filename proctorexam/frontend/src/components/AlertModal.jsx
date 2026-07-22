'use client';
import React, { useState, useCallback, useEffect } from 'react';

let globalShowAlert = null;
let globalShowConfirm = null;

export function showAlert(options) {
  if (globalShowAlert) globalShowAlert(options);
}

export function showConfirm(options) {
  return new Promise((resolve) => {
    if (globalShowConfirm) globalShowConfirm({ ...options, resolve });
  });
}

const TOAST_TIMEOUT = 4000;

export default function AlertModal() {
  const [alertState, setAlertState] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((options) => {
    const id = Date.now() + Math.random();
    const toast = { id, ...options };
    setToasts(prev => [...prev, toast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, TOAST_TIMEOUT);
  }, []);

  useEffect(() => {
    globalShowAlert = (options) => {
      addToast(options);
    };
    globalShowConfirm = (options) => setConfirmState(options);
    return () => { globalShowAlert = null; globalShowConfirm = null; };
  }, [addToast]);

  const handleAlertClose = () => setAlertState(null);

  const handleConfirm = (result) => {
    if (confirmState?.resolve) confirmState.resolve(result);
    setConfirmState(null);
  };

  if (!confirmState && toasts.length === 0) return null;

  return (
    <>
      {toasts.map(t => (
        <div
          key={t.id}
          className="fixed top-4 right-4 z-[9999] w-80 max-w-[90vw] rounded-xl shadow-2xl border-l-4 px-4 py-3 bg-white animate-in slide-in-from-right"
          style={{ borderLeftColor: t.severity === 'error' ? '#ef4444' : t.severity === 'success' ? '#22c55e' : t.severity === 'warning' ? '#f59e0b' : '#3b82f6' }}
        >
          <div className="flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">
              {t.severity === 'error' ? '❌' : t.severity === 'success' ? '✅' : t.severity === 'warning' ? '⚠️' : 'ℹ️'}
            </span>
            <div className="flex-1">
              {t.title && <p className="font-bold text-sm text-slate-800">{t.title}</p>}
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{t.message}</p>
            </div>
          </div>
        </div>
      ))}

      {confirmState && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95">
            <div className={`px-6 pt-6 pb-4 ${
              confirmState.severity === 'danger' ? 'bg-red-50' :
              confirmState.severity === 'warning' ? 'bg-amber-50' : 'bg-blue-50'
            }`}>
              <div className="flex items-center gap-3 mb-2">
                <span className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                  confirmState.severity === 'danger' ? 'bg-red-100 text-red-600' :
                  confirmState.severity === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  {confirmState.severity === 'danger' ? '⚠' : '?'}
                </span>
                <h3 className="font-bold text-gray-900">{confirmState.title || 'Confirm'}</h3>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 leading-relaxed">{confirmState.message}</p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => handleConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 hover:bg-gray-50 font-semibold text-sm transition"
              >
                {confirmState.cancelText || 'Cancel'}
              </button>
              <button
                onClick={() => handleConfirm(true)}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition ${
                  confirmState.severity === 'danger'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {confirmState.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

