import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  unit: string;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'red';
}

export const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  unit, 
  icon,
  color = 'blue' 
}) => {
  const colorClasses = {
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    green: 'bg-green-500/10 border-green-500/20 text-green-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
    red: 'bg-red-500/10 border-red-500/20 text-red-400',
  };

  return (
    <div className={`p-4 rounded-xl border backdrop-blur-sm ${colorClasses[color]} transition-all hover:scale-[1.02]`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-white">{value}</span>
            <span className="text-sm opacity-60">{unit}</span>
          </div>
        </div>
        {icon && <div className="p-2 rounded-lg bg-white/5">{icon}</div>}
      </div>
    </div>
  );
};
