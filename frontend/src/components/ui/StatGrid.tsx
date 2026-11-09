export type StatCardData = {
  label: string;
  value: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  change?: string;
  changeMuted?: boolean;
};

function StatCard({ label, value, icon, iconBg, iconColor, change, changeMuted }: StatCardData) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-ico" style={{ background: iconBg, color: iconColor }}>
          {icon}
        </span>
      </div>
      <strong>{value}</strong>
      <span className={`change ${changeMuted ? 'mute' : ''}`}>{change ?? '↗ vs last month'}</span>
    </div>
  );
}

export function StatGrid({ stats }: { stats: StatCardData[] }) {
  return (
    <div className="statgrid">
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  );
}
