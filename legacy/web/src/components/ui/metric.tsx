import { Card } from './card';

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  );
}
