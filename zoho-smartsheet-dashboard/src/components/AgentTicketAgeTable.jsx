import React from 'react';

export default function AgentTicketAgeTable({
  membersData,
  onClose,
  selectedAges = ["twoWeeks", "month"],
  showTimeDropdown
}) {
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
        twoWeeks: agent.ticketsBetweenTwoWeeksAndMonth || 0,
        month: agent.ticketsOlderThanMonth || 0,
      };
    })
    .filter(row => row.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  // columns config
  const ageColumns = [
    { key: "twoWeeks", label: "14 - 30 Days  Tickets" },
    { key: "month", label: "30+ Days  Tickets" }
  ];

  // filter columns to show only selected
  const columnsToShow = [
    { key: "name", label: "Agent Name" },
    { key: "total", label: "Total Ticket Count" },
    ...ageColumns.filter(col => selectedAges.includes(col.key))
  ];

  return (
    <div style={{ margin: '14px auto', maxWidth: 1400, position: 'relative' }}>
      {/* Close button overlays the corner, only shown if Time dropdown is not open */}
      {!showTimeDropdown && onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            right: 12,
            top: 12,
            background: '#bd2331',
            color: 'white',
            border: '5px solid #bd2331',
            borderRadius: '50%',
            width: 26,
            height: 26,
            fontSize: 16,
            fontWeight: 900,
            cursor: 'pointer',
            boxShadow: '0 2px 8px #1e448960, 0 1px 8px #fff5 inset',
            transition: 'background 0.18s, box-shadow 0.18s, color 0.18s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
          }}
          aria-label="Close table"
        >
          ×
        </button>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #1e4489', fontSize: 18 }}>
        <thead>
          <tr style={{ background: '#1E4489', color: 'white', fontWeight: 900 }}>
            {columnsToShow.map(col => (
              <th
                style={{
                  border: '1px solid Black',
                  padding: 10,
                  textAlign: 'center', // always center header (including Agent Name)
                  verticalAlign: 'middle',
                  fontWeight: 900
                }}
                key={col.key}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows.map(row => (
            <tr
              key={row.name}
              style={{
                background: 'Black',
                color: 'white',
                fontSize: 16,
                fontWeight: 700,
                borderBottom: '1px solid Black'
              }}
            >
              {columnsToShow.map(col => (
                <td
                  style={{
                    border: '1px solid #606060',
                    padding: 10,
                    // Agent name cells left, others center
                    textAlign: col.key === "name" ? 'left' : 'center',
                    verticalAlign: 'middle',
                    fontWeight: 700
                  }}
                  key={col.key}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
