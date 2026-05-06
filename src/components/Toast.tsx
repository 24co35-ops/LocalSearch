import React from 'react';
import { motion } from 'framer-motion';

interface ToastProps {
  type: 'success' | 'error' | 'info';
  message: string;
}

export default function Toast({ type, message }: ToastProps) {
  const styles = {
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  };
  const icons = {
    success: 'check_circle',
    error: 'error',
    info: 'info',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className={`fixed top-6 right-6 z-[200] px-5 py-3.5 rounded-xl shadow-2xl border flex items-center gap-3 backdrop-blur-xl ${styles[type]}`}
    >
      <span className="material-symbols-outlined text-lg">{icons[type]}</span>
      <span className="text-sm font-medium">{message}</span>
    </motion.div>
  );
}
