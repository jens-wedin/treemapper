import { useEffect, useState } from 'react';

interface Stats {
  persons: number;
  families: number;
  sources: number;
  media: number;
  mediaDone: number;
}

export default function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setStats)
      .catch(() => setError(true));
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-bold">Wedin släktträd</h1>
      {error && <p className="mt-2 text-red-700">Kunde inte nå API:et — kör databasen? (npm run import)</p>}
      {!error && !stats && <p className="mt-2 text-gray-600">Läser in …</p>}
      {stats && (
        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              ['Personer', stats.persons],
              ['Familjer', stats.families],
              ['Källor', stats.sources],
              ['Foton', `${stats.mediaDone}/${stats.media}`],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border p-4">
              <dt className="text-sm text-gray-600">{label}</dt>
              <dd className="text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}
