'use client';

import { dayName, formatDate } from '@/lib/dates';
import { shiftLabel } from '@/lib/labels';
import { useT } from '@/lib/i18n';
import { colorClass } from '@/lib/cellColors';

export interface AssignmentView {
  date: string;
  shift: string;
  stationId: number;
  technicianId: number | null;
  experimenter?: string | null;
  note?: string | null;
  color?: string | null;
}

export interface StationView {
  id: number;
  name: string;
  position: number;
}

export default function ScheduleTable({
  dates,
  assignments,
  technicians,
  stations,
  highlightTechId,
}: {
  dates: string[];
  assignments: AssignmentView[];
  technicians: Array<{ id: number; name: string }>;
  stations: StationView[];
  highlightTechId?: number;
}) {
  const { t, lang } = useT();
  const nameOf = (id: number) => technicians.find(t => t.id === id)?.name ?? '?';
  const cell = (date: string, shift: string, stationId: number) =>
    assignments.find(a => a.date === date && a.shift === shift && a.stationId === stationId);

  return (
    <div className="overflow-x-auto">
      <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
        <thead>
          <tr>
            <th className="border p-2 bg-gray-100">{t('shiftStationHeader')}</th>
            {dates.map(d => (
              <th key={d} className="border p-2 bg-gray-100">
                {dayName(d, lang)}
                <div className="text-xs text-gray-400 font-normal">{formatDate(d)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(['morning', 'evening'] as const).map(shift =>
            stations.map(station => (
              <tr key={`${shift}-${station.id}`}>
                <td className="border p-2 bg-gray-50 whitespace-nowrap">
                  {shiftLabel(lang, shift)} · {station.name}
                </td>
                {dates.map(date => {
                  const a = cell(date, shift, station.id);
                  const mine = a && a.technicianId !== null && a.technicianId === highlightTechId;
                  const hasContent = a && (a.technicianId !== null || a.experimenter || a.note);
                  const cellColorClass = colorClass(a?.color);
                  const empty = !hasContent && !cellColorClass;
                  const bgClass = cellColorClass || (empty ? 'bg-red-50' : mine ? 'bg-blue-100' : '');
                  return (
                    <td
                      key={date}
                      className={`border p-2 text-center ${bgClass} ${mine ? 'font-bold' : ''}`}
                    >
                      {hasContent && a && (
                        <>
                          {a.technicianId !== null && <div>{nameOf(a.technicianId)}</div>}
                          {a.experimenter && (
                            <div className="text-xs text-gray-500 font-normal">
                              {t('experimenterLabel')}: {a.experimenter}
                            </div>
                          )}
                          {a.note && (
                            <div className="text-xs text-gray-500 font-normal">
                              {t('noteLabel')}: {a.note}
                            </div>
                          )}
                        </>
                      )}
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
