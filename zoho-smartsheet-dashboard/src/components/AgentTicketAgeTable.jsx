import React, { useState } from 'react';

export default function AgentTicketAgeTable({
  membersData,
  onClose,
  selectedAges = ["sevenDays", "twoWeeks", "month"], // Show all by default
  showTimeDropdown
}) {
  const [hoveredRowIndex, setHoveredRowIndex] = useState(null);

  // Age columns config (add sevenDays)
  const ageColumns = [
    { key: "sevenDays", label: "1-7 Days Tickets" },
    { key: "twoWeeks", label: "14 - 30 Days Tickets" },
    { key: "month", label: "30+ Days Tickets" }
  ];
  const visibleAgeColumns = ageColumns.filter(col => selectedAges.includes(col.key));
  const columnsToShow = [
    { key: "name", label: "Agent Name" },
    { key: "total", label: "Total Ticket Count" },
    ...(visibleAgeColumns.length > 0 ? visibleAgeColumns : [ageColumns[0]])
  ];
  
  // Map rows, including the new 1-7 Days column
  const tableRows = membersData
    .map(agent => {
      const tickets = agent.tickets || {};
      const total =
        (tickets.open || 0) +
        (tickets.hold || 0) +
        (tickets.escalated || 0) +
        (tickets.unassigned || 0) +
        (tickets.inProgress || 0);
      return {
        name: agent.name,
        total,
        sevenDays: agent.ticketsBetweenOneAndSevenDays || 0, // NEW COLUMN
        twoWeeks: agent.ticketsBetweenTwoWeeksAndMonth || 0,
        month: agent.ticketsOlderThanMonth || 0,
      };
    })
    .filter(row => row.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const cellStyle3D = {
    padding: 14,
    fontWeight: 700,
    borderRadius: 12,
    background: 'linear-gradient(135deg, #23272f 60%, #15171a 100%)',
    color: '#f4f4f4',
    borderTop: '2px solid #4070d6',  // blue
    borderLeft: '2px solid #3a65ca', // blue
    borderBottom: '2.5px solid #1c2a5f', // dark blue
    borderRight: '2.5px solid #162158',   // dark blue
    transition: 'background 0.18s',
    cursor: 'pointer'
  };

  const cellStyle3DHovered = {
    ...cellStyle3D,
    background: 'linear-gradient(135deg, #2446a3 60%, #293956 100%)',
    color: '#fff'
  };

  const headerStyle3D = {
    padding: 14,
    textAlign: 'center',
    fontWeight: 900,
    background: 'linear-gradient(135deg, #3752a6 70%, #23355a 100%)',
    color: '#fff',
    borderTop: '2px solid #5375ce',
    borderLeft: '2px solid #6d90e5',
    borderBottom: '2px solid #1e2950',
    borderRight: '2px solid #182345',
    borderRadius: '12px 12px 0 0'
  };

  React.useEffect(() => {
    const handleDoubleClick = () => {
      if (onClose) onClose();
    };
    window.addEventListener('dblclick', handleDoubleClick);
    return () => window.removeEventListener('dblclick', handleDoubleClick);
  }, [onClose]);

  return (
    <div style={{ margin: '24px auto', maxWidth: 1400, position: 'relative' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'separate',
        borderRadius: 16,
        border: '2px solid #32406b',
        fontSize: 18
      }}>
        <thead>
          <tr>
            {columnsToShow.map(col => (
              <th key={col.key} style={headerStyle3D}>
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
                color: '#dedede',
                fontSize: 19,
                background: 'linear-gradient(110deg, #181b26 80%, #16171a 100%)',
                borderRadius: 14
              }}>
                No data available
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
                {columnsToShow.map(col => (
                  <td
                    key={col.key}
                    style={hoveredRowIndex === rowIndex
                      ? { ...cellStyle3DHovered, textAlign: col.key === "name" ? 'left' : 'center' }
                      : { ...cellStyle3D, textAlign: col.key === "name" ? 'left' : 'center' }
                    }
                    onMouseEnter={() => setHoveredRowIndex(rowIndex)}
                    onMouseLeave={() => setHoveredRowIndex(null)}
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
