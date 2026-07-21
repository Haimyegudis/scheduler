import { dayName, formatDate } from '@/lib/dates';
import { SHIFT_LABELS } from '@/lib/labels';

export interface AssignmentView {
  date: string;
  shift: string;
  station: number;
  technicianId: number;
}

export default function ScheduleTable({
  dates,
  assignments,
  technicians,
  highlightTechId,
}: {
  dates: string[];
  assignments: AssignmentView[];
  technicians: Array<{ id: number; name: string }>;
  highlightTechId?: number;
}) {
  const nameOf = (id: number) => technicians.find(t => t.id === id)?.name ?? '?';
  const cell = (date: string, shift: string, station: number) =>
    assignments.find(a => a.date === date && a.shift === shift && a.station === station);

  return (
    <div className="overflow-x-auto">
      <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
        <thead>
          <tr>
            <th className="border p-2 bg-gray-100">משמרת / עמדה</th>
            {dates.map(d => (
              <th key={d} className="border p-2 bg-gray-100">
                {dayName(d)}
                <div className="text-xs text-gray-400 font-normal">{formatDate(d)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(['morning', 'evening'] as const).map(shift =>
            [1, 2, 3, 4].map(station => (
              <tr key={`${shift}-${station}`}>
                <td className="border p-2 bg-gray-50 whitespace-nowrap">
                  {SHIFT_LABELS[shift]} · עמדה {station}
                </td>
                {dates.map(date => {
                  const a = cell(date, shift, station);
                  const mine = a && a.technicianId === highlightTechId;
                  return (
                    <td
                      key={date}
                      className={`border p-2 text-center ${
                        !a ? 'bg-red-50 text-red-400' : mine ? 'bg-blue-100 font-bold' : ''
                      }`}
                    >
                      {a ? nameOf(a.technicianId) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
