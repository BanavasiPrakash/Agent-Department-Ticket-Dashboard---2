import React, { useEffect, useMemo, useState } from 'react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';

export default function AgentTicketAgeTable({
  membersData,
  onClose,
  selectedAges = ["fifteenDays", "sixteenToThirty", "month"],
  selectedStatuses = [],
  showTimeDropdown,
  selectedDepartmentId,
  selectedAgentNames = [],
  departmentsMap = {},
  departmentViewEnabled,
  setDepartmentViewEnabled
}) {
  const [hoveredRowIndex, setHoveredRowIndex] = useState(null);

  const ageColumns = [
    { key: "fifteenDays", label: "1-15 Days Tickets", ageProp: "BetweenOneAndFifteenDays" },
    { key: "sixteenToThirty", label: "16-30 Days Tickets", ageProp: "BetweenSixteenAndThirtyDays" },
    { key: "month", label: "30+ Days Tickets", ageProp: "OlderThanThirtyDays" }
  ];

  const visibleAgeColumns = ageColumns.filter(col => selectedAges.includes(col.key));

  const columnsToShow = [
    { key: "serial", label: "SI. NO." },
    { key: "name", label: "Agent Name" },
    ...(selectedDepartmentId ? [{ key: "department", label: "Department" }] : []),
    { key: "total", label: "Total Ticket Count" },
    ...visibleAgeColumns
  ];

  const statusPalette = {
    open: "#bd2331",
    hold: "#ffc107",
    inProgress: "#8fc63d",
    escalated: "#ef6724"
  };

  const bubbleBaseStyle = {
    background: "#1e2342",
    borderRadius: "14px",
    color: "white",
    fontWeight: 900,
    fontSize: 22,
    padding: "7px 0",
    minWidth: 40,
    minHeight: 36,
    margin: "2px 4px",
    textAlign: "center",
    boxShadow: "0 2px 8px #1e448949",
    display: "inline-block",
  };

  const bubbleBorderTopColors = {
    open: "5px solid #bd2331",
    hold: "5px solid #ffc107",
    inProgress: "5px solid #8fc63d",
    escalated: "5px solid #ef6724",
  };

  const statusOrder = ['open', 'hold', 'inProgress', 'escalated'];

  const statusKeys = selectedStatuses && selectedStatuses.length > 0
    ? selectedStatuses.map(st => st.value)
    : [];

  const departmentRows = useMemo(() => {
    if (!departmentViewEnabled) return null;
    const byDept = {};
    Object.entries(departmentsMap).forEach(([deptId, info]) => {
      byDept[deptId] = {
        departmentName: info.name || deptId,
        ticketSet: new Set(),
        tickets_1_7_open: 0,
        tickets_1_7_hold: 0,
        tickets_1_7_inProgress: 0,
        tickets_1_7_escalated: 0,
        tickets_8_15_open: 0,
        tickets_8_15_hold: 0,
        tickets_8_15_inProgress: 0,
        tickets_8_15_escalated: 0,
        tickets_15plus_open: 0,
        tickets_15plus_hold: 0,
        tickets_15plus_inProgress: 0,
        tickets_15plus_escalated: 0,
      };
    });
    (membersData || []).forEach(agent => {
      Object.entries(agent.departmentAgingCounts || {}).forEach(([deptId, agingCounts]) => {
        if (!byDept[deptId]) return;
        statusOrder.forEach(status => {
          (agingCounts[`${status}BetweenOneAndSevenDaysTickets`] || []).forEach(() => {
            byDept[deptId][`tickets_1_7_${status}`] += 1;
          });
          (agingCounts[`${status}BetweenEightAndFifteenDaysTickets`] || []).forEach(() => {
            byDept[deptId][`tickets_8_15_${status}`] += 1;
          });
          (agingCounts[`${status}OlderThanFifteenDaysTickets`] || []).forEach(() => {
            byDept[deptId][`tickets_15plus_${status}`] += 1;
          });
        });
      });
    });
    const sortedRows = Object.entries(byDept)
      .map(([deptId, data]) => ({
        ...data,
        total:
          data.tickets_1_7_open + data.tickets_1_7_hold + data.tickets_1_7_inProgress + data.tickets_1_7_escalated +
          data.tickets_8_15_open + data.tickets_8_15_hold + data.tickets_8_15_inProgress + data.tickets_8_15_escalated +
          data.tickets_15plus_open + data.tickets_15plus_hold + data.tickets_15plus_inProgress + data.tickets_15plus_escalated
      }))
      .sort((a, b) => a.departmentName.localeCompare(b.departmentName, undefined, { sensitivity: 'base' }))
      .map((row, idx) => ({
        si: idx + 1,
        ...row
      }));
    return sortedRows;
  }, [membersData, departmentsMap, departmentViewEnabled]);

  const tableRows = (membersData || [])
    .filter(agent => {
      if (selectedDepartmentId) {
        const agentHasTickets =
          (agent.departmentTicketCounts?.[selectedDepartmentId] || 0) > 0 ||
          Object.values(agent.departmentAgingCounts?.[selectedDepartmentId] || {}).some(v => v > 0);
        const nameMatch = !selectedAgentNames.length || selectedAgentNames.includes(agent.name.trim());
        return agentHasTickets && nameMatch;
      } else {
        const t = agent.tickets || {};
        return (t.open || 0) + (t.hold || 0) + (t.escalated || 0) + (t.unassigned || 0) + (t.inProgress || 0) > 0;
      }
    })
    .map(agent => {
      let agingCounts = {};
      if (selectedDepartmentId) {
        agingCounts = agent.departmentAgingCounts?.[selectedDepartmentId] || {};
      } else if (agent.tickets) {
        agingCounts = agent.tickets;
      }
      return {
        name: agent.name,
        agingCounts,
        departmentAgingCounts: agent.departmentAgingCounts,
        departmentName: selectedDepartmentId ? (departmentsMap?.[selectedDepartmentId]?.name || selectedDepartmentId) : ""
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const cellStyle3D = {
    padding: 14,
    fontWeight: 700,
    borderRadius: 12,
    background: 'linear-gradient(135deg, #23272f 60%, #15171a 100%)',
    color: 'white',
    borderTop: '2px solid #1E4489',
    borderLeft: '2px solid #1E4489',
    borderBottom: '2.5px solid #1E4489',
    borderRight: '2.5px solid #1E4489',
    transition: 'background 0.18s',
    cursor: 'pointer'
  };

  const serialHeaderStyle = {
    ...cellStyle3D,
    width: 30,
    minWidth: 30,
    maxWidth: 40,
    textAlign: 'center',
    position: 'sticky',
    top: 0,
    zIndex: 2,
    fontWeight: 900,
    background: 'linear-gradient(135deg, #1E4489 70%, #1E4489 100%)'
  };

  const cellStyle3DHovered = {
    ...cellStyle3D,
    background: 'linear-gradient(135deg, #1E4489 60%, #1E4489 100%)',
    color: 'white'
  };

  const headerStyle3D = {
    padding: 14,
    textAlign: 'center',
    fontWeight: 900,
    background: 'linear-gradient(135deg, #1E4489 70%, #1E4489 100%)',
    color: 'white',
    borderTop: '2px solid #5375ce',
    borderLeft: '2px solid #6d90e5',
    borderBottom: '2px solid #1e2950',
    borderRight: '2px solid #182345',
    borderRadius: '12px 12px 0 0',
    position: 'sticky',
    top: 0,
    zIndex: 2,
  };

  useEffect(() => {
    const handleDoubleClick = () => {
      if (onClose) onClose();
    };
    window.addEventListener('dblclick', handleDoubleClick);
    return () => window.removeEventListener('dblclick', handleDoubleClick);
  }, [onClose]);

  function aggregateTickets(agent, ageProp, status) {
    if (!selectedDepartmentId && agent.departmentAgingCounts) {
      return Object.values(agent.departmentAgingCounts).flatMap(age =>
        age?.[status + ageProp + 'Tickets'] || []
      );
    }
    return selectedDepartmentId && agent.departmentAgingCounts?.[selectedDepartmentId]
      ? agent.departmentAgingCounts[selectedDepartmentId][status + ageProp + 'Tickets'] || []
      : [];
  }

  function countFromArray(agent, ageProp, status) {
    return aggregateTickets(agent, ageProp, status).length;
  }

  return (
    <div>
      <div
        className="no-scrollbar"
        style={{
          margin: '24px auto',
          maxWidth: 1400,
          position: 'relative',
          maxHeight: 549,
          overflowY: 'auto',
          borderRadius: 16,
          border: '2px solid #32406b',
          background: '#16171a'
        }}
      >
        {departmentViewEnabled ? (
          <table style={{ width: '100%', borderCollapse: 'separate', borderRadius: 16, fontSize: 18 }}>
            <thead>
              <tr>
                <th style={serialHeaderStyle}>SI. NO.</th>
                <th style={headerStyle3D}>Department Name</th>
                <th style={headerStyle3D}>Total Ticket Count</th>
                <th style={headerStyle3D}>1 - 7 Tickets</th>
                <th style={headerStyle3D}>8 - 15 Tickets</th>
                <th style={headerStyle3D}>15+ Tickets</th>
              </tr>
            </thead>
            <tbody>
              {(!departmentRows || departmentRows.length === 0) ? (
                <tr>
                  <td colSpan={6} style={{
                    textAlign: 'center',
                    padding: 28,
                    color: 'WHITE',
                    fontSize: 19,
                    background: 'linear-gradient(110deg, #181b26 80%, #16171a 100%)',
                    borderRadius: 14
                  }}>
                    No department ticket data available
                  </td>
                </tr>
              ) : (
                departmentRows.map(row => (
                  <tr
                    key={row.departmentName}
                    style={{
                      background: 'linear-gradient(120deg, #16171a 82%, #232d3d 100%)',
                      color: 'white',
                      fontSize: 17,
                      fontWeight: 700,
                      borderBottom: '2px solid #2b3243'
                    }}
                  >
                    <td style={{ ...cellStyle3D, textAlign: 'center' }}>{row.si}</td>
                    <td style={{ ...cellStyle3D, textAlign: 'left' }}>{row.departmentName}</td>
                    <td style={{ ...cellStyle3D, textAlign: 'center' }}>{row.total}</td>
                    <td style={{ ...cellStyle3D, textAlign: 'center' }}>
                      {statusKeys.length === 0 ? (
                        (row[`tickets_1_7_open`] || 0)
                          + (row[`tickets_1_7_hold`] || 0)
                          + (row[`tickets_1_7_inProgress`] || 0)
                          + (row[`tickets_1_7_escalated`] || 0)
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: "4px" }}>
                          {statusOrder
                            .filter(status => statusKeys.includes(status))
                            .map(status => (
                              <Tippy
                                key={status}
                                content={
                                  row[`tickets_1_7_${status}`] > 0
                                    ? (aggregateTickets(row, "BetweenOneAndSevenDays", status).join(', '))
                                    : "No tickets"
                                }
                              >
                                <span
                                  style={{
                                    ...bubbleBaseStyle,
                                    borderTop: bubbleBorderTopColors[status]
                                  }}
                                >
                                  {row[`tickets_1_7_${status}`]}
                                </span>
                              </Tippy>
                            ))
                          }
                        </div>
                      )}
                    </td>
                    <td style={{ ...cellStyle3D, textAlign: 'center' }}>
                      {statusKeys.length === 0 ? (
                        (row[`tickets_8_15_open`] || 0)
                          + (row[`tickets_8_15_hold`] || 0)
                          + (row[`tickets_8_15_inProgress`] || 0)
                          + (row[`tickets_8_15_escalated`] || 0)
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: "4px" }}>
                          {statusOrder
                            .filter(status => statusKeys.includes(status))
                            .map(status => (
                              <Tippy
                                key={status}
                                content={
                                  row[`tickets_8_15_${status}`] > 0
                                    ? (aggregateTickets(row, "BetweenEightAndFifteenDays", status).join(', '))
                                    : "No tickets"
                                }
                              >
                                <span
                                  style={{
                                    ...bubbleBaseStyle,
                                    borderTop: bubbleBorderTopColors[status]
                                  }}
                                >
                                  {row[`tickets_8_15_${status}`]}
                                </span>
                              </Tippy>
                            ))
                          }
                        </div>
                      )}
                    </td>
                    <td style={{ ...cellStyle3D, textAlign: 'center' }}>
                      {statusKeys.length === 0 ? (
                        (row[`tickets_15plus_open`] || 0)
                          + (row[`tickets_15plus_hold`] || 0)
                          + (row[`tickets_15plus_inProgress`] || 0)
                          + (row[`tickets_15plus_escalated`] || 0)
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: "4px" }}>
                          {statusOrder
                            .filter(status => statusKeys.includes(status))
                            .map(status => (
                              <Tippy
                                key={status}
                                content={
                                  row[`tickets_15plus_${status}`] > 0
                                    ? (aggregateTickets(row, "OlderThanFifteenDays", status).join(', '))
                                    : "No tickets"
                                }
                              >
                                <span
                                  style={{
                                    ...bubbleBaseStyle,
                                    borderTop: bubbleBorderTopColors[status]
                                  }}
                                >
                                  {row[`tickets_15plus_${status}`]}
                                </span>
                              </Tippy>
                            ))
                          }
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'separate', borderRadius: 16, fontSize: 18 }}>
            <thead>
              <tr>
                {columnsToShow.map(col => (
                  <th
                    key={col.key}
                    style={col.key === "serial" ? serialHeaderStyle : headerStyle3D}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={columnsToShow.length} style={{
                    textAlign: 'center',
                    padding: 28,
                    color: 'WHITE',
                    fontSize: 19,
                    background: 'linear-gradient(110deg, #181b26 80%, #16171a 100%)',
                    borderRadius: 14
                  }}>
                    {selectedDepartmentId && departmentsMap?.[selectedDepartmentId]?.name
                      ? <>Looks like the <span style={{ fontWeight: 700 }}>{departmentsMap[selectedDepartmentId].name}</span> department has no tickets right now.</>
                      : "No data available"}
                  </td>
                </tr>
              ) : (
                tableRows.map((row, rowIndex) => (
                  <tr
                    key={row.name}
                    style={{
                      background: hoveredRowIndex === rowIndex
                        ? 'linear-gradient(120deg, #2446a3 85%, #293956 100%)'
                        : 'linear-gradient(120deg, #16171a 82%, #232d3d 100%)',
                      color: 'white',
                      fontSize: 17,
                      fontWeight: 700,
                      borderBottom: '2px solid #2b3243'
                    }}
                  >
                    <td
                      style={{
                        ...(hoveredRowIndex === rowIndex ? cellStyle3DHovered : cellStyle3D),
                        width: 30,
                        minWidth: 30,
                        maxWidth: 40,
                        textAlign: 'center'
                      }}
                    >
                      {rowIndex + 1}
                    </td>
                    <td
                      style={hoveredRowIndex === rowIndex ? { ...cellStyle3DHovered, textAlign: 'left' } : { ...cellStyle3D, textAlign: 'left' }}
                      onMouseEnter={() => setHoveredRowIndex(rowIndex)}
                      onMouseLeave={() => setHoveredRowIndex(null)}
                    >
                      {row.name}
                    </td>
                    {selectedDepartmentId && (
                      <td style={hoveredRowIndex === rowIndex ? cellStyle3DHovered : cellStyle3D}>
                        {row.departmentName}
                      </td>
                    )}
                    <td
                      style={hoveredRowIndex === rowIndex ? { ...cellStyle3DHovered, textAlign: 'center' } : { ...cellStyle3D, textAlign: 'center' }}
                    >
                      {visibleAgeColumns.reduce((sum, col) => (
                        sum +
                        countFromArray(row, col.ageProp, 'open') +
                        countFromArray(row, col.ageProp, 'hold') +
                        countFromArray(row, col.ageProp, 'inProgress') +
                        countFromArray(row, col.ageProp, 'escalated')
                      ), 0)}
                    </td>
                    {visibleAgeColumns.map(col => (
                      <td
                        key={col.key}
                        style={hoveredRowIndex === rowIndex ? { ...cellStyle3DHovered, textAlign: 'center' } : { ...cellStyle3D, textAlign: 'center' }}
                      >
                        {(statusKeys.length === 0 || (statusKeys.length === 1 && statusKeys[0] === "total")) ? (
                          <Tippy content={
                            (() => {
                              const open = aggregateTickets(row, col.ageProp, 'open');
                              const hold = aggregateTickets(row, col.ageProp, 'hold');
                              const inProgress = aggregateTickets(row, col.ageProp, 'inProgress');
                              const escalated = aggregateTickets(row, col.ageProp, 'escalated');
                              const arr = [...open, ...hold, ...inProgress, ...escalated];
                              return arr.length ? arr.join(', ') : "No tickets";
                            })()
                          }>
                            <span style={{ cursor: 'pointer', display: 'inline-block', padding: '4px' }}>
                              {
                                countFromArray(row, col.ageProp, 'open') +
                                countFromArray(row, col.ageProp, 'hold') +
                                countFromArray(row, col.ageProp, 'inProgress') +
                                countFromArray(row, col.ageProp, 'escalated')
                              }
                            </span>
                          </Tippy>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            {statusOrder
                              .filter(status => statusKeys.includes(status))
                              .map(status => {
                                const val = countFromArray(row, col.ageProp, status);
                                const ticketNumbers = aggregateTickets(row, col.ageProp, status);
                                return (
                                  <Tippy
                                    key={status}
                                    content={
                                      ticketNumbers.length
                                        ? ticketNumbers.join(', ')
                                        : "No tickets"
                                    }
                                  >
                                    <span
                                      style={{
                                        ...bubbleBaseStyle,
                                        borderTop: bubbleBorderTopColors[status]
                                      }}
                                    >
                                      {val}
                                    </span>
                                  </Tippy>
                                );
                              })}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
