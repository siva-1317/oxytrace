import React from 'react';
import CountUp from 'react-countup';
import { motion } from 'framer-motion';

export default function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  prefix,
  decimals = 0,
  separator = ',',
  formattingFn,
  colorClass = 'border-accent'
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur ${colorClass}`}
      style={{ borderBottomWidth: 3 }}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted">{label}</div>
        {Icon ? (
          <div className="rounded-xl bg-accent/10 p-2 text-accent ring-1 ring-accent/15">
            <Icon size={16} />
          </div>
        ) : null}
      </div>
      <div className="mt-3 text-2xl font-semibold">
        <CountUp
          end={Number(value || 0)}
          duration={0.9}
          prefix={prefix}
          decimals={decimals}
          separator={separator}
          formattingFn={formattingFn}
        />
        {suffix ? <span className="text-base text-muted">{suffix}</span> : null}
      </div>
    </motion.div>
  );
}
