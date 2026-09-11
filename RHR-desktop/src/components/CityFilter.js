import { getCurrentUser } from '../services/api';

export default function CityFilter({ selectedCity, onChange }) {
  const user = getCurrentUser();
  if (user?.role !== 'super_admin') return null;

  const cities = [
    { label: 'All Cities', value: 'all' },
    { label: 'Karachi', value: '1e5962c6-33a7-460b-913e-9e08db46973a' },
    { label: 'Hyderabad', value: '09a1fda3-7ac0-406a-8f42-75d973dc3b7e' },
    { label: 'Sukkur', value: '00f79d89-0d36-4704-8865-fc7bbd662267' },
  ];

  return (
    <select
      value={selectedCity}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '8px 14px',
        border: '1px solid #1B2E6B',
        borderRadius: '8px',
        color: '#1B2E6B',
        fontWeight: '600',
        fontSize: '13px',
        cursor: 'pointer',
        background: 'white',
        outline: 'none'
      }}
    >
      {cities.map(c => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </select>
  );
}
