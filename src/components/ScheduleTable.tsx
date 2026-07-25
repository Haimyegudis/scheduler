'use client';

import { dayName, formatDate } from '@/lib/dates';
import { shiftLabel } from '@/lib/labels';
import { useT } from '@/lib/i18n';
import { colorClass, pressLabelClass, pressRowClass } from '@/lib/cellColors';

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

export interface TesterRequestView {
  date: string;
  description: string;
  testerName: string;
}

export default function ScheduleTable({
  dates,
  assignments,
  technicians,
  stations,
  highlightTechId,
  testerRequests = [],
}: {
  dates: string[];
  assignments: AssignmentView[];
  technicians: Array<{ id: number; name: string }>;
  stations: StationView[];
  highlightTechId?: number;
  testerRequests?: TesterRequestView[];
}) {
  const { t, lang } = useT();
  const nameOf = (id: number) => technicians.find(t => t.id === id)?.name ?? '?';
  const cell = (date: string, shift: string, stationId: number) =>
    assignments.find(a => a.date === date && a.shift === shift && a.stationId === stationId);
  // Descriptions of approved machine requests whose tester is named in this cell's
  // experimenter field (comma-separated names) on the same day.
  const descriptionsFor = (date: string, experimenter: string | null | undefined) => {
    const names = (experimenter ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    return testerRequests.filter(r => r.date === date && names.includes(r.testerName));
  };
  const orderedStations = stations.slice().sort((a, b) => a.position - b.position);

  return (
    <div className="surface-card scroll-thin overflow-x-auto">
      <table className="table-shell">
        <thead>
          <tr>
            <th className="th-cell sticky start-0 z-20 w-52 text-start" colSpan={2}>
              {t('shiftStationHeader')}
            </th>
            {dates.map(d => (
              <th key={d} className="th-cell text-center">
                {dayName(d, lang)}
                <div className="text-[11px] font-normal tracking-normal text-slate-400 normal-case">{formatDate(d)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orderedStations.flatMap((station, si) =>
            (['morning', 'evening'] as const).map((shift, shi) => (
              <tr key={`${station.id}-${shift}`} className="odd:bg-white even:bg-slate-50/40">
                {shi === 0 && (
                  <td
                    rowSpan={2}
                    className={`td-cell sticky start-0 z-10 w-28 align-top font-semibold whitespace-nowrap text-slate-700 ${pressLabelClass(
                      si
                    )}`}
                  >
                    {station.name}
                  </td>
                )}
                <td
                  className={`td-cell sticky start-28 z-10 w-24 font-semibold whitespace-nowrap text-slate-600 ${pressRowClass(
                    si
                  )}`}
                >
                  {shiftLabel(lang, shift)}
                </td>
                {dates.map(date => {
                  const a = cell(date, shift, station.id);
                  const mine = a && a.technicianId !== null && a.technicianId === highlightTechId;
                  const hasContent = a && (a.technicianId !== null || a.experimenter || a.note);
                  const cellColorClass = colorClass(a?.color);
                  const empty = !hasContent && !cellColorClass;
                  const bgClass = cellColorClass || (empty ? 'bg-rose-50/60' : mine ? 'bg-brand-50' : pressRowClass(si));
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
                          {descriptionsFor(date, a.experimenter).map(r => (
                            <div key={`${r.testerName}-${r.date}`} className="text-[11px] font-normal text-slate-400 italic">
                              {r.description}
                            </div>
                          ))}
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
