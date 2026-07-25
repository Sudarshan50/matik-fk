export default function StatStrip({ items }) {
  return (
    <div className="stat-strip">
      {items.map((item) => (
        <div className="stat-chip" key={item.label}>
          <span className="stat-chip-label">{item.label}</span>
          <span className="stat-chip-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
