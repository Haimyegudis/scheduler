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
    <div className="surface-card scroll-thin overflow-x-auto">
      <table className="table-shell">
        <thead>
          <tr>
            <th className="th-cell sticky start-0 z-20 text-start">{t('shiftStationHeader')}</th>
            {dates.map(d => (
              <th key={d} className="th-cell text-center">
                {dayName(d, lang)}
                <div className="text-[11px] font-normal tracking-normal text-slate-400 normal-case">{formatDate(d)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(['morning', 'evening'] as const).map(shift =>
            stations.map(station => (
              <tr key={`${shift}-${station.id}`} className="odd:bg-white even:bg-slate-50/40">
                <td className="td-cell sticky start-0 z-10 bg-slate-50 font-semibold whitespace-nowrap text-slate-700">
                  {shiftLabel(lang, shift)} · {station.name}
                </td>
                {dates.map(date => {
                  const a = cell(date, shift, station.id);
                  const mine = a && a.technicianId !== null && a.technicianId === highlightTechId;
                  const hasContent = a && (a.technicianId !== null || a.experimenter || a.note);
                  const cellColorClass = colorClass(a?.color);
                  const empty = !hasContent && !cellColorClass;
                  const bgClass = cellColorClass || (empty ? 'bg-rose-50/60' : mine ? 'bg-brand-50' : '');
                  return (
                    <td
                      key={date}
                      className={`td-cell text-center ${bgClass} ${mine ? 'font-bold text-brand-800 ring-1 ring-inset ring-brand-200' : ''}`}
                    >
                      {hasContent && a && (
                        <>
                          {a.technicianId !== null && <div>{nameOf(a.technicianId)}</div>}
                          {a.experimenter && (
                            <div className="text-xs font-normal text-slate-500">
                              {t('experimenterLabel')}: {a.experimenter}
                            </div>
                          )}
                          {a.note && (
                            <div className="text-xs font-normal text-slate-500">
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
